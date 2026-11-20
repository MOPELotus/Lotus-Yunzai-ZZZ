import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { zzzTuningPools, type ZzzTuningSnapshot } from "@lotus-yunzai/hoyo-client";
import { readZzzLegacyGachaSources } from "./gacha-legacy.ts";
import { createZzzTuningSync } from "./tuning-sync.ts";

const qq = "42";
const uid = "123456789";
const region = "prod_gf_cn";
const role = { uid, region } as const;
const firstId = "9223372036854775806";
const secondId = "9223372036854775807";

async function fixture(run: (workspace: string) => Promise<void>) {
  const workspace = await mkdtemp(join(tmpdir(), "lotus-zzz-migration-"));
  try {
    await run(workspace);
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
}

async function json(file: string, document: object) {
  const bytes = JSON.stringify(document, null, 2) + "\r\n";
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return bytes;
}

function draw(id: string, fields: object = {}) {
  return {
    uid, id, gacha_id: "0", gacha_type: "2", item_id: "14101", count: "1",
    time: "2026-04-03 04:05:06", name: "旧逐抽", lang: "zh-cn", item_type: "代理人", rank_type: "4", ...fields,
  };
}

test("合并两处退役逐抽、保留精确序号，现用档案优先且原文件不写入", () => fixture(async workspace => {
  const current = join(workspace, "current");
  const roots = [join(workspace, "old"), join(workspace, "renamed")];
  const old = join(roots[0]!, qq, uid + ".json");
  const renamed = join(roots[1]!, qq, uid + ".json");
  const authoritative = join(current, qq, uid + ".json");
  const olderBytes = await json(old, { "独家频段": [draw(firstId)] });
  const newerBytes = await json(renamed, {
    "独家频段": [draw(firstId, { gacha_id: "501" }), draw(secondId, { item_id: "14102" })],
  });

  expect(await readZzzLegacyGachaSources(current, roots, "43", uid)).toBeUndefined();
  const restored = await readZzzLegacyGachaSources(current, roots, qq, uid);
  expect(restored?.pools.find(pool => pool.gachaType === "2")?.records.map(({ id, gachaId }) => [id, gachaId]))
    .toEqual([[secondId, "0"], [firstId, "501"]]);
  expect(await Bun.file(authoritative).exists()).toBe(false);
  expect(await readFile(old, "utf8")).toBe(olderBytes);
  expect(await readFile(renamed, "utf8")).toBe(newerBytes);
  expect(await readZzzLegacyGachaSources(join(workspace, "explicit-empty"), [], qq, uid)).toBeUndefined();

  await json(renamed, { "邦布频段": [draw(firstId, { gacha_type: "5", item_type: "邦布" })] });
  await expect(readZzzLegacyGachaSources(current, roots, qq, uid)).rejects.toThrow("重复记录所属频段");
  await json(renamed, { "独家频段": [draw(firstId, { item_id: "14103" })] });
  await expect(readZzzLegacyGachaSources(current, roots, qq, uid)).rejects.toThrow("重复记录内容");
  await json(authoritative, {});
  const empty = await readZzzLegacyGachaSources(current, roots, qq, uid);
  expect(empty?.pools.every(pool => !pool.records.length)).toBe(true);
}));

function summary(updatedAt: string, copies: number): ZzzTuningSnapshot {
  const item = { itemId: "14102", name: "旧汇总", icon: "", rarity: "S", itemType: "AVATAR",
    isUp: true, upTag: "", count: 28, time: 1725000000, sort: "1", version: "1.0" };
  const records = Array.from({ length: copies }, () => item);
  const keys = Object.keys(zzzTuningPools) as (keyof typeof zzzTuningPools)[];
  return { ...role, version: 1, profileId: 2, currentVersion: "1.0", totalDraws: copies * 28, totalS: copies,
    updatedAt, inventory: {}, pools: keys.map(type => {
      const hasRecords = type === "GACHA_TYPE_CHARACTER_UP";
      return { type, name: zzzTuningPools[type].name, totalDraws: hasRecords ? copies * 28 : 0, totalS: hasRecords ? copies : 0,
        upCount: null, averageUp: null, pity: null, guaranteedWithin: null, records: hasRecords ? records : [],
        periods: hasRecords ? [{
          version: "1.0", status: "", startAt: null, endAt: null, leftStartAt: null, leftEndAt: null,
          firstUp: item, items: [], records,
        }] : [] };
    }) };
}

test("旧官方汇总只作缓存和更新基线，不混成逐抽或修改原目录", () => fixture(async workspace => {
  const primary = join(workspace, "tuning");
  const roots = [join(workspace, "old"), join(workspace, "renamed")];
  const old = join(roots[0]!, qq, uid + ".json");
  const renamed = join(roots[1]!, qq, uid + ".json");
  const older = summary("2026-01-01T00:00:00.000Z", 1);
  const newer = summary("2026-01-02T00:00:00.000Z", 2);
  const external = summary("2026-01-03T00:00:00.000Z", 3);
  const olderBytes = await json(old, older);
  const newerBytes = await json(renamed, newer);
  const profiles = createProfileStore(workspace);
  await writeFile(join(workspace, qq + "-2.yaml"), [
    'user: { qq: "42" }', "profile: { id: 2 }", "account:",
    "  cookie: cookie_token=fixture", "  stoken: fixture", '  stuid: "42"',
    `  game_roles: { zzz: [{ uid: "${uid}", region: ${region}, game_biz: nap_cn }] }`,
    `  current_uid: { zzz: "${uid}" }`, "",
  ].join("\n"));
  const locks: string[] = [];
  const sync = createZzzTuningSync(profiles, {
    async fetchZzzTuning(context) {
      return { ...external, revision: context.revision, refreshedCookie: false };
    },
  }, primary, async path => { locks.push(path); return { close() {} }; }, roots);
  const file = join(primary, qq, uid + ".json");

  expect(await sync.read("43", role)).toBeNull();
  expect(await sync.read(qq, role)).toEqual(newer);
  await expect(sync.read(qq, { uid, region: "prod_qd_cn" })).rejects.toThrow("UID 或分区不一致");
  expect(await Bun.file(file).exists()).toBe(false);
  const result = await sync.sync(qq, 2);
  expect(result.pools.find(row => row.type === "GACHA_TYPE_CHARACTER_UP")?.added).toBe(1);
  expect(JSON.parse(await readFile(file, "utf8"))).toEqual(external);
  expect(await readFile(old, "utf8")).toBe(olderBytes);
  expect(await readFile(renamed, "utf8")).toBe(newerBytes);
  expect(locks).toHaveLength(1);
  expect(locks[0]).toStartWith(primary);
}));
