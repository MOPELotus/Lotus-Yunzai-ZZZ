import { zzzTuningPools } from "@lotus-yunzai/hoyo-client";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import type { ZzzLegacyGachaDraw, ZzzLegacyGachaPool, ZzzLegacyGachaSnapshot } from "./gacha-legacy";

export interface ZzzLinkedGachaSnapshot extends ZzzLegacyGachaSnapshot {
  readonly region: string;
  readonly gameBiz: string;
  readonly timezone: number;
}

interface Role {
  readonly uid: string;
  readonly region: string;
}

type Pool = ZzzLegacyGachaPool["type"];
const poolTypes = Object.keys(zzzTuningPools) as Pool[];
const subject = "绝区零链接逐抽档案";
const maxBytes = 32 * 1024 * 1024;
const idPattern = /^[1-9]\d{0,18}$/u;
const wallTime = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u;

function invalid(reason: string): never {
  throw new Error(`${subject}${reason}。`);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("格式无效");
  return value as Record<string, unknown>;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && idPattern.test(value);
}

function validWallTime(value: unknown): value is string {
  if (typeof value !== "string" || !wallTime.test(value)) return false;
  const time = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isFinite(time.valueOf()) && time.toISOString().slice(0, 19).replace("T", " ") === value;
}

function storedDraw(input: unknown): ZzzLegacyGachaDraw {
  const { id, itemId, gachaId, count, time, name, lang, itemType, rank } = object(input);
  if (!identifier(id) || !identifier(itemId) || !identifier(gachaId) ||
      typeof count !== "number" || !Number.isSafeInteger(count) || count < 1 || !validWallTime(time) ||
      typeof name !== "string" || !name.trim() || !name.isWellFormed() || Buffer.byteLength(name) > 512 ||
      /[\x00-\x1F\x7F]|https?:\/\//iu.test(name) ||
      typeof lang !== "string" || !/^[a-z]{2}-[a-z]{2}$/iu.test(lang) ||
      (itemType !== "代理人" && itemType !== "音擎" && itemType !== "邦布") ||
      (rank !== "2" && rank !== "3" && rank !== "4")) invalid("记录无效");
  return { id, itemId, gachaId, count, time, name, lang, itemType, rank };
}

function isRoleRegion(uid: string, region: unknown, gameBiz: unknown) {
  const overseas = { "10": "prod_gf_us", "13": "prod_gf_jp", "15": "prod_gf_eu", "17": "prod_gf_sg" } as const;
  const prefix = uid.slice(0, 2) as keyof typeof overseas;
  if (/^\d{10}$/u.test(uid)) return region === overseas[prefix] && gameBiz === "nap_global";
  return /^[1-9]\d{7,8}$/u.test(uid) && (region === "prod_gf_cn" || region === "prod_qd_cn") && gameBiz === "nap_cn";
}

function validatedSnapshot(value: unknown, role: Role): ZzzLinkedGachaSnapshot {
  const { uid, region, gameBiz, timezone, pools } = object(value);
  if (uid !== role.uid || typeof region !== "string" || region !== role.region || typeof gameBiz !== "string" ||
      !isRoleRegion(uid, region, gameBiz)) invalid("与当前 UID 或地区不一致");
  if (typeof timezone !== "number" || !Number.isInteger(timezone) || timezone < -12 || timezone > 14) invalid("时区无效");
  if (!Array.isArray(pools) || pools.length !== poolTypes.length) invalid("频段无效");
  const indexed = new Map(pools.map((pool) => {
    const entry = object(pool);
    return [entry.type, entry] as const;
  }));
  const usedIds = new Map<string, Pool>();
  return {
    uid, region, gameBiz, timezone,
    pools: poolTypes.map((type) => {
      const entry = indexed.get(type);
      const { name, id } = zzzTuningPools[type];
      const gachaType = String(id) as ZzzLegacyGachaPool["gachaType"];
      if (entry?.name !== name || entry.gachaType !== gachaType || !Array.isArray(entry.records)) invalid("频段无效");
      const records = new Map<string, ZzzLegacyGachaDraw>();
      for (const row of entry.records) {
        const draw = storedDraw(row);
        if (usedIds.has(draw.id) && usedIds.get(draw.id) !== type) invalid("记录所属频段冲突");
        usedIds.set(draw.id, type);
        const existing = records.get(draw.id);
        records.set(draw.id, existing ? mergeDraw(existing, draw) : draw);
      }
      return { type, name, gachaType, records: [...records.values()].sort(newestFirst) };
    }),
  };
}

function newestFirst(a: ZzzLegacyGachaDraw, b: ZzzLegacyGachaDraw): number {
  return b.id.length - a.id.length || (a.id === b.id ? 0 : a.id > b.id ? -1 : 1);
}

function mergeDraw(older: ZzzLegacyGachaDraw, fresh: ZzzLegacyGachaDraw, legacy = false): ZzzLegacyGachaDraw {
  if (older.itemId !== fresh.itemId || older.rank !== fresh.rank || older.itemType !== fresh.itemType ||
      older.count !== fresh.count || (!legacy && older.time !== fresh.time) ||
      (!(legacy && older.gachaId === "0") && older.gachaId !== fresh.gachaId)) invalid("重复记录内容冲突");
  return legacy ? fresh : older;
}

function combine(previous: ZzzLegacyGachaSnapshot, latest: ZzzLegacyGachaSnapshot, legacy: boolean) {
  if (previous.uid !== latest.uid) invalid("与旧逐抽 UID 不一致");
  const oldPools = new Map(previous.pools.map((pool) => [pool.type, pool]));
  const oldBands = new Map<string, Pool>();
  for (const { type, records } of previous.pools) {
    for (const { id } of records) oldBands.set(id, type);
  }
  const added = {} as Record<Pool, number>;
  let addedTotal = 0;
  const pools = latest.pools.map((pool) => {
    const records = new Map(oldPools.get(pool.type)?.records.map((draw) => [draw.id, draw]));
    let count = 0;
    for (const draw of pool.records) {
      const priorType = oldBands.get(draw.id);
      if (priorType !== undefined && priorType !== pool.type) invalid("记录所属频段冲突");
      const old = records.get(draw.id);
      const combined = old ? mergeDraw(old, draw, legacy) : draw;
      if (!old) count++;
      records.set(draw.id, combined);
    }
    added[pool.type] = count;
    addedTotal += count;
    return { ...pool, records: [...records.values()].sort(newestFirst) };
  });
  return { pools, added, addedTotal };
}

export function mergeZzzLegacyWithLinked(
  legacy: ZzzLegacyGachaSnapshot | undefined,
  linked: ZzzLinkedGachaSnapshot | undefined,
): ZzzLegacyGachaSnapshot | undefined {
  if (!legacy || !linked) return linked ?? legacy;
  return { uid: linked.uid, pools: combine(legacy, linked, true).pools };
}

export function createZzzLinkHistory(directory: string, acquireLock: AcquireRoleArchiveLock) {
  const files = createRoleJsonArchive(directory, acquireLock, { subject, lockSuffix: "lotus-zzz-gacha-link", maxBytes, rejectNull: true });
  function decode(value: unknown, qq: string, role: Role): ZzzLinkedGachaSnapshot | undefined {
    if (value === null) return;
    const stored = object(value);
    if (stored.version !== 1 || stored.qq !== qq) invalid("版本或所有者无效");
    return validatedSnapshot(stored, role);
  }

  return {
    async read(qq: string, role: Role): Promise<ZzzLinkedGachaSnapshot | undefined> {
      return decode(await files.read(qq, role.uid), qq, role);
    },
    async merge(identity: Role & { readonly qq: string }, input: ZzzLinkedGachaSnapshot, verifyProfile: () => Promise<void>) {
      const incoming = validatedSnapshot(input, identity);
      return files.update(identity, verifyProfile, (saved) => {
        const previous = decode(saved, identity.qq, identity);
        if (previous && (previous.timezone !== incoming.timezone || previous.gameBiz !== incoming.gameBiz)) invalid("时区或服务区改变");
        const { pools, added, addedTotal } = combine(previous ?? { uid: incoming.uid, pools: [] }, incoming, false);
        const stats: ZzzLinkedGachaSnapshot = { ...incoming, pools };
        const result = { stats, added, addedTotal };
        if (previous && addedTotal === 0) return { result };
        return { document: { version: 1, qq: identity.qq, ...stats }, result };
      });
    },
  };
}
