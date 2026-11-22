import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAtlasCatalog } from "@lotus-yunzai/atlas/catalog";
import { panelSpriteName } from "./panel-artwork.ts";
import { buildZzzPanelDetail } from "./panel-detail.ts";
import { createZzzAtlasPortraitReader, loadZzzAtlasPanelOriginal, loadZzzRandomGalleryPortrait, readZzzPanelOriginal } from "./panel-original.ts";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQIW2P8/x8AAwMCAO+a2e8AAAAASUVORK5CYII=", "base64");

test("旧驱动盘素材保留文件名中的连接符并限制为单个文件名", () => {
  expect(panelSpriteName("SuitBranch&BladeSong")).toBe("SuitBranch&BladeSong");
  expect(panelSpriteName("../SuitBranch&BladeSong")).toBeUndefined();
  expect(panelSpriteName("套装/SuitBranch&BladeSong")).toBeUndefined();
});

test("图库仅从给定角色文件夹取可读图，回执区分图库挂载与安装副本", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-zzz-random-gallery-"));
  try {
    const gallery = join(root, "zzz-character");
    const resources = join(root, "resources");
    const role = "角色甲";
    await mkdir(join(gallery, role), { recursive: true });
    await mkdir(join(gallery, "角色乙"));
    await mkdir(join(resources, "images", "panel", role), { recursive: true });
    await writeFile(join(gallery, role, "损坏.webp"), "damaged");
    const valid = join(gallery, role, "立绘.png");
    await writeFile(valid, png);
    await writeFile(join(gallery, "角色乙", "立绘.png"), png);
    await symlink(join(gallery, "角色乙"), join(gallery, "错误目录"), "dir");
    await symlink(join(gallery, "角色乙", "立绘.png"), join(gallery, role, "跨角色.png"));
    await writeFile(join(resources, "images", "panel", role, "立绘.png"), png);
    const selected = await loadZzzRandomGalleryPortrait(gallery, [role]);
    expect(selected?.original).toMatchObject({ path: `${role}/立绘.png`, gallery: true });
    expect(await readZzzPanelOriginal(resources, selected!.original, undefined, gallery)).toEqual(png);
    const retained = join(root, "retained");
    await mkdir(join(retained, role), { recursive: true });
    await writeFile(join(retained, selected!.original.path), png);
    expect(await readZzzPanelOriginal(resources, selected!.original)).toBeUndefined();
    expect(await loadZzzRandomGalleryPortrait(gallery, ["错误目录", "../角色乙"])).toBeUndefined();
    await rm(valid);
    await symlink(join(gallery, "角色乙", "立绘.png"), valid);
    expect(await loadZzzRandomGalleryPortrait(gallery, [role])).toBeUndefined();
    expect(await readZzzPanelOriginal(resources, selected!.original, undefined, gallery)).toBeUndefined();
    expect(await readZzzPanelOriginal(resources, selected!.original, undefined, [gallery, retained])).toEqual(png);
    const installed = await loadZzzRandomGalleryPortrait(resources, [role], true);
    expect(installed?.original.path).toBe(`images/panel/${role}/立绘.png`);
    expect(await readZzzPanelOriginal(resources, installed!.original)).toEqual(png);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

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
