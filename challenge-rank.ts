import type { createProfileStore, GameRole } from "@lotus-yunzai/account";
import {
  currentPeriod, domesticRegion, idOf, rankCommand, rankIdentity, rankLabels, sortedRankRows,
  type RankRow, type RankSnapshot, type RankType,
} from "./challenge-rank-model.ts";
import { createChallengeRankStore, readRankConfig } from "./challenge-rank-store.ts";
import { renderChallengeRank } from "./challenge-rank-card.ts";

export interface ChallengeRankContext {
  readonly user_id?: number;
  readonly group_id?: number;
  readonly message_type?: string;
  readonly isDelegated?: boolean;
  readonly listCheckinGroupMembers?: () => Promise<readonly { id: number; name?: string }[] | undefined>;
}

async function membership(context: ChallengeRankContext, actor: string) {
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

function groupFor(context: ChallengeRankContext) {
  if (context.message_type === "group" && !context.isDelegated) {
    const group = idOf(context.group_id);
    const actor = idOf(context.user_id);
    if (group && actor) return { group, actor };
  }
}

export function createZzzChallengeRanks(profiles: ReturnType<typeof createProfileStore>, signal: AbortSignal) {
  async function roleKeepsOwnership(row: RankRow) {
    if (row.source === "legacy") return true;
    if (!row.profileId) return false;
    const role = await profiles.savedRole(row.qq, row.profileId, "zzz").catch(() => undefined);
    return role?.uid === row.uid && role.region === row.region;
  }

  return {
    async remember(context: ChallengeRankContext, profileId: number, role: GameRole, snapshot: RankSnapshot,
      type: RankType, requestedAt: number, verify: () => Promise<boolean>) {
      const scope = groupFor(context);
      const redis = globalThis.redis;
      if (!scope || !redis || !currentPeriod(snapshot, Date.now()) || !domesticRegion(snapshot.region)) return;
      try {
        if (!(await readRankConfig(scope.group)).allowed || !await membership(context, scope.actor) ||
            signal.aborted || !await verify() || signal.aborted) return;
        return await createChallengeRankStore(redis).remember(scope.group, type, {
          qq: scope.actor, profileId, uid: snapshot.uid, region: snapshot.region,
          nickname: role.nickname, level: role.level === undefined ? undefined : Number(role.level), regionName: role.regionName,
        }, snapshot, requestedAt);
      } catch {
        return;
      }
    },
    async handle(context: ChallengeRankContext, command: NonNullable<ReturnType<typeof rankCommand>>) {
      const scope = groupFor(context);
      if (!scope) return "请在群聊中使用该命令！";
      const redis = globalThis.redis;
      if (!redis) return "绝区零群排名暂时不可用。";
      const store = createChallengeRankStore(redis);
      const { group, actor } = scope;

      try {
        if (command.kind === "visibility") {
          if (!await membership(context, actor)) return "暂无法核对当前群成员，请稍后重试。";
          const role = await profiles.savedRole(actor, command.profileId, "zzz").catch(() => undefined);
          if (!role || !rankIdentity(role.uid, role.region)) return "未绑定国服绝区零 UID，请先绑定。";
          if (signal.aborted) return;
          await store.setVisibility(group, command.types, role.uid, role.region, command.enabled);
          return [{
            type: "at" as const, qq: actor,
          }, `绝区零 UID ${role.uid}，${command.types.map(type => rankLabels[type]).join("、")}排名已设为${command.enabled ? "显示" : "隐藏"}。`];
        }

        const { mode } = command;
        const name = rankLabels[mode];
        const settings = await readRankConfig(group);
        if (!settings.allowed) return `当前群${name}排名功能已关闭！`;
        const members = await membership(context, actor);
        if (!members) return "暂无法核对当前群成员，请稍后重试。";
        const candidates = await store.rows(group, mode, members, Date.now());
        const rows: RankRow[] = [];
        for (const row of sortedRankRows(mode, candidates)) {
          if (await roleKeepsOwnership(row)) rows.push(row);
          if (signal.aborted) return;
          if (rows.length >= settings.maximum) break;
        }
        if (!rows.length) {
          const include = mode === "ABYSS" ? "深渊" : "危局";
          return `没有${name}排名，请先 %显示${include}排名，并在本群用 %${include} 查询本期战绩。`;
        }
        const result = await renderChallengeRank(mode, rows, {
          signal, legacyResources: Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR,
        }).catch(() => undefined);
        if (signal.aborted) return;
        const after = await membership(context, actor);
        if (!after || !(await readRankConfig(group)).allowed || !await store.stillVisible(group, mode, after, rows, Date.now()) ||
            !(await Promise.all(rows.map(roleKeepsOwnership))).every(Boolean)) {
          return "群排名的成员或可见状态已变化，请重新查询。";
        }
        if (signal.aborted) return;
        if (result) return { type: "image" as const, file: result.png };
        return [`${name}排名`, ...rows.map((row, index) => `${index + 1}. ${row.nickname} · ${row.score}`)].join("\n");
      } catch {
        if (!signal.aborted) return "绝区零群排名暂时不可用。";
      }
    },
  };
}
