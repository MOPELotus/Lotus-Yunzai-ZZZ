import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createZzzRoleGallery, type ZzzRoleGalleryContext } from "./role-gallery.ts";

test("角色图库逐段发送原图，只给已确认编号登记删除回执", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-zzz-gallery-batches-"));
  const role = "安比", id = "1011";
  const atlas = join(root, "atlas"), gallery = join(root, "gallery");
  const directory = join(gallery, "zzz-character", role);
  const previousRedis = globalThis.redis;
  const previousAtlas = Bun.env.LOTUS_ATLAS_DATA_DIR;
  const previousGallery = Bun.env.LOTUS_CHARACTER_GALLERY_DIR;
  const previousLegacy = Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR;
  const state = new Map<string, string>();
  globalThis.redis = {
    async get(key: string) { return state.get(key); },
    async set(key: string, value: string) { state.set(key, value); return "OK"; },
    async eval(_script: string, { keys, arguments: [pending, confirmed] }: { keys: string[]; arguments: [string, string, string] }) {
      const key = keys[0]!;
      if (state.get(key) !== pending) return 0;
      state.set(key, confirmed);
      return 1;
    },
  } as unknown as NonNullable<typeof globalThis.redis>;
  const context = {
    self_id: 99, user_id: 42, message_type: "private", adapter: "milky", isBotMaster: () => true,
    privateCredentialSignal: new AbortController().signal, characterGallerySignal: new AbortController().signal, inlineImageByteLimit: 10,
  } satisfies ZzzRoleGalleryContext;
  const list = { kind: "list", role, page: 1 } as const;
  // The gallery preserves original bytes. Its reader only checks the raster signature and size.
  const files = [1, 2, 3].map(number => {
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, number]);
    const filename = `lotus-${createHash("sha256").update(bytes).digest("hex")}.png`;
    return { filename, bytes };
  }).sort((a, b) => a.filename.localeCompare(b.filename, "zh-CN"));

  try {
    Bun.env.LOTUS_ATLAS_DATA_DIR = atlas;
    Bun.env.LOTUS_CHARACTER_GALLERY_DIR = gallery;
    delete Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR;
    await mkdir(atlas);
    await mkdir(directory, { recursive: true });
    await writeFile(join(atlas, "map.json"), JSON.stringify({ games: { zzz: { locales: { zh: { pages: {
      character: { version: "3.3", recordCount: 1, records: { [id]: { id, name: role, path: `items/${id}.json` } } },
    } } } } } }));
    const handle = createZzzRoleGallery(new AbortController().signal);
    const grants = () => JSON.parse([...state.values()][0]!);
    for (const outcome of ["sent", "rejected", "unknown"] as const) {
      await Promise.all(files.map(({ filename, bytes }) => writeFile(join(directory, filename), bytes)));
      let attempts = 0;
      const result = await handle({ ...context, async forward(nodes) {
        attempts++;
        expect(nodes[0]).toContain(`第 ${attempts}/3 段`);
        const node = nodes[1];
        if (!node || typeof node === "string") throw new Error("缺少原图节点");
        expect(node[0]).toBe(`ID：${attempts}`);
        expect(node[1].file).toEqual(files[attempts - 1]!.bytes);
        if (attempts === 1) expect([...state.values()][0]).toStartWith("待回执:");
        if (attempts === 2) {
          expect(grants()["1"]).toBe(files[0]!.filename);
          expect(grants()["2"]).toBeUndefined();
          if (outcome === "rejected") return false;
          if (outcome === "unknown") throw new Error("回执未确认");
        }
        return true;
      } }, list);
      if (outcome === "sent") {
        expect(result).toEqual([]);
        expect(attempts).toBe(3);
        expect(grants()["3"]).toBe(files[2]!.filename);
      } else {
        expect(result).toContain(outcome === "rejected" ? "第 2 段角色图合并转发未发送" : "第 2 段角色图合并转发结果未确认");
        expect(attempts).toBe(2);
        expect(grants()["2"]).toBeUndefined();
        expect(grants()["3"]).toBeUndefined();
        expect(await handle(context, { kind: "remove", role, ids: [1, 2, 3] })).toBe(
          "已删除角色图 ID 1。\nID 2、3 无法删除，请重新查看对应页。旧图库和外部资源只读。",
        );
      }
    }

    await writeFile(join(directory, files[0]!.filename), files[0]!.bytes);
    let oldAttempts = 0;
    let latest = "";
    const superseded = await handle({ ...context, async forward() {
      oldAttempts++;
      await handle({ ...context, async forward() { return false; } }, list);
      latest = [...state.values()][0]!;
      return true;
    } }, list);
    expect(superseded).toContain("本页删除回执未登记");
    expect(oldAttempts).toBe(1);
    expect(latest).toStartWith("待回执:");
    expect([...state.values()][0]).toBe(latest);
  } finally {
    globalThis.redis = previousRedis;
    if (previousAtlas === undefined) delete Bun.env.LOTUS_ATLAS_DATA_DIR;
    else Bun.env.LOTUS_ATLAS_DATA_DIR = previousAtlas;
    if (previousGallery === undefined) delete Bun.env.LOTUS_CHARACTER_GALLERY_DIR;
    else Bun.env.LOTUS_CHARACTER_GALLERY_DIR = previousGallery;
    if (previousLegacy === undefined) delete Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR;
    else Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR = previousLegacy;
    await rm(root, { recursive: true, force: true });
  }
});
