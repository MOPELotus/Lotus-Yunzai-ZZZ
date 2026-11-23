import type { createProfileStore, GameRole } from "@lotus-yunzai/account";
import { previewRedeemIdentity } from "@lotus-yunzai/hoyo-client/redeem-submit";
import {
  currentPeriod, domesticRegion, idOf, isOwnedRank, rankCommand, rankIdentity, rankLabels, rankTowerSeason, rankType, sortedRankRows,
  type RankRow, type RankSnapshot, type RankType,
} from "./challenge-rank-model.ts";
import { createChallengeRankStore, readRankConfig, setRankGroupEnabled, type RankGeneration } from "./challenge-rank-store.ts";
import { holoBossDuration } from "./holo-boss-card.ts";
import { renderChallengeRank } from "./challenge-rank-card.ts";

export interface ChallengeRankContext {
  readonly user_id?: number;
  readonly group_id?: number;
  readonly message_type?: string;
  readonly adapter?: string;
  readonly inlineImageByteLimit?: number;
  readonly isMaster?: boolean;
  readonly isBotMaster?: (userId: number) => boolean;
  readonly privateCredentialSignal?: AbortSignal;
  readonly isDelegated?: boolean;
  readonly listCheckinGroupMembers?: () => Promise<readonly { id: number; name?: string }[] | undefined>;
}

export async function rankMembership(context: ChallengeRankContext, actor: string) {
  const list = await context.listCheckinGroupMembers?.().catch(() => undefined);
  if (!Array.isArray(list) || list.length < 1 || list.length > 10_000) return;
  const members = new Set<string>();
  for (const item of list) {
    const id = typeof item?.id === "number" && idOf(item.id);
    if (!id || members.has(id)) return;
    members.add(id);
  }
  if (members.has(actor)) return members;
}

export function rankGroup(context: ChallengeRankContext) {
  if (context.message_type === "group" && !context.isDelegated) {
    const group = idOf(context.group_id);
    const actor = idOf(context.user_id);
    if (group && actor) return { group, actor };
  }
}

export async function ownedRankRole(profiles: ReturnType<typeof createProfileStore>, qq: string, profileId: number) {
  const before = await profiles.requestContext(qq, profileId, "zzz");
  const selected = await profiles.savedRole(qq, profileId, "zzz");
  const source = await profiles.requestContext(qq, profileId, "zzz", selected.uid);
  if (source.revision === before.revision && source.role.uid === selected.uid && source.role.region === selected.region &&
      source.role.gameBiz === "nap_cn" && source.role.gameBiz === selected.gameBiz &&
      rankIdentity(selected.uid, selected.region) && previewRedeemIdentity(source)) return source;
}

type AdminCommand = { readonly kind: "admin-toggle"; readonly enabled: boolean } | { readonly kind: "admin-clear" };

async function manageZzzChallengeRanks(context: ChallengeRankContext, command: AdminCommand, signal: AbortSignal) {
  const group = rankGroup(context);
  const user = context.user_id;
  if (context.isDelegated || (context.message_type !== "private" && !group) || (command.kind === "admin-clear" && !group)) {
    return "请在群聊中使用该命令！";
  }
  function isOwner() {
    if (signal.aborted || !user || context.isBotMaster?.(user) !== true) return false;
    if (context.message_type === "private" && (!context.privateCredentialSignal || context.privateCredentialSignal.aborted)) return false;
    return context.adapter === "milky" || context.isMaster === true;
  }
  const denied = command.kind === "admin-toggle" ? "仅限主人设置。" : "仅限主人操作。";
  if (!isOwner()) return denied;
  const redis = globalThis.redis;
  if (!redis) return "绝区零群榜设置暂时不可用。";
  try {
    if (group && !await rankMembership(context, group.actor)) return "暂无法核对当前群成员，请稍后重试。";
    if (!isOwner()) return denied;
    if (command.kind === "admin-clear" && group) {
      if (await createChallengeRankStore(redis).clearShiyu(group.group)) {
        return "已清空本群式舆防卫战排行榜。群成员查询本期战绩后可重新登记。";
      }
    }
    if (command.kind === "admin-toggle" && await setRankGroupEnabled(redis, command.enabled)) {
      return command.enabled ? "已开启绝区零群榜总开关。此设置影响所有群，黑名单中的群仍不可使用。" :
        "已关闭绝区零群榜总开关。此设置影响所有群，白名单中的群仍可使用。";
    }
    return "群榜操作未确认，请稍后查询。";
  } catch {
    return "群榜操作未确认，请稍后查询。";
  }
}

export function createZzzChallengeRanks(profiles: ReturnType<typeof createProfileStore>, signal: AbortSignal) {
  async function roleKeepsOwnership(row: RankRow) {
    if (row.holo || row.voidFront || row.tower) {
      const active = row.profileId && await ownedRankRole(profiles, row.qq, row.profileId).catch(() => undefined);
      return !!active && active.role.uid === row.uid && active.role.region === row.region;
    }
    if (row.source === "legacy") return true;
    if (!row.profileId) return false;
    const role = await profiles.savedRole(row.qq, row.profileId, "zzz").catch(() => undefined);
    return role?.uid === row.uid && role.region === row.region;
  }

  return {
    async captureShiyuGeneration(context: ChallengeRankContext) {
      const scope = rankGroup(context);
      const redis = globalThis.redis;
      if (!scope || !redis || signal.aborted) return;
      return createChallengeRankStore(redis).generation(scope.group, "ABYSS").catch(() => undefined);
    },
    async remember(context: ChallengeRankContext, profileId: number, role: GameRole, snapshot: RankSnapshot,
      type: RankType, requestedAt: number, verify: () => Promise<boolean>, generation?: RankGeneration) {
      const scope = rankGroup(context);
      const redis = globalThis.redis;
      if (!scope || !redis || (type === "ABYSS" && generation === undefined) ||
          !currentPeriod(snapshot, Date.now()) || !domesticRegion(snapshot.region)) return;
      try {
        if (!(await readRankConfig(scope.group)).allowed || !await rankMembership(context, scope.actor) ||
            signal.aborted || !await verify() || signal.aborted) return;
        if (isOwnedRank(type)) {
          const active = await ownedRankRole(profiles, scope.actor, profileId);
          if (!active || active.role.uid !== snapshot.uid || active.role.region !== snapshot.region || !await verify() || signal.aborted) return;
        }
        return await createChallengeRankStore(redis).remember(scope.group, type, {
          qq: scope.actor, profileId, uid: snapshot.uid, region: snapshot.region,
          nickname: role.nickname, level: role.level === undefined ? undefined : Number(role.level), regionName: role.regionName,
        }, snapshot, requestedAt, generation);
      } catch {
        return;
      }
    },
    async handle(context: ChallengeRankContext, command: NonNullable<ReturnType<typeof rankCommand>>) {
      if (command.kind === "admin-toggle" || command.kind === "admin-clear") return manageZzzChallengeRanks(context, command, signal);
      const scope = rankGroup(context);
      if (command.kind === "tower-help") {
        return [scope ? undefined : "请在群聊中查询排名！", "当前可查的爬塔排名：",
          "%爬塔S1排名（拟真鏖战试炼）", "%爬塔S2排名（鏖战试炼：末路）",
          "%爬塔S3排名（鏖战试炼：荣耀）", "%爬塔S4排名（鏖战试炼：狂澜）",
          "使用 %显示爬塔S1排名 或 %隐藏爬塔S1排名 设置该季，季号可换。"].filter(Boolean).join("\n");
      }
      if (!scope) return "请在群聊中使用该命令！";
      const redis = globalThis.redis;
      if (!redis) return "绝区零群排名暂时不可用。";
      const store = createChallengeRankStore(redis);
      const { group, actor } = scope;

      try {
        if (command.kind === "visibility") {
          if (!await rankMembership(context, actor)) return "暂无法核对当前群成员，请稍后重试。";
          const ownedType = command.types.find(isOwnedRank);
          const role = ownedType ?
            (await ownedRankRole(profiles, actor, command.profileId).catch(() => undefined))?.role :
            await profiles.savedRole(actor, command.profileId, "zzz").catch(() => undefined);
          if (!role || !rankIdentity(role.uid, role.region)) return ownedType ?
            `请先登录并选择已认证的国服绝区零角色，再设置${rankLabels[ownedType]}排名。` : "未绑定国服绝区零 UID，请先绑定。";
          if (signal.aborted) return;
          await store.setVisibility(group, command.types, role.uid, role.region, command.enabled, { qq: actor, profileId: command.profileId });
          return [{
            type: "at" as const, qq: actor,
          }, `绝区零 UID ${role.uid}，${command.types.map(type => rankLabels[type]).join("、")}排名已设为${command.enabled ? "显示" : "隐藏"}。`];
        }

        const { mode } = command;
        const name = rankLabels[mode];
        const settings = await readRankConfig(group);
        if (!settings.allowed) return `当前群${name}排名功能已关闭！`;
        const members = await rankMembership(context, actor);
        if (!members) return "暂无法核对当前群成员，请稍后重试。";
        const generation = await store.generation(group, rankType(mode));
        const candidates = await store.rows(group, mode, members, Date.now(), generation);
        const rows: RankRow[] = [];
        for (const row of sortedRankRows(mode, candidates)) {
          if (await roleKeepsOwnership(row)) rows.push(row);
          if (signal.aborted) return;
          if (rows.length >= settings.maximum) break;
        }
        if (!rows.length) {
          const season = rankTowerSeason(rankType(mode));
          if (season) return `没有爬塔S${season}排名，请先 %显示爬塔S${season}排名，并在本群用 %爬塔 查询战绩。`;
          const include = mode === "ABYSS" ? "深渊" : mode === "HOLO_BOSS" ? "拟境" : mode === "VOID_FRONT_BATTLE" ? "临界" : "危局";
          return `没有${name}排名，请先 %显示${include}排名，并在本群用 %${include} 查询本期战绩。`;
        }
        const result = await renderChallengeRank(mode, rows, {
          signal, legacyResources: Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR, inlineImageByteLimit: context.inlineImageByteLimit,
        }).catch(() => undefined);
        if (signal.aborted) return;
        const after = await rankMembership(context, actor);
        if (!after || !(await Promise.all(rows.map(roleKeepsOwnership))).every(Boolean) ||
            !(await readRankConfig(group)).allowed || !await store.stillVisible(group, mode, after, rows, Date.now(), generation)) {
          return "群排名的成员或可见状态已变化，请重新查询。";
        }
        if (signal.aborted) return;
        if (result) return { type: "image" as const, file: result.png };
        const season = rankTowerSeason(rankType(mode));
        return [`${name}排名`, ...rows.map((row, index) => {
          const member = `${index + 1}. ${row.nickname}`;
          if (row.holo) return `${member} · ${row.bonus} 星 · ${holoBossDuration(row.score)} · 无伤 ${row.holo.undamaged}`;
          if (row.tower && season) {
            const metrics = [...(season >= 3 ? [`${row.score} 分`] : []), `${row.tower.layer} 层`];
            if (row.tower.noDamage !== undefined) metrics.push(`无伤 ${row.tower.noDamage}`);
            return [member, ...metrics].join(" · ");
          }
          return `${member} · ${row.score}`;
        })].join("\n");
      } catch {
        if (!signal.aborted) return "绝区零群排名暂时不可用。";
      }
    },
  };
}
