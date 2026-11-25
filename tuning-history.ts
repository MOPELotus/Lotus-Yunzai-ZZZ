import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import { MAX_PROFILE_ID } from "@lotus-yunzai/account";
import { zzzTuningPools, type ZzzTuningSnapshot } from "@lotus-yunzai/hoyo-client";

type Json = Record<string, unknown>;
type Role = Pick<ZzzTuningSnapshot, "uid" | "region">;
export type ZzzTuningIdentity = Role & Pick<ZzzTuningSnapshot, "profileId">;
type Pool = ZzzTuningSnapshot["pools"][number];
type Period = Pool["periods"][number];
type TuningRecord = Pool["records"][number];
type Inventory = ZzzTuningSnapshot["inventory"];

const inventoryKeys = ["polychrome", "monochrome", "encryptedMasterTape", "masterTape", "boopon"] as const;

function invalid(field: string): never {
  throw new TypeError($t("tuning-history.text_32e486ab14", { "field": field }));
}

function object(value: unknown, field: string): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(field);
  return value as Json;
}

function list(value: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(value)) invalid(field);
  return value;
}

function text(value: unknown, field: string, required = false): string {
  if (typeof value !== "string" || (required && !value.trim())) invalid(field);
  return value;
}

function count(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid(field);
  return value;
}

function optionalCount(value: unknown, field: string): number | null {
  return value == null ? null : count(value, field);
}

function optionalAverage(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) invalid($t("tuning-history.text_edd82d3949"));
  return value;
}

function profileId(value: unknown): number {
  const id = count(value, $t("tuning-history.text_1ccdb6588f"));
  if (!id || id > MAX_PROFILE_ID) invalid($t("tuning-history.text_1ccdb6588f"));
  return id;
}

function checkRole(role: Role) {
  if (!/^[1-9]\d{7,9}$/u.test(role.uid) || (role.region !== "prod_gf_cn" && role.region !== "prod_qd_cn")) {
    invalid($t("tuning-history.text_1d60354370"));
  }
}

function updatedAt(value: unknown): string {
  const raw = text(value, $t("tuning-history.text_f0f609f1e2"), true);
  const time = Date.parse(raw);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== raw) invalid($t("tuning-history.text_f0f609f1e2"));
  return raw;
}

function record(value: unknown, allowAbsentFirstUp = false): TuningRecord {
  const row = object(value, $t("tuning-history.text_1e7421ad04"));
  const itemId = text(row.itemId, $t("tuning-history.text_3fc0e85fe6"), true);
  if (itemId === "0" && !allowAbsentFirstUp) invalid($t("tuning-history.text_3fc0e85fe6"));
  if (typeof row.isUp !== "boolean") invalid($t("tuning-history.text_5dd4a8a52c"));
  return {
    itemId, name: text(row.name, $t("tuning-history.text_b411fd04a9")), icon: text(row.icon, $t("tuning-history.text_e531643f63")),
    rarity: text(row.rarity, $t("tuning-history.text_0ece15300d")), itemType: text(row.itemType, $t("tuning-history.text_011ff1d948")),
    isUp: row.isUp, upTag: text(row.upTag, $t("tuning-history.text_8c48dc0277")), count: optionalCount(row.count, $t("tuning-history.text_3b37e149fe")),
    time: optionalCount(row.time, $t("tuning-history.text_631e702967")), sort: text(row.sort, $t("tuning-history.text_6ca019d1c0")),
    version: text(row.version, $t("tuning-history.text_1d02f53e72"), true),
  };
}

function period(value: unknown): Period {
  const row = object(value, $t("tuning-history.text_4a703a03f5"));
  const version = text(row.version, $t("tuning-history.text_c3237c0f25"), true);
  const records = list(row.records, $t("tuning-history.text_d8ba4ad88a")).map(item => record(item));
  const items = list(row.items, $t("tuning-history.text_9e7d2e8ec8")).map(item => record(item));
  const firstUp = row.firstUp == null ? null : record(row.firstUp, true);
  if ([...records, ...items, ...(firstUp ? [firstUp] : [])].some((item) => item.version !== version)) {
    invalid($t("tuning-history.text_483eede868"));
  }
  return {
    version, status: text(row.status, $t("tuning-history.text_f4c41b2bb1")), startAt: optionalCount(row.startAt, $t("tuning-history.text_02c986c5e9")),
    endAt: optionalCount(row.endAt, $t("tuning-history.text_07c7462827")), leftStartAt: optionalCount(row.leftStartAt, $t("tuning-history.text_d532ea4ce7")),
    leftEndAt: optionalCount(row.leftEndAt, $t("tuning-history.text_60d3f60780")),
    // The old writer serialized the official string "0" as a record in this optional slot.
    firstUp: firstUp?.itemId === "0" ? null : firstUp, records, items,
  };
}

function recordKey(item: TuningRecord) {
  return JSON.stringify([item.itemId, item.time, item.sort, item.count]);
}

function occurrences(records: readonly TuningRecord[], keyOf = recordKey) {
  const counts = new Map<string, number>();
  for (const item of records) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function consistentRecords(records: readonly TuningRecord[], periods: readonly Period[]) {
  const actual = occurrences(records);
  const maximum = new Map<string, number>();
  const total = new Map<string, number>();
  for (const period of periods) {
    for (const [key, value] of occurrences(period.records)) {
      maximum.set(key, Math.max(maximum.get(key) ?? 0, value));
      total.set(key, (total.get(key) ?? 0) + value);
    }
  }
  // The official reader uses either one maximal set of occurrences per key or all occurrences.
  const expected = [...maximum.values()].reduce((sum, value) => sum + value, 0) === records.length ? maximum : total;
  if (actual.size !== expected.size || [...expected].some(([key, value]) => actual.get(key) !== value)) return false;

  const versionKey = (item: TuningRecord) => JSON.stringify([item.version, recordKey(item)]);
  const available = occurrences(periods.flatMap((item) => item.records), versionKey);
  return [...occurrences(records, versionKey)].every(([key, value]) => value <= (available.get(key) ?? 0));
}

function pool(value: unknown): Pool {
  const row = object(value, $t("tuning-history.text_5c03c34bfa"));
  const type = text(row.type, $t("tuning-history.text_b44f467aca")) as Pool["type"];
  if (!Object.hasOwn(zzzTuningPools, type)) invalid($t("tuning-history.text_b44f467aca"));
  const { name } = zzzTuningPools[type];
  if (row.name !== name) invalid($t("tuning-history.text_77b1d61bd6"));
  const totalDraws = count(row.totalDraws, $t("tuning-history.text_d6433d40b2", { "name": name }));
  const totalS = count(row.totalS, $t("tuning-history.text_ce53d985a1", { "name": name }));
  const records = list(row.records, $t("tuning-history.text_0f1889a8e5", { "name": name })).map(item => record(item));
  const periods = list(row.periods, $t("tuning-history.text_8921b8bc15", { "name": name })).map(period);
  if (totalS > totalDraws || records.length !== totalS || records.some((item) => item.rarity !== "S" || !item.time || !item.count) ||
      !consistentRecords(records, periods)) {
    invalid($t("tuning-history.text_23993de6f6", { "name": name }));
  }
  return {
    type, name, totalDraws, totalS, upCount: optionalCount(row.upCount, $t("tuning-history.text_4e121e3de2")),
    averageUp: optionalAverage(row.averageUp), pity: optionalCount(row.pity, $t("tuning-history.text_a2442bb1af")),
    guaranteedWithin: optionalCount(row.guaranteedWithin, $t("tuning-history.text_29c70a8821")), records, periods,
  };
}

function inventory(value: unknown): Inventory {
  const result: Inventory = {};
  const row = object(value ?? {}, $t("tuning-history.text_780c5fd5b1"));
  for (const key of inventoryKeys) {
    if (Object.hasOwn(row, key)) result[key] = count(row[key], $t("tuning-history.text_fb5f4a3577"));
  }
  return result;
}

export function readZzzTuningHistory(value: unknown, role: Role): ZzzTuningSnapshot | null {
  checkRole(role);
  if (value == null) return null;
  const row = object(value, $t("tuning-history.text_7a68830642"));
  if (row.version !== 1) invalid($t("tuning-history.text_98b04f00fe"));
  if (row.uid !== role.uid || row.region !== role.region) {
    throw new Error($t("tuning-history.text_cfffef761a"));
  }

  const pools = list(row.pools, $t("tuning-history.text_9bf843218e")).map(pool);
  if (pools.length !== Object.keys(zzzTuningPools).length || new Set(pools.map(({ type }) => type)).size !== pools.length) {
    invalid($t("tuning-history.text_3f60ea75b3"));
  }
  const totalDraws = count(row.totalDraws, $t("tuning-history.text_16d9466677"));
  const totalS = count(row.totalS, $t("tuning-history.text_572c2fcc75"));
  const main = pools.filter(({ type }) => type !== "GACHA_TYPE_BANGBOO");
  if (main.reduce((sum, item) => sum + item.totalDraws, 0) !== totalDraws ||
      main.reduce((sum, item) => sum + item.totalS, 0) !== totalS) {
    invalid($t("tuning-history.text_fd0e88d7b5"));
  }
  return {
    version: 1, uid: role.uid, region: role.region, profileId: profileId(row.profileId),
    currentVersion: text(row.currentVersion, $t("tuning-history.text_e9f64f95d0"), true), totalDraws, totalS, pools,
    inventory: inventory(row.inventory), updatedAt: updatedAt(row.updatedAt),
  };
}

function countAdded(previous: readonly TuningRecord[], records: readonly TuningRecord[]): number {
  const old = occurrences(previous);
  return [...occurrences(records)].reduce((sum, [key, quantity]) => sum + Math.max(0, quantity - (old.get(key) ?? 0)), 0);
}

export function prepareZzzTuningUpdate(previous: unknown, latest: unknown, identity: ZzzTuningIdentity) {
  const expectedProfile = profileId(identity.profileId);
  const stats = readZzzTuningHistory(latest, identity);
  if (!stats) invalid($t("tuning-history.text_36fca5315f"));
  if (stats.profileId !== expectedProfile) throw new Error($t("tuning-history.text_875a6c08f0"));

  const saved = readZzzTuningHistory(previous, identity);
  if (saved && Date.parse(stats.updatedAt) < Date.parse(saved.updatedAt)) {
    throw new Error($t("tuning-history.text_ee43021d57"));
  }
  const oldPools = new Map(saved?.pools.map((item) => [item.type, item]));
  const pools = stats.pools.map((item) => ({
    type: item.type, name: item.name, totalDraws: item.totalDraws, total: item.totalS, pity: item.pity,
    added: countAdded(oldPools.get(item.type)?.records ?? [], item.records),
  }));
  return {
    ok: true as const, source: "official_tuning_stats" as const, gameBiz: "nap_cn" as const, uid: stats.uid,
    region: stats.region, profileId: stats.profileId, stats, pools, inventory: stats.inventory,
  };
}
