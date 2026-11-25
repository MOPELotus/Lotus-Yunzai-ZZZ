import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import { zzzResourceDirectory } from "./card-theme.ts";
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
    return $t("challenge-rank.text_dc4e925566");
  }
  function isOwner() {
    if (signal.aborted || !user || context.isBotMaster?.(user) !== true) return false;
    if (context.message_type === "private" && (!context.privateCredentialSignal || context.privateCredentialSignal.aborted)) return false;
    return context.adapter === "milky" || context.isMaster === true;
  }
  const denied = command.kind === "admin-toggle" ? $t("challenge-rank.text_e3c1df5c60") : $t("challenge-rank.text_2457e1bd85");
  if (!isOwner()) return denied;
  const redis = globalThis.redis;
  if (!redis) return $t("challenge-rank.text_0bd2d2d617");
  try {
    if (group && !await rankMembership(context, group.actor)) return $t("challenge-rank.text_f9fd277d3d");
    if (!isOwner()) return denied;
    if (command.kind === "admin-clear" && group) {
      if (await createChallengeRankStore(redis).clearShiyu(group.group)) {
        return $t("challenge-rank.text_1b5edd625f");
      }
    }
    if (command.kind === "admin-toggle" && await setRankGroupEnabled(redis, command.enabled)) {
      return command.enabled ? $t("challenge-rank.text_dc7cf27750") :
        $t("challenge-rank.text_f686a21af5");
    }
    return $t("challenge-rank.text_682f347ed7");
  } catch {
    return $t("challenge-rank.text_682f347ed7");
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
        return [scope ? undefined : $t("challenge-rank.text_3b1a607871"), $t("challenge-rank.text_c2cf2b0e72"),
          $t("challenge-rank.text_9fcf352858"), $t("challenge-rank.text_5334b00788"),
          $t("challenge-rank.text_cbab07d3b4"), $t("challenge-rank.text_55f0733049"),
          $t("challenge-rank.text_fc5abe2522")].filter(Boolean).join("\n");
      }
      if (!scope) return $t("challenge-rank.text_dc4e925566");
      const redis = globalThis.redis;
      if (!redis) return $t("challenge-rank.text_8d7a032aee");
      const store = createChallengeRankStore(redis);
      const { group, actor } = scope;

      try {
        if (command.kind === "visibility") {
          if (!await rankMembership(context, actor)) return $t("challenge-rank.text_f9fd277d3d");
          const ownedType = command.types.find(isOwnedRank);
          const role = ownedType ?
            (await ownedRankRole(profiles, actor, command.profileId).catch(() => undefined))?.role :
            await profiles.savedRole(actor, command.profileId, "zzz").catch(() => undefined);
          if (!role || !rankIdentity(role.uid, role.region)) return ownedType ?
            $t("challenge-rank.text_7ff656ddba", { "value1": rankLabels[ownedType] }) : $t("challenge-rank.text_6e7b4ff3ac");
          if (signal.aborted) return;
          await store.setVisibility(group, command.types, role.uid, role.region, command.enabled, { qq: actor, profileId: command.profileId });
          return [{
            type: "at" as const, qq: actor,
          }, $t("challenge-rank.text_b09172acbf", { "uid": role.uid, "value2": command.types.map(type => rankLabels[type]).join("、"), "value3": command.enabled ? $t("challenge-rank.text_4e1449e7d5") : $t("challenge-rank.text_145219e726") })];
        }

        const { mode } = command;
        const name = rankLabels[mode];
        const settings = await readRankConfig(group);
        if (!settings.allowed) return $t("challenge-rank.text_13c5673406", { "name": name });
        const members = await rankMembership(context, actor);
        if (!members) return $t("challenge-rank.text_f9fd277d3d");
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
          if (season) return $t("challenge-rank.text_3b5f19a85b", { "season": season, "value2": season });
          const include = mode === "ABYSS" ? $t("challenge-rank.text_2c73012572") : mode === "HOLO_BOSS" ? $t("challenge-rank.text_90d20e4089") : mode === "VOID_FRONT_BATTLE" ? $t("challenge-rank.text_5fe46e6ded") : $t("challenge-rank.text_d5636be4da");
          return $t("challenge-rank.text_2bdf276b7b", { "name": name, "include": include, "value3": include });
        }
        const result = await renderChallengeRank(mode, rows, {
          signal, legacyResources: zzzResourceDirectory(), inlineImageByteLimit: context.inlineImageByteLimit,
        }).catch(() => undefined);
        if (signal.aborted) return;
        const after = await rankMembership(context, actor);
        if (!after || !(await Promise.all(rows.map(roleKeepsOwnership))).every(Boolean) ||
            !(await readRankConfig(group)).allowed || !await store.stillVisible(group, mode, after, rows, Date.now(), generation)) {
          return $t("challenge-rank.text_164398a2cd");
        }
        if (signal.aborted) return;
        if (result) return { type: "image" as const, file: result.png };
        const season = rankTowerSeason(rankType(mode));
        return [$t("challenge-rank.text_75328387da", { "name": name }), ...rows.map((row, index) => {
          const member = `${index + 1}. ${row.nickname}`;
          if (row.holo) return $t("challenge-rank.text_4933ee76a2", { "member": member, "bonus": row.bonus, "value3": holoBossDuration(row.score), "undamaged": row.holo.undamaged });
          if (row.tower && season) {
            const metrics = [...(season >= 3 ? [$t("challenge-rank.text_60ff550fcf", { "score": row.score })] : []), $t("challenge-rank.text_d1c41e0dde", { "layer": row.tower.layer })];
            if (row.tower.noDamage !== undefined) metrics.push($t("challenge-rank.text_7fc38da62a", { "noDamage": row.tower.noDamage }));
            return [member, ...metrics].join(" · ");
          }
          return `${member} · ${row.score}`;
        })].join("\n");
      } catch {
        if (!signal.aborted) return $t("challenge-rank.text_8d7a032aee");
      }
    },
  };
}
