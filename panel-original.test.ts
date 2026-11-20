import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAtlasCatalog } from "@lotus-yunzai/atlas/catalog";
import { buildZzzPanelDetail } from "./panel-detail.ts";
import { createZzzAtlasPortraitReader, loadZzzAtlasPanelOriginal, readZzzPanelOriginal } from "./panel-original.ts";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQIW2P8/x8AAwMCAO+a2e8AAAAASUVORK5CYII=", "base64");

test("图鉴回退按角色编号核对，并按送达时的图鉴路径与哈希读取原字节", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-zzz-panel-gallery-"));
  try {
    await mkdir(join(root, "items"));
    await mkdir(join(root, "gallery", "zzz"), { recursive: true });
    const records = [1521, 1591, 1621].map(id => ({
      id: String(id), name: "同名", path: `items/${id}.json`,
    }));
    const character = { version: "3.3", recordCount: records.length, records: Object.fromEntries(records.map(record => [record.id, record])) };
    await writeFile(join(root, "map.json"), JSON.stringify({ games: { zzz: { locales: { zh: { pages: { character } } } } } }));
    for (const record of records) {
      const localPath = `gallery/zzz/IconRole${record.id}.png`;
      const images = [{ status: "downloaded", fieldPath: "detail.icon", placeholder: record.id !== "1521", localPath }];
      const meta = { version: "3.3", gameId: "zzz", pageId: "character", recordId: record.id, images };
      const content = { detail: { name: record.name } };
      await writeFile(join(root, record.path), JSON.stringify({ meta, content }));
      await writeFile(join(root, localPath), png);
    }
    const read = createZzzAtlasPortraitReader(createAtlasCatalog(root));
    const selected = await loadZzzAtlasPanelOriginal(read, 1521);
    expect(selected?.original).toMatchObject({ atlasRole: 1521, path: "gallery/zzz/IconRole1521.png" });
    expect(await readZzzPanelOriginal(undefined, selected!.original, read)).toEqual(png);
    expect(await readZzzPanelOriginal(undefined, { ...selected!.original, atlasRole: 1591 }, read)).toBeUndefined();
    expect(await readZzzPanelOriginal(undefined, { ...selected!.original, path: "gallery/zzz/IconRole1591.png" }, read)).toBeUndefined();
    expect(await loadZzzAtlasPanelOriginal(read, 1621)).toBeUndefined();
    expect(await loadZzzAtlasPanelOriginal(read, 1601)).toBeUndefined();
    await writeFile(join(root, selected!.original.path), Buffer.concat([png, Buffer.from([0])]));
    expect(await readZzzPanelOriginal(undefined, selected!.original, read)).toBeUndefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("保留已绑定角色档案的七位服装编号", () => {
  const avatar = { id: 1631, name_mi18n: "赛维里安", level: 60, rank: 0, rarity: "S" as const,
    role_vertical_painting_url: "https://example.invalid/role_vertical_painting_1631_3116311.png" };
  expect(buildZzzPanelDetail(avatar).skinId).toBe(3116311);
  expect(buildZzzPanelDetail({ ...avatar, skin_id: "3116310" }).skinId).toBe(3116310);
  expect(buildZzzPanelDetail({ ...avatar, role_vertical_painting_url: "https://example.invalid/role_vertical_painting_1621_3116311.png" }).skinId).toBeUndefined();
});
