import { constants } from "node:fs";
import { open, readFile, realpath } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_PROFILE_ID } from "@lotus-yunzai/account";
import { normalizeZzzClimbingTower, normalizeZzzDeadly, normalizeZzzHoloBoss, normalizeZzzShiyu, normalizeZzzVoidFront } from "@lotus-yunzai/hoyo-client";
import {
  currentPeriod, domesticRegion, idOf, isOwnedRank, rankIdentity, rankRow, rankTowerSeason, rankType, sortedRankRows,
  type RankMode, type RankProfile, type RankRow, type RankSnapshot, type RankType,
} from "./challenge-rank-model.ts";

type Redis = NonNullable<typeof globalThis.redis>;
type Json = Record<string, unknown>;
const legacyUid = /^[1-9]\d{7}$/u;
const defaultConfig = fileURLToPath(new URL("../../config/zzz-rank.yaml", import.meta.url));
const defaultLegacyData = fileURLToPath(new URL("../../data/ZZZ-Plugin/", import.meta.url));
const maxRecordBytes = 2 * 1024 * 1024;
const groupRankSwitch = "lotus-yunzai:zzz-challenge-ranks:allow-group";
export type RankGeneration = string | null;

function generationKey(group: string) {
  return `lotus-yunzai:zzz-challenge-ranks:${group}:ABYSS:generation`;
}

async function readGeneration(redis: Redis, group: string, type: RankType): Promise<RankGeneration> {
  if (type !== "ABYSS") return null;
  const value = await redis.get(generationKey(group));
  if (value == null) return null;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(value)) throw new Error("群榜代次无效");
  return value;
}

export async function setRankGroupEnabled(redis: Redis, enabled: boolean) {
  return await redis.set(groupRankSwitch, enabled ? "1" : "0") === "OK";
}
const rememberRecord = `
local field, default_status, requested_at, snapshot, generation = unpack(ARGV)
if generation and (redis.call('GET', KEYS[4]) or '') ~= generation then return nil end
redis.call('HSETNX', KEYS[1], field, default_status)
local last = redis.call('HGET', KEYS[3], field)
if not last or tonumber(last) <= tonumber(requested_at) then
  redis.call('HSET', KEYS[2], field, snapshot)
  redis.call('HSET', KEYS[3], field, requested_at)
end
return redis.call('HGET', KEYS[1], field)
`;

type RankOwner = { readonly qq: string; readonly profileId: number };
const rememberOwnedRecord = `
local field, owner, payload = unpack(ARGV)
if redis.call('HGET', KEYS[1], field) ~= '1' or redis.call('HGET', KEYS[3], field) ~= owner then
  return '0'
end
local stored = redis.call('HGET', KEYS[2], field)
if stored then
  local ok, earlier = pcall(cjson.decode, stored)
  local next = cjson.decode(payload)
  if ok and type(earlier) == 'table' and earlier.owner == owner then
    if type(earlier.holoScore) == 'table' and type(next.holoScore) == 'table' then
      local a, b = earlier.holoScore, next.holoScore
      if a.season == b.season and type(a.stars) == 'number' and type(a.duration) == 'number' and
        type(a.undamaged) == 'number' and (a.stars > b.stars or
          (a.stars == b.stars and (a.duration < b.duration or
            (a.duration == b.duration and a.undamaged >= b.undamaged)))) then
        return '1'
      end
      if type(a.season) == 'string' and a.season > b.season then return '1' end
    elseif type(earlier.requestedAt) == 'number' and type(next.requestedAt) == 'number' and earlier.requestedAt > next.requestedAt then
      return '1'
    end
  end
end
redis.call('HSET', KEYS[2], field, payload)
return '1'
`;

function rankOwner(qq: string, profileId: number) {
  return `${qq}:${profileId}`;
}

function readRankOwner(value: string | undefined): RankOwner | undefined {
  const [qq, slot, extra] = value?.split(":") ?? [];
  const profileId = Number(slot);
  if (qq && idOf(qq) === qq && extra === undefined && /^[1-9]\d{0,2}$/u.test(slot ?? "") && profileId <= MAX_PROFILE_ID) {
    return { qq, profileId };
  }
}

function object(value: unknown): Json | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Json;
}

function configIds(input: unknown) {
  if (input === undefined || input === null) return new Set<string>();
  if (!Array.isArray(input)) throw new Error("群榜列表无效");
  const ids = input.map(idOf);
  if (ids.some(id => !id)) throw new Error("群榜群号无效");
  return new Set(ids as string[]);
}

export function parseRankConfig(input: unknown, group: string, override?: boolean) {
  const record = input === undefined ? {} : object(input);
  if (!record) throw new Error("群榜配置无效");
  const configured = record.allow_group ?? true;
  if (typeof configured !== "boolean" && configured !== 0 && configured !== 1) throw new Error("群榜开关无效");
  const enable = override ?? Boolean(configured);
  const listed = configIds(enable ? record.black_list : record.white_list).has(group);
  const maximum = Number(record.max_display ?? 15);
  if (!Number.isInteger(maximum)) throw new Error("群榜显示数量无效");
  return { allowed: enable ? !listed : listed, maximum: Math.max(1, Math.min(15, maximum)) };
}

export async function readRankConfig(group: string) {
  const stored = await globalThis.redis?.get(groupRankSwitch);
  if (stored != null && stored !== "0" && stored !== "1") throw new Error("群榜总开关无效");
  const override = stored == null ? undefined : stored === "1";
  const resourceDirectory = Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR;
  const explicit = Bun.env.LOTUS_ZZZ_RANK_CONFIG;
  const files = explicit ? [explicit] : [defaultConfig, ...(resourceDirectory ? [join(dirname(resourceDirectory), "config", "rank.yaml")] : [])];
  for (const path of files) {
    try {
      return parseRankConfig(Bun.YAML.parse(await readFile(path, "utf8")), group, override);
    } catch (error) {
      if (explicit || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return parseRankConfig(undefined, group, override);
}

function keys(group: string, type: RankType, generation: RankGeneration = null) {
  const base = `lotus-yunzai:zzz-challenge-ranks:${group}:${type}`;
  const suffix = type === "ABYSS" && generation ? `:${generation}` : "";
  return { status: `${base}:visibility`, data: `${base}:records${suffix}`, requests: `${base}:request-time${suffix}`, owners: `${base}:owners` };
}

function oldStatus(group: string, type: RankType, uid: string) {
  return `ZZZ:RANK:${type}:${group}:${uid}`;
}

function oldGroup(group: string) {
  return `ZZZ:RANK:UID2QQS:${group}:`;
}

function profileText(value: unknown, max = 160) {
  if (typeof value === "string" && value.isWellFormed() && Buffer.byteLength(value) <= max && !/[\p{Cc}\p{Cf}]/u.test(value)) {
    return value.trim();
  }
}

function parseProfile(raw: Json, qq: string, uid: string) {
  const region = raw.region;
  if (typeof region !== "string" || !domesticRegion(region) || !rankIdentity(uid, region)) return;
  const level = typeof raw.level === "number" || typeof raw.level === "string" ? Number(raw.level) : undefined;
  const profileId = typeof raw.profileId === "number" && Number.isInteger(raw.profileId) &&
    raw.profileId > 0 && raw.profileId <= MAX_PROFILE_ID ? raw.profileId : undefined;
  return { qq, profileId, uid, region, nickname: profileText(raw.nickname) || "绳匠",
    level: typeof level === "number" && Number.isSafeInteger(level) && level >= 0 && level <= 999 ? level : undefined,
    regionName: profileText(raw.regionName ?? raw.region_name, 100),
  };
}

async function legacyRecord(root: string, type: RankType, uid: string, qq: string) {
  const season = rankTowerSeason(type);
  const folders = { ABYSS: "abyss", DEADLY: "deadly", HOLO_BOSS: "holoBoss", VOID_FRONT_BATTLE: "voidFrontBattle",
    CLIMBING_TOWER_S1: "climbingTower", CLIMBING_TOWER_S2: "climbingTower", CLIMBING_TOWER_S3: "climbingTower", CLIMBING_TOWER_S4: "climbingTower" } as const;
  const directory = join(root, folders[type]);
  const actual = await realpath(join(directory, `${uid}.json`)).catch(() => undefined);
  if (!actual?.startsWith(directory + sep)) return;
  const file = await open(actual, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(() => undefined);
  if (!file) return;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > maxRecordBytes) return;
    const data = object(JSON.parse(await file.readFile("utf8")));
    const legacy = object(object(data?.player)?.player);
    if (!legacy || String(legacy.game_uid) !== uid || (legacy.game_biz !== undefined && legacy.game_biz !== "nap_cn")) return;
    const profile = parseProfile(legacy, qq, uid);
    if (!profile) return;
    const identity = { uid, region: profile.region, scheduleType: 1 as const };
    const result = object(data?.result);
    const branch = `climbing_tower_s${season}`;
    const selectedTower = season && result && Object.fromEntries(Object.entries(result).flatMap(([key, value]) => {
      if (!key.startsWith("climbing_tower_s")) return [[key, value]];
      if (key === branch) {
        const selected = object(value);
        return [[key, selected ? { ...selected, display_avatar_rank_list: undefined } : value]];
      }
      return [];
    }));
    const snapshot = season ? normalizeZzzClimbingTower(selectedTower, identity) :
      type === "ABYSS" ? normalizeZzzShiyu(data?.result, identity) :
      type === "HOLO_BOSS" ? normalizeZzzHoloBoss(data?.result, identity) :
        type === "VOID_FRONT_BATTLE" ? normalizeZzzVoidFront({ void_front_battle_detail: data?.result }, identity) :
          normalizeZzzDeadly(data?.result, identity);
    const updateTime = data?.updateTime;
    const observedAt = typeof updateTime === "number" && Number.isSafeInteger(updateTime) &&
      updateTime > 0 && updateTime < 5_000_000_000 ? updateTime * 1000 : undefined;
    return { profile, snapshot, observedAt };
  } catch {
    return;
  } finally {
    await file.close();
  }
}

function modernRecord(field: string, encoded: string) {
  if (Buffer.byteLength(encoded) > maxRecordBytes) return;
  try {
    const raw = object(JSON.parse(encoded));
    const storedProfile = object(raw?.profile);
    const uid = storedProfile && idOf(storedProfile.uid);
    const qq = storedProfile && idOf(storedProfile.qq);
    if (raw?.version !== 1 || !storedProfile || !uid || !qq) return;
    const profile = parseProfile(storedProfile, qq, uid);
    if (!profile?.profileId || rankIdentity(uid, profile.region) !== field) return;
    const snapshot = object(raw.snapshot);
    if (!snapshot || !Array.isArray(snapshot.layers) && !Array.isArray(snapshot.bosses) && !Array.isArray(snapshot.stages) && !Array.isArray(snapshot.seasons) &&
        (!Array.isArray(snapshot.trial) || !Array.isArray(snapshot.hard))) return;
    const observedAt = typeof raw.observedAt === "number" && Number.isSafeInteger(raw.observedAt) && raw.observedAt > 0 ?
      raw.observedAt : undefined;
    const owner = typeof raw.owner === "string" ? raw.owner : undefined;
    return { profile, snapshot: snapshot as unknown as RankSnapshot, observedAt, owner };
  } catch {
    return;
  }
}

export function createChallengeRankStore(redis: Redis, legacyData = Bun.env.LOTUS_ZZZ_LEGACY_DATA_DIR || defaultLegacyData) {
  return {
    generation(group: string, type: RankType) { return readGeneration(redis, group, type); },
    async clearShiyu(group: string) {
      if (!idOf(group)) return false;
      return await redis.set(generationKey(group), crypto.randomUUID()) === "OK";
    },
    async remember(group: string, type: RankType, profile: RankProfile, snapshot: RankSnapshot, requestedAt: number,
      generation: RankGeneration = null) {
      const field = rankIdentity(profile.uid, profile.region);
      if (!field || !Number.isSafeInteger(requestedAt) || requestedAt < 1) return;
      const { status, data, requests, owners } = keys(group, type, generation);
      if (isOwnedRank(type)) {
        if (!profile.profileId || profile.uid !== snapshot.uid || profile.region !== snapshot.region) return;
        const now = Date.now();
        const row = rankRow(type, profile, snapshot, now, "current");
        const owner = rankOwner(profile.qq, profile.profileId);
        let metadata;
        let selected = snapshot;
        const season = rankTowerSeason(type);
        if (season) {
          if (!("seasons" in snapshot) || !row?.tower) return;
          const { medal, layer, noDamage } = row.tower;
          selected = { uid: snapshot.uid, region: snapshot.region, status: "available",
            seasons: [{ number: season, medal, layer, score: season >= 3 ? row.score : undefined, mvp: noDamage, avatars: [] }] };
          metadata = { requestedAt };
        } else if (type === "HOLO_BOSS") {
          if (!("bosses" in snapshot) || !snapshot.period || !row?.holo) return;
          metadata = { holoScore: { season: snapshot.period.start.slice(0, 13), stars: row.bonus,
            duration: row.score, undamaged: row.holo.undamaged }, observedAt: Math.floor(now / 1000) * 1000 };
        } else {
          // The old writer replaces every current record. A known non-ending also displaces the previous view.
          if (!("stages" in snapshot) || (!row && !(snapshot.endingUnlocked === false && currentPeriod(snapshot, now)))) return;
          metadata = { requestedAt };
        }
        const payload = JSON.stringify({ version: 1, profile, snapshot: selected, owner, ...metadata });
        if (Buffer.byteLength(payload) > maxRecordBytes) return;
        return (await redis.eval(rememberOwnedRecord, { keys: [status, data, owners], arguments: [field, owner, payload] })) === "1";
      }
      const prior = legacyUid.test(profile.uid) && await redis.get(oldStatus(group, type, profile.uid));
      const encoded = JSON.stringify({ version: 1, profile, snapshot });
      if (Buffer.byteLength(encoded) > maxRecordBytes) return;
      const keysForWrite = [status, data, requests];
      const args = [field, prior === "0" ? "0" : "1", String(requestedAt), encoded];
      if (type === "ABYSS") {
        keysForWrite.push(generationKey(group));
        args.push(generation ?? "");
      }
      const saved = await redis.eval(rememberRecord, { keys: keysForWrite, arguments: args });
      return saved === "1";
    },
    async setVisibility(group: string, types: readonly RankType[], uid: string, region: string, enabled: boolean, owner?: RankOwner) {
      const field = rankIdentity(uid, region);
      if (!field || (types.some(isOwnedRank) && (!owner || !readRankOwner(rankOwner(owner.qq, owner.profileId))))) return false;
      const transaction = redis.multi();
      for (const type of types) {
        const { status, owners } = keys(group, type);
        transaction.hSet(status, field, enabled ? "1" : "0");
        if (isOwnedRank(type) && owner) {
          if (enabled) transaction.hSet(owners, field, rankOwner(owner.qq, owner.profileId));
          else transaction.hDel(owners, field);
        }
      }
      await transaction.exec();
      return true;
    },
    async rows(group: string, mode: RankMode, members: ReadonlySet<string>, now: number, expected?: RankGeneration) {
      const type = rankType(mode);
      const generation = expected === undefined ? await readGeneration(redis, group, type) : expected;
      const { status, data, owners } = keys(group, type, generation);
      const [visibility, records, root, permission] = await Promise.all([
        redis.hGetAll(status), redis.hGetAll(data), realpath(legacyData).catch(() => undefined),
        isOwnedRank(type) ? redis.hGetAll(owners) : {} as Record<string, string>,
      ]);
      const rows = new Map<string, RankRow>();
      const preferCurrent = new Set<string>();
      for (const [field, encoded] of Object.entries(records)) {
        if (visibility[field] !== "1") continue;
        const current = modernRecord(field, encoded);
        if (!current || !members.has(current.profile.qq) || (isOwnedRank(type) &&
            (!current.owner || current.owner !== permission[field] || !current.profile.profileId ||
              current.owner !== rankOwner(current.profile.qq, current.profile.profileId)))) continue;
        try {
          const row = rankRow(mode, current.profile, current.snapshot, now, "current", current.observedAt);
          if (row) rows.set(field, row);
          if (type === "VOID_FRONT_BATTLE" && "stages" in current.snapshot && currentPeriod(current.snapshot, now) &&
              (row || current.snapshot.endingUnlocked === false)) preferCurrent.add(field);
          if (row?.tower) preferCurrent.add(field);
        } catch {
          continue;
        }
      }
      if (!root || generation !== null) return [...rows.values()];
      if (isOwnedRank(type)) {
        for (const [field, rawOwner] of Object.entries(permission)) {
          const uid = field.split(":")[1];
          const owner = readRankOwner(rawOwner);
          if (visibility[field] !== "1" || preferCurrent.has(field) || !uid || !legacyUid.test(uid) || !owner || !members.has(owner.qq) ||
              await redis.get(`${oldGroup(group)}${uid}:${owner.qq}`) !== "1" ||
              await redis.get(oldStatus(group, type, uid)) !== "1") continue;
          const legacy = await legacyRecord(root, type, uid, owner.qq);
          if (!legacy || rankIdentity(uid, legacy.profile.region) !== field) continue;
          const row = rankRow(mode, { ...legacy.profile, profileId: owner.profileId }, legacy.snapshot, now, "legacy", legacy.observedAt);
          const current = rows.get(field);
          if (row && (!current || sortedRankRows(mode, [current, row])[0] === row)) rows.set(field, row);
        }
        return [...rows.values()];
      }
      const oldMembers = new Map<string, string>();
      const prefix = oldGroup(group);
      for await (const key of redis.scanIterator({ MATCH: `${prefix}*`, COUNT: 200 })) {
        if (!key.startsWith(prefix)) continue;
        const [uid, qq, extra] = key.slice(prefix.length).split(":");
        if (!uid || !qq || extra !== undefined || !legacyUid.test(uid) || !members.has(qq) || oldMembers.has(uid)) continue;
        if (await redis.get(key) === "1") oldMembers.set(uid, qq);
      }
      for (const [uid, qq] of oldMembers) {
        const legacy = await legacyRecord(root, type, uid, qq);
        if (!legacy) continue;
        const field = rankIdentity(uid, legacy.profile.region);
        if (!field || rows.has(field) || visibility[field] === "0") continue;
        if (visibility[field] !== "1" && await redis.get(oldStatus(group, type, uid)) !== "1") continue;
        const row = rankRow(mode, legacy.profile, legacy.snapshot, now, "legacy");
        if (row) rows.set(field, row);
      }
      return [...rows.values()];
    },
    async stillVisible(group: string, mode: RankMode, members: ReadonlySet<string>, rows: readonly RankRow[], now: number,
      generation: RankGeneration = null) {
      const type = rankType(mode);
      if (await readGeneration(redis, group, type) !== generation) return false;
      const visible = (await Promise.all(rows.map(async row => {
        if (!members.has(row.qq) || row.expiresAt < now) return false;
        const field = rankIdentity(row.uid, row.region);
        if (!field) return false;
        const { status, data, owners } = keys(group, type, generation);
        const current = await redis.hGet(status, field);
        if (isOwnedRank(type) && (current !== "1" || !row.profileId ||
            await redis.hGet(owners, field) !== rankOwner(row.qq, row.profileId))) return false;
        const season = rankTowerSeason(type);
        if (row.source === "current" || type === "VOID_FRONT_BATTLE" || season) {
          if (current !== "1") return false;
          const encoded = await redis.hGet(data, field);
          const record = encoded ? modernRecord(field, encoded) : undefined;
          const matches = record?.profile.qq === row.qq && record.profile.profileId === row.profileId;
          if (season) {
            const updated = matches && record && rankRow(mode, record.profile, record.snapshot, now, "current");
            if (row.source === "current") return !!updated && updated.score === row.score &&
              updated.tower?.layer === row.tower?.layer && updated.tower?.noDamage === row.tower?.noDamage &&
              updated.tower?.medal === row.tower?.medal;
            if (updated) return false;
          } else if (type === "VOID_FRONT_BATTLE") {
            if (matches && record && "stages" in record.snapshot && currentPeriod(record.snapshot, now)) {
              const updated = rankRow(mode, record.profile, record.snapshot, now, "current");
              if (row.source === "current") return updated?.latest === row.latest && updated.score === row.score &&
                updated.expiresAt === row.expiresAt;
              if (updated || record.snapshot.endingUnlocked === false) return false;
            }
            if (row.source === "current") return false;
          } else return matches;
        }
        if (current === "0" || await redis.get(`${oldGroup(group)}${row.uid}:${row.qq}`) !== "1") return false;
        return (!isOwnedRank(type) && current === "1") || await redis.get(oldStatus(group, type, row.uid)) === "1";
      }))).every(Boolean);
      return visible && await readGeneration(redis, group, type) === generation;
    },
  };
}
