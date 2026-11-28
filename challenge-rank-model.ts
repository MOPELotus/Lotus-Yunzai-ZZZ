import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import { zzzChallengeTime } from "./challenge-time.ts";
import { gameCommandProfileId, MAX_PROFILE_ID } from "@lotus-yunzai/account";
import type { ZzzClimbingTowerSnapshot, ZzzDeadlyRoom, ZzzDeadlySnapshot, ZzzHoloBossRoom, ZzzHoloBossSnapshot, ZzzShiyuSnapshot, ZzzShiyuTeam, ZzzVoidFrontSnapshot, ZzzVoidFrontStage } from "@lotus-yunzai/hoyo-client";

export const towerRanks = ["CLIMBING_TOWER_S1", "CLIMBING_TOWER_S2", "CLIMBING_TOWER_S3", "CLIMBING_TOWER_S4"] as const;
type TowerRank = typeof towerRanks[number];
export type RankType = "ABYSS" | "DEADLY" | "HOLO_BOSS" | "VOID_FRONT_BATTLE" | TowerRank;
export type RankMode = RankType | "DEADLY_HARD";
export type RankSnapshot = ZzzShiyuSnapshot | ZzzDeadlySnapshot | ZzzHoloBossSnapshot | ZzzVoidFrontSnapshot | ZzzClimbingTowerSnapshot;

export interface RankProfile {
  readonly qq: string;
  readonly profileId?: number;
  readonly uid: string;
  readonly region: "prod_gf_cn" | "prod_qd_cn" | "prod_gf_us" | "prod_gf_eu" | "prod_gf_jp" | "prod_gf_sg";
  readonly nickname: string;
  readonly level?: number;
  readonly regionName?: string;
}

export interface RankRow extends RankProfile {
  readonly periodKey?: string;
  readonly score: number;
  readonly bonus: number;
  readonly latest: number;
  readonly expiresAt: number;
  readonly rating?: NonNullable<ZzzShiyuSnapshot["overall"]>["rating"];
  readonly holo?: { readonly undamaged: number; readonly bosses: readonly ZzzHoloBossRoom[] };
  readonly voidFront?: { readonly finalStage: ZzzVoidFrontStage; readonly stages: readonly ZzzVoidFrontStage[] };
  readonly tower?: { readonly layer: number; readonly noDamage?: number; readonly medal?: string };
  readonly teams: readonly (ZzzShiyuTeam | ZzzDeadlyRoom)[];
  readonly source: "current" | "legacy";
}

export const rankLabels = {
  ABYSS: $t("challenge-rank-model.text_f718dc4321"),
  DEADLY: $t("challenge-rank-model.text_4b7b8e83d9"),
  DEADLY_HARD: $t("challenge-rank-model.text_fd7c4e8e42"),
  HOLO_BOSS: $t("challenge-rank-model.text_29e80a0630"),
  VOID_FRONT_BATTLE: $t("challenge-rank-model.text_86bf7c9458"),
  CLIMBING_TOWER_S1: $t("challenge-rank-model.text_16a75e0027"),
  CLIMBING_TOWER_S2: $t("challenge-rank-model.text_98f7195705"),
  CLIMBING_TOWER_S3: $t("challenge-rank-model.text_7a30bc3a6a"),
  CLIMBING_TOWER_S4: $t("challenge-rank-model.text_b180896959"),
} as const;
const prefix = /^(?:[#/](?:zzz|绝区零)(?:zzz|绝区零)?|[%％](?:zzz|绝区零)?|zzz|绝区零)/iu;
const shiyu = $t("challenge-rank-model.text_37f15e8ae8");
const deadly = $t("challenge-rank-model.text_fc96c707b2");
const holo = $t("challenge-rank-model.text_17c2f9116e");
const voidFront = $t("challenge-rank-model.text_d200104171");
const towerS1 = $t("challenge-rank-model.text_4d6c9eaeb3");
const towerS2 = $t("challenge-rank-model.text_d516880d50");
const towerS3 = $t("challenge-rank-model.text_89627cb961");
const towerS4 = $t("challenge-rank-model.text_1551c7904c");
const hard = $t("challenge-rank-model.text_3bd7c85c4e", { "deadly": deadly, "value2": deadly });
const adminToggle = new RegExp(`^(开启|打开|on|启用|启动|关闭|关掉|off|禁用|停止)群(?:内)?(?:${shiyu}|${deadly}|${voidFront})排名$`, "iu");
const adminClear = new RegExp(`^(?:重置|清空)${shiyu}排名$`, "u");
const boardCommand = new RegExp(`^(${shiyu}|${hard}|${deadly}|${holo}|${voidFront}|${towerS1}|${towerS2}|${towerS3}|${towerS4})排名$`, "iu");
const towerS1Label = new RegExp(`^${towerS1}$`, "iu");
const towerS2Label = new RegExp(`^${towerS2}$`, "iu");
const towerS3Label = new RegExp(`^${towerS3}$`, "iu");
const towerS4Label = new RegExp(`^${towerS4}$`, "iu");
const hidden = /^(?:隐藏|取消显示|关闭|关掉|off|禁用|停止)$/iu;
const shareCommand = new RegExp(`^(隐藏|取消显示|关闭|关掉|off|禁用|停止|显示|展示|开启|打开|on|启用|启动)(${shiyu}|${hard}|${deadly}|${holo}|${voidFront}|${towerS1}|${towerS2}|${towerS3}|${towerS4})?(?:群(?:内)?)?排名\\s*([1-9]\\d{0,2})?$`, "iu");
const shiyuLabel = new RegExp(`^${shiyu}$`, "u");
const voidFrontLabel = new RegExp(`^${voidFront}$`, "u");
const holoLabel = new RegExp(`^${holo}$`, "u");
const hardLabel = new RegExp(`^${hard}$`, "u");
const ratingWeight = { "S+": 5, S: 4, A: 3, B: 2, C: 1, "A+": 0, D: 0 } as const;

export function rankType(mode: RankMode): RankType {
  return mode === "DEADLY_HARD" ? "DEADLY" : mode;
}

export function rankTowerSeason(type: RankType): 1 | 2 | 3 | 4 | undefined {
  if (type === "CLIMBING_TOWER_S1") return 1;
  if (type === "CLIMBING_TOWER_S2") return 2;
  if (type === "CLIMBING_TOWER_S3") return 3;
  if (type === "CLIMBING_TOWER_S4") return 4;
}

export function isOwnedRank(type: RankType): type is "HOLO_BOSS" | "VOID_FRONT_BATTLE" | TowerRank {
  return type === "HOLO_BOSS" || type === "VOID_FRONT_BATTLE" || rankTowerSeason(type) !== undefined;
}

function namedRank(text: string): RankType {
  if (shiyuLabel.test(text)) return "ABYSS";
  if (holoLabel.test(text)) return "HOLO_BOSS";
  if (voidFrontLabel.test(text)) return "VOID_FRONT_BATTLE";
  if (towerS1Label.test(text)) return "CLIMBING_TOWER_S1";
  if (towerS2Label.test(text)) return "CLIMBING_TOWER_S2";
  if (towerS3Label.test(text)) return "CLIMBING_TOWER_S3";
  if (towerS4Label.test(text)) return "CLIMBING_TOWER_S4";
  return "DEADLY";
}

export function rankCommand(command: string) {
  const text = command.replace(prefix, "");
  if (text === command) return;
  const toggle = adminToggle.exec(text);
  if (toggle) return { kind: "admin-toggle" as const, enabled: !hidden.test(toggle[1]!) };
  if (adminClear.test(text)) return { kind: "admin-clear" as const };
  if (/^(?:爬塔|鏖战)排名$/u.test(text)) return { kind: "tower-help" as const };
  const action = shareCommand.exec(text);
  if (action) {
    const profileId = gameCommandProfileId("zzz", action[3]);
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

export function domesticRegion(value: string): value is "prod_gf_cn" | "prod_qd_cn" {
  return value === "prod_gf_cn" || value === "prod_qd_cn";
}

export function rankRegion(value: string): value is RankProfile["region"] {
  return domesticRegion(value) || /^prod_gf_(?:us|eu|jp|sg)$/u.test(value);
}

export function rankIdentity(uid: string, region: string) {
  if (domesticRegion(region) ? /^[1-9]\d{7,8}$/u.test(uid) : rankRegion(region) && /^[1-9]\d{9}$/u.test(uid)) return `${region}:${uid}`;
}

export function idOf(value: unknown) {
  const valid = typeof value === "number" && Number.isSafeInteger(value) || typeof value === "string";
  const id = valid ? String(value) : "";
  if (/^[1-9]\d{0,15}$/u.test(id)) return id;
}


export function currentPeriod(snapshot: RankSnapshot, now: number) {
  if ("seasons" in snapshot) return snapshot.status === "available" ? Number.MAX_SAFE_INTEGER : undefined;
  if (snapshot.scheduleType !== 1 || snapshot.status !== "available") return;
  if ("stages" in snapshot) {
    const start = zzzChallengeTime(snapshot.start, snapshot.region);
    const ends = snapshot.rankEndsAt;
    if (ends !== undefined && Number.isSafeInteger(ends) && ends >= now && (start === undefined || start <= now)) return ends;
    return;
  }
  const start = zzzChallengeTime(snapshot.period?.start, snapshot.region);
  const end = zzzChallengeTime(snapshot.period?.end, snapshot.region);
  if (start !== undefined && end !== undefined && start <= now && now <= end) return end;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 999_999_999;
}

export function rankRow(mode: RankMode, profile: RankProfile, snapshot: RankSnapshot, now: number, source: RankRow["source"], observedAt?: number): RankRow | undefined {
  if (profile.uid !== snapshot.uid || profile.region !== snapshot.region) return;
  const expiresAt = currentPeriod(snapshot, now);
  if (!expiresAt) return;
  const periodKey = "period" in snapshot ? snapshot.period?.start : "stages" in snapshot ? snapshot.start : undefined;
  const subject = { ...profile, ...(periodKey && { periodKey }) };
  const season = rankTowerSeason(rankType(mode));
  if (season && "seasons" in snapshot) {
    const record = snapshot.seasons.find(item => item.number === season);
    if (!record || !finite(record.layer) || (season >= 2 && !finite(record.mvp))) return;
    const score = season <= 2 ? record.layer : record.score;
    if (!finite(score)) return;
    return { ...subject, score, bonus: 0, latest: 0, expiresAt, teams: [], source,
      tower: { layer: record.layer, noDamage: season >= 2 ? record.mvp : undefined, medal: record.medal } };
  }
  if (mode === "VOID_FRONT_BATTLE" && "stages" in snapshot) {
    if (snapshot.endingUnlocked !== true || !snapshot.finalStage || !finite(snapshot.totalScore)) return;
    const start = zzzChallengeTime(snapshot.start, snapshot.region) ?? 0;
    const cleared = [snapshot.finalStage, ...snapshot.stages].map(stage => zzzChallengeTime(stage.clearedAt, snapshot.region) ?? 0);
    if (cleared.some(time => time <= 0 || time < start || time > now)) return;
    const latest = Math.max(...cleared);
    return { ...subject, score: snapshot.totalScore, bonus: 0, latest, expiresAt, teams: [],
      voidFront: { finalStage: snapshot.finalStage, stages: snapshot.stages }, source };
  }
  if (mode === "HOLO_BOSS" && "bosses" in snapshot) {
    if (!snapshot.bosses.length || !finite(snapshot.totalStars) || !finite(snapshot.totalDuration) ||
        !finite(snapshot.undamaged) || snapshot.undamaged > snapshot.bosses.length) return;
    return { ...subject, score: snapshot.totalDuration, bonus: snapshot.totalStars,
      latest: observedAt && observedAt <= now ? observedAt : now, expiresAt, teams: [],
      holo: { bosses: snapshot.bosses, undamaged: snapshot.undamaged }, source };
  }
  if (mode === "ABYSS" && "layers" in snapshot) {
    const teams = snapshot.layers.find(layer => layer.number === 5)?.teams;
    const score = snapshot.overall?.score;
    if (!teams?.length || !finite(score)) return;
    const rating = snapshot.overall?.rating;
    const latest = Math.max(...teams.map(team => zzzChallengeTime(team.challengeTime, snapshot.region) ?? 0)) || now;
    return { ...subject, score, bonus: rating ? ratingWeight[rating] ?? 0 : 0, latest, expiresAt, rating, teams, source };
  }
  if ((mode === "DEADLY" || mode === "DEADLY_HARD") && "trial" in snapshot) {
    const teams = mode === "DEADLY_HARD" ? snapshot.hard : snapshot.trial;
    const hard = mode === "DEADLY_HARD";
    if (hard && (!teams.length || teams.some(team => !finite(team.score)))) return;
    const score = hard ? teams.reduce((sum, team) => sum + team.score!, 0) : snapshot.totalScore;
    const bonus = hard ? 0 : snapshot.totalStars;
    if (!finite(score) || !finite(bonus)) return;
    const latest = Math.max(0, ...teams.map(team => zzzChallengeTime(team.clearedAt, snapshot.region) ?? 0)) || now;
    return { ...subject, score, bonus, latest, expiresAt, teams, source };
  }
}

export function sortedRankRows(mode: RankMode, rows: readonly RankRow[]) {
  // Servers reset at different instants; never mix two official calendar periods.
  const period = rows.some(row => !domesticRegion(row.region)) ? rows.reduce((latest, row) =>
    row.periodKey && row.periodKey > latest ? row.periodKey : latest, "") : "";
  return rows.filter(row => !period || row.periodKey === period).sort((a, b) => {
    const result = mode === "HOLO_BOSS" ? b.bonus - a.bonus || a.score - b.score || (b.holo?.undamaged ?? 0) - (a.holo?.undamaged ?? 0) :
      mode === "DEADLY" ? b.bonus - a.bonus || b.score - a.score : b.score - a.score || b.bonus - a.bonus;
    const towerTie = a.tower && b.tower ? b.tower.layer - a.tower.layer || (b.tower.noDamage ?? 0) - (a.tower.noDamage ?? 0) : 0;
    return result || towerTie || a.latest - b.latest || a.uid.localeCompare(b.uid) || a.region.localeCompare(b.region);
  });
}
