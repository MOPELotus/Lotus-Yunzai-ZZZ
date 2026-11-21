import { MAX_PROFILE_ID } from "@lotus-yunzai/account";
import type { ZzzClimbingTowerSnapshot, ZzzDeadlyRoom, ZzzDeadlySnapshot, ZzzHoloBossRoom, ZzzHoloBossSnapshot, ZzzShiyuSnapshot, ZzzShiyuTeam, ZzzVoidFrontSnapshot, ZzzVoidFrontStage } from "@lotus-yunzai/hoyo-client";

export const towerRanks = ["CLIMBING_TOWER_S3", "CLIMBING_TOWER_S4"] as const;
type TowerRank = typeof towerRanks[number];
export type RankType = "ABYSS" | "DEADLY" | "HOLO_BOSS" | "VOID_FRONT_BATTLE" | TowerRank;
export type RankMode = RankType | "DEADLY_HARD";
export type RankSnapshot = ZzzShiyuSnapshot | ZzzDeadlySnapshot | ZzzHoloBossSnapshot | ZzzVoidFrontSnapshot | ZzzClimbingTowerSnapshot;

export interface RankProfile {
  readonly qq: string;
  readonly profileId?: number;
  readonly uid: string;
  readonly region: "prod_gf_cn" | "prod_qd_cn";
  readonly nickname: string;
  readonly level?: number;
  readonly regionName?: string;
}

export interface RankRow extends RankProfile {
  readonly score: number;
  readonly bonus: number;
  readonly latest: number;
  readonly expiresAt: number;
  readonly rating?: NonNullable<ZzzShiyuSnapshot["overall"]>["rating"];
  readonly holo?: { readonly undamaged: number; readonly bosses: readonly ZzzHoloBossRoom[] };
  readonly voidFront?: { readonly finalStage: ZzzVoidFrontStage; readonly stages: readonly ZzzVoidFrontStage[] };
  readonly tower?: { readonly layer: number; readonly noDamage: number; readonly medal?: string };
  readonly teams: readonly (ZzzShiyuTeam | ZzzDeadlyRoom)[];
  readonly source: "current" | "legacy";
}

export const rankLabels = {
  ABYSS: "式舆防卫战",
  DEADLY: "危局强袭战",
  DEADLY_HARD: "危局强袭战绝境",
  HOLO_BOSS: "拟境湮灭战",
  VOID_FRONT_BATTLE: "临界推演",
  CLIMBING_TOWER_S3: "鏖战试炼：荣耀",
  CLIMBING_TOWER_S4: "鏖战试炼：狂澜",
} as const;
const prefix = /^(?:[#/](?:zzz|绝区零)(?:zzz|绝区零)?|[%％](?:zzz|绝区零)?|zzz|绝区零)/iu;
const shiyu = "(?:式舆防卫战|式舆|深渊|防卫战|防卫)";
const deadly = "(?:危局强袭战|危局|强袭战|强袭)";
const holo = "(?:拟境湮灭战|拟境|湮灭战|湮灭)";
const voidFront = "(?:临界推演|临界|推演)";
const towerS3 = "(?:爬塔 *S3|鏖战试炼[:：]?荣耀)";
const towerS4 = "(?:爬塔 *S4|鏖战试炼[:：]?狂澜)";
const hard = `(?:绝境|${deadly}绝境|绝境${deadly})`;
const boardCommand = new RegExp(`^(${shiyu}|${hard}|${deadly}|${holo}|${voidFront}|${towerS3}|${towerS4})排名$`, "iu");
const towerS3Label = new RegExp(`^${towerS3}$`, "iu");
const towerS4Label = new RegExp(`^${towerS4}$`, "iu");
const hidden = /^(?:隐藏|取消显示|关闭|关掉|off|禁用|停止)$/iu;
const shareCommand = new RegExp(`^(隐藏|取消显示|关闭|关掉|off|禁用|停止|显示|展示|开启|打开|on|启用|启动)(${shiyu}|${hard}|${deadly}|${holo}|${voidFront}|${towerS3}|${towerS4})?(?:群(?:内)?)?排名\\s*([1-9]\\d{0,2})?$`, "iu");
const shiyuLabel = new RegExp(`^${shiyu}$`, "u");
const voidFrontLabel = new RegExp(`^${voidFront}$`, "u");
const holoLabel = new RegExp(`^${holo}$`, "u");
const hardLabel = new RegExp(`^${hard}$`, "u");
const ratingWeight = { "S+": 5, S: 4, A: 3, B: 2, C: 1, "A+": 0, D: 0 } as const;

export function rankType(mode: RankMode): RankType {
  return mode === "DEADLY_HARD" ? "DEADLY" : mode;
}

export function rankTowerSeason(type: RankType): 3 | 4 | undefined {
  return type === "CLIMBING_TOWER_S3" ? 3 : type === "CLIMBING_TOWER_S4" ? 4 : undefined;
}

export function isOwnedRank(type: RankType): type is "HOLO_BOSS" | "VOID_FRONT_BATTLE" | TowerRank {
  return type === "HOLO_BOSS" || type === "VOID_FRONT_BATTLE" || rankTowerSeason(type) !== undefined;
}

function namedRank(text: string): RankType {
  if (shiyuLabel.test(text)) return "ABYSS";
  if (holoLabel.test(text)) return "HOLO_BOSS";
  if (voidFrontLabel.test(text)) return "VOID_FRONT_BATTLE";
  if (towerS3Label.test(text)) return "CLIMBING_TOWER_S3";
  if (towerS4Label.test(text)) return "CLIMBING_TOWER_S4";
  return "DEADLY";
}

export function rankCommand(command: string) {
  const text = command.replace(prefix, "");
  if (text === command) return;
  if (/^(?:爬塔|鏖战)排名$/u.test(text)) return { kind: "tower-help" as const };
  const action = shareCommand.exec(text);
  if (action) {
    const profileId = Number(action[3] ?? 1);
    if (profileId > MAX_PROFILE_ID) return;
    const types: RankType[] = action[2] ? [namedRank(action[2])] : ["ABYSS", "DEADLY"];
    return { kind: "visibility" as const, enabled: !hidden.test(action[1]!), types, profileId };
  }
  const board = boardCommand.exec(text)?.[1];
  if (board) {
    const mode: RankMode = hardLabel.test(board) ? "DEADLY_HARD" : namedRank(board);
    return { kind: "board" as const, mode };
  }
}

export function domesticRegion(value: string): value is RankProfile["region"] {
  return value === "prod_gf_cn" || value === "prod_qd_cn";
}

export function rankIdentity(uid: string, region: string) {
  if (/^[1-9]\d{7,8}$/u.test(uid) && domesticRegion(region)) return `${region}:${uid}`;
}

export function idOf(value: unknown) {
  const valid = typeof value === "number" && Number.isSafeInteger(value) || typeof value === "string";
  const id = valid ? String(value) : "";
  if (/^[1-9]\d{0,15}$/u.test(id)) return id;
}

function timestamp(value: unknown) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u.test(value)) {
    const millis = Date.parse(value.replace(" ", "T") + "+08:00");
    if (Number.isFinite(millis)) return millis;
  }
}

export function currentPeriod(snapshot: RankSnapshot, now: number) {
  if ("seasons" in snapshot) return snapshot.status === "available" ? Number.MAX_SAFE_INTEGER : undefined;
  if (snapshot.scheduleType !== 1 || snapshot.status !== "available") return;
  if ("stages" in snapshot) {
    const start = timestamp(snapshot.start);
    const ends = snapshot.rankEndsAt;
    if (ends !== undefined && Number.isSafeInteger(ends) && ends >= now && (start === undefined || start <= now)) return ends;
    return;
  }
  const start = timestamp(snapshot.period?.start);
  const end = timestamp(snapshot.period?.end);
  if (start !== undefined && end !== undefined && start <= now && now <= end) return end;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 999_999_999;
}

export function rankRow(mode: RankMode, profile: RankProfile, snapshot: RankSnapshot, now: number, source: RankRow["source"], observedAt?: number): RankRow | undefined {
  if (profile.uid !== snapshot.uid || profile.region !== snapshot.region) return;
  const expiresAt = currentPeriod(snapshot, now);
  if (!expiresAt) return;
  const season = rankTowerSeason(rankType(mode));
  if (season && "seasons" in snapshot) {
    const record = snapshot.seasons.find(item => item.number === season);
    if (!record || !finite(record.score) || !finite(record.layer) || !finite(record.mvp)) return;
    return { ...profile, score: record.score, bonus: 0, latest: 0, expiresAt, teams: [], source,
      tower: { layer: record.layer, noDamage: record.mvp, medal: record.medal } };
  }
  if (mode === "VOID_FRONT_BATTLE" && "stages" in snapshot) {
    if (snapshot.endingUnlocked !== true || !snapshot.finalStage || !finite(snapshot.totalScore)) return;
    const start = timestamp(snapshot.start) ?? 0;
    const cleared = [snapshot.finalStage, ...snapshot.stages].map(stage => timestamp(stage.clearedAt) ?? 0);
    if (cleared.some(time => time <= 0 || time < start || time > now)) return;
    const latest = Math.max(...cleared);
    return { ...profile, score: snapshot.totalScore, bonus: 0, latest, expiresAt, teams: [],
      voidFront: { finalStage: snapshot.finalStage, stages: snapshot.stages }, source };
  }
  if (mode === "HOLO_BOSS" && "bosses" in snapshot) {
    if (!snapshot.bosses.length || !finite(snapshot.totalStars) || !finite(snapshot.totalDuration) ||
        !finite(snapshot.undamaged) || snapshot.undamaged > snapshot.bosses.length) return;
    return { ...profile, score: snapshot.totalDuration, bonus: snapshot.totalStars,
      latest: observedAt && observedAt <= now ? observedAt : now, expiresAt, teams: [],
      holo: { bosses: snapshot.bosses, undamaged: snapshot.undamaged }, source };
  }
  if (mode === "ABYSS" && "layers" in snapshot) {
    const teams = snapshot.layers.find(layer => layer.number === 5)?.teams;
    const score = snapshot.overall?.score;
    if (!teams?.length || !finite(score)) return;
    const rating = snapshot.overall?.rating;
    const latest = Math.max(...teams.map(team => timestamp(team.challengeTime) ?? 0)) || now;
    return { ...profile, score, bonus: rating ? ratingWeight[rating] ?? 0 : 0, latest, expiresAt, rating, teams, source };
  }
  if ((mode === "DEADLY" || mode === "DEADLY_HARD") && "trial" in snapshot) {
    const teams = mode === "DEADLY_HARD" ? snapshot.hard : snapshot.trial;
    const hard = mode === "DEADLY_HARD";
    if (hard && (!teams.length || teams.some(team => !finite(team.score)))) return;
    const score = hard ? teams.reduce((sum, team) => sum + team.score!, 0) : snapshot.totalScore;
    const bonus = hard ? 0 : snapshot.totalStars;
    if (!finite(score) || !finite(bonus)) return;
    const latest = Math.max(0, ...teams.map(team => timestamp(team.clearedAt) ?? 0)) || now;
    return { ...profile, score, bonus, latest, expiresAt, teams, source };
  }
}

export function sortedRankRows(mode: RankMode, rows: readonly RankRow[]) {
  return [...rows].sort((a, b) => {
    const result = mode === "HOLO_BOSS" ? b.bonus - a.bonus || a.score - b.score || (b.holo?.undamaged ?? 0) - (a.holo?.undamaged ?? 0) :
      mode === "DEADLY" ? b.bonus - a.bonus || b.score - a.score : b.score - a.score || b.bonus - a.bonus;
    const towerTie = a.tower && b.tower ? b.tower.layer - a.tower.layer || b.tower.noDamage - a.tower.noDamage : 0;
    return result || towerTie || a.latest - b.latest || a.uid.localeCompare(b.uid) || a.region.localeCompare(b.region);
  });
}
