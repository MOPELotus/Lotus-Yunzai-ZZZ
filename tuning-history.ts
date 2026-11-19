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
  throw new TypeError(`绝区零调频快照的${field}无效。`);
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
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) invalid("UP 平均抽数");
  return value;
}

function profileId(value: unknown): number {
  const id = count(value, "档案编号");
  if (!id || id > MAX_PROFILE_ID) invalid("档案编号");
  return id;
}

function checkRole(role: Role) {
  if (!/^[1-9]\d{7,9}$/u.test(role.uid) || (role.region !== "prod_gf_cn" && role.region !== "prod_qd_cn")) {
    invalid("角色 UID 或分区");
  }
}

function updatedAt(value: unknown): string {
  const raw = text(value, "保存时间", true);
  const time = Date.parse(raw);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== raw) invalid("保存时间");
  return raw;
}

function record(value: unknown): TuningRecord {
  const row = object(value, "S 级记录");
  const itemId = text(row.itemId, "物品编号", true);
  if (itemId === "0") invalid("物品编号");
  if (typeof row.isUp !== "boolean") invalid("UP 标记");
  return {
    itemId, name: text(row.name, "物品名称"), icon: text(row.icon, "物品图标"),
    rarity: text(row.rarity, "物品稀有度"), itemType: text(row.itemType, "物品类型"),
    isUp: row.isUp, upTag: text(row.upTag, "UP 标签"), count: optionalCount(row.count, "五星间隔"),
    time: optionalCount(row.time, "记录时间"), sort: text(row.sort, "记录排序"),
    version: text(row.version, "记录期次", true),
  };
}

function period(value: unknown): Period {
  const row = object(value, "期次");
  const version = text(row.version, "期次编号", true);
  const records = list(row.records, "期次 S 级明细").map(record);
  const items = list(row.items, "期次物品").map(record);
  const firstUp = row.firstUp == null ? null : record(row.firstUp);
  if ([...records, ...items, ...(firstUp ? [firstUp] : [])].some((item) => item.version !== version)) {
    invalid("物品与期次的归属");
  }
  return {
    version, status: text(row.status, "期次状态"), startAt: optionalCount(row.startAt, "期次开始时间"),
    endAt: optionalCount(row.endAt, "期次结束时间"), leftStartAt: optionalCount(row.leftStartAt, "左侧期次开始时间"),
    leftEndAt: optionalCount(row.leftEndAt, "左侧期次结束时间"), firstUp, records, items,
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
  const row = object(value, "频段");
  const type = text(row.type, "频段编号") as Pool["type"];
  if (!Object.hasOwn(zzzTuningPools, type)) invalid("频段编号");
  const { name } = zzzTuningPools[type];
  if (row.name !== name) invalid("频段名称");
  const totalDraws = count(row.totalDraws, `${name}总抽数`);
  const totalS = count(row.totalS, `${name} S 级数量`);
  const records = list(row.records, `${name} S 级明细`).map(record);
  const periods = list(row.periods, `${name}期次列表`).map(period);
  if (totalS > totalDraws || records.length !== totalS || records.some((item) => item.rarity !== "S" || !item.time || !item.count) ||
      !consistentRecords(records, periods)) {
    invalid(`${name} S 级明细与官方汇总`);
  }
  return {
    type, name, totalDraws, totalS, upCount: optionalCount(row.upCount, "UP 次数"),
    averageUp: optionalAverage(row.averageUp), pity: optionalCount(row.pity, "当前垫抽"),
    guaranteedWithin: optionalCount(row.guaranteedWithin, "保底剩余抽数"), records, periods,
  };
}

function inventory(value: unknown): Inventory {
  const result: Inventory = {};
  const row = object(value ?? {}, "库存");
  for (const key of inventoryKeys) {
    if (Object.hasOwn(row, key)) result[key] = count(row[key], "库存数量");
  }
  return result;
}

export function readZzzTuningHistory(value: unknown, role: Role): ZzzTuningSnapshot | null {
  checkRole(role);
  if (value == null) return null;
  const row = object(value, "内容");
  if (row.version !== 1) invalid("格式版本");
  if (row.uid !== role.uid || row.region !== role.region) {
    throw new Error("绝区零调频快照与当前角色 UID 或分区不一致。");
  }

  const pools = list(row.pools, "频段列表").map(pool);
  if (pools.length !== Object.keys(zzzTuningPools).length || new Set(pools.map(({ type }) => type)).size !== pools.length) {
    invalid("六个频段");
  }
  const totalDraws = count(row.totalDraws, "总览抽数");
  const totalS = count(row.totalS, "总览 S 级数量");
  const main = pools.filter(({ type }) => type !== "GACHA_TYPE_BANGBOO");
  if (main.reduce((sum, item) => sum + item.totalDraws, 0) !== totalDraws ||
      main.reduce((sum, item) => sum + item.totalS, 0) !== totalS) {
    invalid("全频段官方总账");
  }
  return {
    version: 1, uid: role.uid, region: role.region, profileId: profileId(row.profileId),
    currentVersion: text(row.currentVersion, "当前期次", true), totalDraws, totalS, pools,
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
  if (!stats) invalid("新数据");
  if (stats.profileId !== expectedProfile) throw new Error("绝区零调频快照与当前档案编号不一致。");

  const saved = readZzzTuningHistory(previous, identity);
  if (saved && Date.parse(stats.updatedAt) < Date.parse(saved.updatedAt)) {
    throw new Error("较早的绝区零调频快照无法覆盖已保存的较新快照。");
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
