import { fileURLToPath } from "node:url";
import { createProfileStore, MAX_PROFILE_ID, ProfileError, type GameRole } from "@lotus-yunzai/account";
import { createGachaUpdater } from "@lotus-yunzai/gacha/update";
import {
  createProfileHoyoClient, GameRecordRequestError, HoyoRequestError, isZzzGachaLinkMessage, readZzzGachaLink, resolveZzzGachaLinkRole, resolveZzzTuningRegion,
  ZzzManualGachaLinkRequired, ZzzTuningRateLimitError,
} from "@lotus-yunzai/hoyo-client";
import { readZzzLegacyGacha, ZzzLegacyGachaError } from "./gacha-legacy.ts";
import { buildZzzLegacyDetail } from "./gacha-legacy-detail.ts";
import { createZzzLinkHistory, mergeZzzLegacyWithLinked } from "./gacha-link-history.ts";
import { createZzzGachaLinkSession } from "./gacha-link-session.ts";
import { renderZzzGameRecord } from "./game-record-card.ts";
import { renderZzzDeadly } from "./deadly-card.ts";
import { rankCommand } from "./challenge-rank-model.ts";
import { createZzzChallengeRanks, type ChallengeRankContext } from "./challenge-rank.ts";
import { createZzzPanelCommands, zzzPanelCommand, zzzPanelCommandHint } from "./panel-command.ts";
import { createZzzPoolHistory, zzzPoolHistoryCommand } from "./pool-history.ts";
import { createZzzCurrentPool, zzzCurrentPoolCommand } from "./current-pool.ts";
import { renderZzzShiyu } from "./shiyu-card.ts";
import { createZzzLegacyGachaArtwork, createZzzTuningArtwork } from "./tuning-artwork.ts";
import { buildZzzTuningDetail, buildZzzTuningInventoryReply } from "./tuning-detail.ts";
import { renderZzzTuningDetail } from "./tuning-detail-card.ts";
import { renderZzzTuningFailure, renderZzzTuningResult } from "./tuning-result-card.ts";
import { createZzzTuningSync, ZzzTuningHistoryChangedError } from "./tuning-sync.ts";

const updateCommand = /^#绝区零(?:更新|刷新)抽卡(?:记录|链接)?([1-9]\d{0,2})?$/u;
const viewCommand = /^#绝区零抽卡(?:记录|分析|统计)([1-9]\d{0,2})?$/u;
const linkedViewCommand = /^#绝区零逐抽记录([1-9]\d{0,2})?$/u;
const linkCommand = /^#绝区零抽卡链接([1-9]\d{0,2})?$/u;
const generateLinkCommand = /^#绝区零获取抽卡链接([1-9]\d{0,2})?$/u;
const helpCommand = /^#绝区零抽卡帮助$/u;
const gameRecordCommand = /^#绝区零(?:card|卡片|个人信息|角色)\s*([1-9]\d{0,2})?$/iu;
const shiyuCommand = /^#绝区零(本期|当期|上期|往期)?(?:式舆防卫战|式舆防卫|式舆|深渊|防卫战|防卫)\s*([1-9]\d{0,2})?$/u;
const deadlyCommand = /^#绝区零(本期|当期|上期|往期)?(?:危局强袭战|危局|强袭战|强袭)\s*([1-9]\d{0,2})?$/u;
const legacyPrefix = /^(?:[#/](?:zzz|绝区零)(?:zzz|绝区零)?|[%％](?:zzz|绝区零)?|zzz|绝区零)(?=(?:更新|刷新|获取)?抽卡|逐抽记录|card|卡片|个人信息|角色|(?:本期|当期|上期|往期)?(?:式舆|深渊|防卫|危局|强袭))/iu;
const help = [
  "绝区零抽卡记录",
  "%更新抽卡记录 同步国服米游社的六个频段。",
  "%抽卡记录 查看调频记录，当前登录可用时另发实时库存。",
  "%抽卡链接 私聊录入有效的绝区零官方抽卡链接。",
  "%获取抽卡链接 私聊获取当前国服档案的官方抽卡链接。",
  "%逐抽记录 查看录入的记录和已有旧档案。",
  "国际服绑定档案可查看已有的旧调频记录。",
  "命令末尾可加档案编号，例如 %抽卡记录2。",
].join("\n");
const historyDirectory = fileURLToPath(new URL("../../data/zzzTuningStats/", import.meta.url));
const legacyHistoryDirectory = fileURLToPath(new URL("../../data/zzzGachaJson/", import.meta.url));
const linkHistoryDirectory = fileURLToPath(new URL("../../data/zzzGachaRows/", import.meta.url));

function overseasRegion({ uid, region, gameBiz }: GameRole) {
  if (!/^\d{10}$/u.test(uid)) return;
  try {
    return resolveZzzGachaLinkRole({ uid, region, gameBiz }).region;
  } catch {
    return;
  }
}

interface GachaContext extends ChallengeRankContext {
  readonly adapter?: string;
  readonly normalizedMessage: string;
  readonly self_id?: number;
  readonly user_id?: number;
  readonly message_type?: string;
  reply(message: string | { readonly type: "image"; readonly file: Uint8Array }): unknown;
}

export function createModule({ signal, lockFile }: {
  signal: AbortSignal;
  lockFile: Parameters<typeof createZzzTuningSync>[3];
}) {
  const profiles = createProfileStore(Bun.env.LOTUS_PROFILE_DIR || undefined);
  const client = createProfileHoyoClient(profiles);
  const challengeRanks = createZzzChallengeRanks(profiles, signal);
  const panelCommands = createZzzPanelCommands(profiles, client, lockFile, signal);
  const poolHistory = createZzzPoolHistory(signal);
  const currentPool = createZzzCurrentPool(signal);
  const sync = createZzzTuningSync(profiles, client, historyDirectory, lockFile);
  const syncOfficial = createGachaUpdater((qq, profileId) => sync.sync(qq, profileId, { signal }));
  async function gachaUpdate(qq: string, profileId: number, notify?: () => unknown) {
    const role = await profiles.savedRole(qq, profileId, "zzz");
    if (overseasRegion(role)) throw new ZzzManualGachaLinkRequired();
    return syncOfficial(qq, profileId, notify);
  }
  const legacyHistory = Bun.env.LOTUS_ZZZ_LEGACY_HISTORY_DIR || legacyHistoryDirectory;
  const linkHistory = createZzzLinkHistory(linkHistoryDirectory, lockFile);
  const getLink = createGachaUpdater(async (qq, profileId) => {
    const source = await profiles.requestContext(qq, profileId, "zzz");
    const result = await client.fetchZzzGachaAuthKey(source, { signal });
    const latest = await profiles.requestContext(qq, profileId, "zzz").catch(() => undefined);
    if (latest?.revision !== result.revision || latest.role.uid !== result.uid) {
      throw new ProfileError("changed", "绝区零档案角色已变化。");
    }
    return result.url.href;
  });
  const linkSession = createZzzGachaLinkSession({
    signal,
    savedRole: (qq, profileId) => profiles.savedRole(qq, profileId, "zzz"),
    async importLink(qq, profileId, link, verifyProfile) {
      const snapshot = await readZzzGachaLink(link, fetch, { signal }, verifyProfile);
      const identity = { qq, uid: snapshot.uid, region: snapshot.region };
      const legacy = await readZzzLegacyGacha(legacyHistory, qq, identity.uid);
      mergeZzzLegacyWithLinked(legacy, snapshot);
      const { stats, added } = await linkHistory.merge(identity, snapshot, verifyProfile);
      const records = mergeZzzLegacyWithLinked(legacy, stats)!.pools;
      const lines = stats.pools.map(({ name, type }) =>
        `${name} · 本次录入 ${added[type]} 条，合并旧档共 ${records.find((pool) => pool.type === type)?.records.length ?? 0} 条`);
      const command = `%逐抽记录${profileId === 1 ? "" : profileId}`;
      return { type: "forward", nodes: ["绝区零抽卡链接录入完成。", ...lines, `发送 ${command} 查看。`] };
    },
  });

  async function gameRecord(context: GachaContext, profileId: number) {
    const { user_id: user } = context;
    if ((context.message_type !== "private" && context.message_type !== "group") ||
        typeof user !== "number" || !Number.isSafeInteger(user) || user < 1) {
      return "请从登录档案对应的 QQ 会话查询绝区零战绩。";
    }
    const qq = String(user);
    try {
      const source = await profiles.requestContext(qq, profileId, "zzz");
      const record = await client.fetchZzzGameRecord(source, { signal });
      const { png } = await renderZzzGameRecord(record, source.role,
        { qq, signal, legacyResources: Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR });
      const active = await profiles.requestContext(qq, profileId, "zzz").catch(() => undefined);
      if (signal.aborted) return [];
      if (active?.revision !== record.revision || active.role.uid !== record.uid) {
        return "绝区零档案已变化，请重新查询战绩。";
      }
      return { type: "image" as const, file: png };
    } catch (error) {
      if (signal.aborted) return [];
      if (error instanceof ProfileError) {
        if (error.code === "missing" || error.code === "login-required") return `[zzz] 请先登录 profile ${profileId}。`;
        if (error.code === "role-missing") return `[zzz] profile ${profileId} 没有同步绝区零 UID。`;
      }
      if (error instanceof GameRecordRequestError || (error instanceof HoyoRequestError && error.code === "refresh")) {
        return error.message;
      }
      if (error instanceof HoyoRequestError) {
        if (error.code === "profile-changed") return "绝区零档案已变化，请重新查询战绩。";
        if (error.code === "invalid-input") return error.message;
      }
      return "绝区零战绩暂时无法查询。";
    }
  }

  async function battleRecord(context: GachaContext, profileId: number, scheduleType: 1 | 2, mode: "shiyu" | "deadly") {
    const name = mode === "shiyu" ? "式舆防卫战" : "危局强袭战";
    const { user_id: user } = context;
    if ((context.message_type !== "private" && context.message_type !== "group") ||
        typeof user !== "number" || !Number.isSafeInteger(user) || user < 1) {
      return `请从登录档案对应的 QQ 会话查询${name}。`;
    }
    const qq = String(user);
    const period = scheduleType === 2 ? "上期" : "本期";
    try {
      const source = await profiles.requestContext(qq, profileId, "zzz");
      const request = { scheduleType, signal };
      const requestedAt = Date.now();
      const snapshot = await (mode === "shiyu" ? client.fetchZzzShiyu(source, request) : client.fetchZzzDeadly(source, request));
      if (snapshot.status === "older-format") return `${period}${name}使用旧版深渊战绩格式。`;
      if (snapshot.status === "empty") return `${period}暂无${name}战绩。`;
      async function stillActive() {
        const active = await profiles.requestContext(qq, profileId, "zzz").catch(() => undefined);
        return active?.revision === snapshot.revision && active.role.uid === snapshot.uid;
      }
      const rankVisibility = await challengeRanks.remember(context, profileId, source.role, snapshot,
        mode === "shiyu" ? "ABYSS" : "DEADLY", requestedAt, stillActive);
      const theme = { qq, signal, rankVisibility, legacyResources: Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR };
      const result = await ("trial" in snapshot ? renderZzzDeadly(snapshot, source.role.nickname, theme) :
        renderZzzShiyu(snapshot, source.role, theme)).catch(() => undefined);
      if (signal.aborted) return [];
      const active = await stillActive();
      if (signal.aborted) return [];
      if (!active) {
        return `绝区零档案已变化，请重新查询${name}。`;
      }
      if (result) return { type: "image" as const, file: result.png };
      if ("trial" in snapshot) {
        return [
          `危局强袭战 · ${period}`,
          snapshot.totalScore === undefined ? undefined : `试炼总分 ${snapshot.totalScore}`,
          snapshot.totalStars === undefined ? undefined : `试炼总星级 ${snapshot.totalStars}`,
          ...snapshot.hard.map(room => `绝境 · ${room.name ?? "首领"} · ${room.score ?? "—"}`),
          ...snapshot.trial.map(room => `试炼 · ${room.name ?? "首领"} · ${room.score ?? "—"}`),
        ].filter(Boolean).join("\n");
      }
      const score = snapshot.overall?.score;
      const rating = snapshot.overall?.rating;
      return [`式舆防卫战 · ${period}`, score !== undefined ? `总分 ${score}${rating ? ` · ${rating}` : ""}` : undefined,
        ...snapshot.layers.map(layer => `第 ${layer.number} 防线 · ${layer.teams.length} 队${layer.rating ? ` · ${layer.rating}` : ""}`)]
        .filter(Boolean).join("\n");
    } catch (error) {
      if (signal.aborted) return [];
      if (error instanceof ProfileError) {
        if (error.code === "missing" || error.code === "login-required") return `[zzz] 请先登录 profile ${profileId}。`;
        if (error.code === "role-missing") return `[zzz] profile ${profileId} 没有同步绝区零 UID。`;
      }
      if (error instanceof GameRecordRequestError || (error instanceof HoyoRequestError && error.code === "refresh")) {
        return error.message;
      }
      if (error instanceof HoyoRequestError) {
        if (error.code === "profile-changed") return `绝区零档案已变化，请重新查询${name}。`;
        if (error.code === "invalid-input") return error.message;
      }
      return `${name}暂时无法查询。`;
    }
  }

  async function view(qq: string, profileId: number, context: GachaContext, linkedOnly: boolean) {
    try {
      const role = await profiles.savedRole(qq, profileId, "zzz");
      const { uid } = role;
      const regionOf = (current: GameRole) => linkedOnly ? resolveZzzGachaLinkRole(current).region
        : overseasRegion(current) ?? resolveZzzTuningRegion({ game: "zzz", role: current });
      const region = regionOf(role);
      const useOfficial = !linkedOnly && (region === "prod_gf_cn" || region === "prod_qd_cn");

      async function roleMatches() {
        try {
          const current = await profiles.savedRole(qq, profileId, "zzz");
          return current.uid === uid && regionOf(current) === region;
        } catch {
          return false;
        }
      }

      const nickname = role.nickname || "绳匠";
      const level = role.level === undefined ? undefined : Number(role.level);
      const display = { level: Number.isFinite(level) ? level : undefined, regionName: role.regionName || region };
      let png: Uint8Array;
      if (useOfficial) {
        const cached = await sync.read(qq, { uid, region });
        const stats = cached ?? await client.fetchZzzTuning(await profiles.requestContext(qq, profileId, "zzz", uid), { signal });
        const { avatar, resolveIcon, loadArtwork } = createZzzTuningArtwork(stats, qq, signal);
        const model = buildZzzTuningDetail({ stats, player: { nickname, avatar }, resolveIcon });
        ({ png } = await renderZzzTuningDetail(model, { ...display, loadArtwork }));
      } else {
        const [legacy, linked] = await Promise.all([
          readZzzLegacyGacha(legacyHistory, qq, uid), linkHistory.read(qq, { uid, region }),
        ]);
        const stats = mergeZzzLegacyWithLinked(legacy, linked);
        if (!stats) return linkedOnly ? "该角色还没有绝区零逐抽记录。" : "该角色还没有绝区零旧调频记录。";
        const { avatar, resolveIcon, loadArtwork } = createZzzLegacyGachaArtwork(qq, signal);
        const model = buildZzzLegacyDetail({ stats, player: { nickname, avatar }, resolveIcon });
        ({ png } = await renderZzzTuningDetail(model, { ...display, loadArtwork }));
      }
      if (signal.aborted) return [];
      if (!await roleMatches()) return "绝区零档案角色已变化，请重新查询。";
      if (await context.reply({ type: "image", file: png }) === false) return [];
      if (!useOfficial) return [];

      const live = await profiles.requestContext(qq, profileId, "zzz", uid)
        .then((current) => client.fetchZzzTuningInventory(current, { signal })).catch(() => undefined);
      const inventory = buildZzzTuningInventoryReply({ uid, profileId, live });
      if (signal.aborted || !inventory || !await roleMatches()) return [];
      return context.message_type === "group" ? [{ type: "at" as const, qq }, inventory] : inventory;
    } catch (error) {
      if (signal.aborted) return [];
      if (error instanceof ProfileError) {
        if (error.code === "missing" || error.code === "login-required") return `[zzz] 请先登录 profile ${profileId}。`;
        if (error.code === "role-missing") return `[zzz] profile ${profileId} 没有同步绝区零 UID。`;
      }
      if (error instanceof HoyoRequestError && error.code === "invalid-input") return error.message;
      if (error instanceof HoyoRequestError && error.code === "profile-changed") return "绝区零档案角色已变化，请重新查询。";
      if (error instanceof ZzzTuningRateLimitError) return "访问过于频繁，请稍后再试。";
      if (error instanceof ZzzLegacyGachaError) return error.message;
      return "绝区零抽卡记录暂时无法查看。";
    }
  }

  return {
    commands: {},
    gachaUpdate,
    fallbackFeatures(context: Pick<GachaContext, "normalizedMessage">) {
      const command = context.normalizedMessage.replace(legacyPrefix, "#绝区零");
      if ([helpCommand, generateLinkCommand, linkCommand, updateCommand, linkedViewCommand, viewCommand].some(rule => rule.test(command)) ||
          command.trim() === "取消" || isZzzGachaLinkMessage(command)) return ["[gacha] 抽卡记录"];
      return [];
    },
    async fallback(_message: string, context: GachaContext) {
      const rank = rankCommand(context.normalizedMessage);
      if (rank) return challengeRanks.handle(context, rank);
      const panel = zzzPanelCommand(context.normalizedMessage, context.message_type === "group");
      if (panel) return panelCommands(panel, context);
      const panelHint = zzzPanelCommandHint(context.normalizedMessage);
      if (panelHint) return panelHint;
      if (zzzCurrentPoolCommand.test(context.normalizedMessage)) return currentPool();
      const historyQuery = zzzPoolHistoryCommand(context.normalizedMessage);
      if (historyQuery) return poolHistory(historyQuery, Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR);
      const command = context.normalizedMessage.replace(legacyPrefix, "#绝区零");
      const card = gameRecordCommand.exec(command);
      if (card) {
        const profileId = Number(card[1] ?? 1);
        if (profileId <= MAX_PROFILE_ID) return gameRecord(context, profileId);
        return;
      }
      const shiyu = shiyuCommand.exec(command);
      const battle = shiyu ?? deadlyCommand.exec(command);
      if (battle) {
        const profileId = Number(battle[2] ?? 1);
        if (profileId <= MAX_PROFILE_ID) {
          const scheduleType = battle[1] === "上期" || battle[1] === "往期" ? 2 : 1;
          return battleRecord(context, profileId, scheduleType, shiyu ? "shiyu" : "deadly");
        }
        return;
      }
      if (helpCommand.test(command)) return help;
      const generateLink = generateLinkCommand.exec(command);
      if (generateLink) {
        const profileId = Number(generateLink[1] ?? 1);
        if (profileId > MAX_PROFILE_ID) return;
        if (context.message_type !== "private" || !context.self_id || !Number.isSafeInteger(context.self_id) || context.self_id < 1 ||
            !context.user_id || !Number.isSafeInteger(context.user_id) || context.user_id < 1) {
          return "请私聊获取绝区零抽卡链接。";
        }
        try {
          const url = await getLink(String(context.user_id), profileId);
          if (!signal.aborted) return url ?? "该档案正在获取绝区零抽卡链接，请稍后再试。";
        } catch (error) {
          if (signal.aborted) return;
          if (error instanceof ProfileError) {
            if (error.code === "missing" || error.code === "login-required") return `[zzz] 请先登录 profile ${profileId}。`;
            if (error.code === "role-missing") return `[zzz] profile ${profileId} 没有同步绝区零 UID。`;
            if (error.code === "changed") return "绝区零档案角色已变化，请重新获取。";
          }
          if (error instanceof HoyoRequestError) {
            if (error.code === "profile-changed") return "绝区零档案角色已变化，请重新获取。";
            if (error.status === 429 || error.retcode === -110) return "绝区零抽卡链接获取频繁，请稍后再试。";
            if (error.code === "invalid-input" || error.code === "api" || error.code === "refresh") return error.message;
          }
          return "绝区零抽卡链接获取失败，请稍后重试。";
        }
        return;
      }
      const link = linkCommand.exec(command);
      if (link) {
        const profileId = Number(link[1] ?? 1);
        if (profileId <= MAX_PROFILE_ID) return linkSession(context, profileId);
        return;
      }
      const continuation = await linkSession(context);
      if (continuation !== undefined) return continuation;
      const update = updateCommand.exec(command);
      const linkedOnly = linkedViewCommand.exec(command);
      const matched = update ?? linkedOnly ?? viewCommand.exec(command);
      if (!matched) return;
      const profileId = Number(matched[1] ?? 1);
      if (profileId > MAX_PROFILE_ID) return;
      const { user_id } = context;
      if (typeof user_id !== "number" || !Number.isSafeInteger(user_id) || user_id < 1) {
        return "请从登录档案对应的 QQ 会话使用绝区零抽卡记录。";
      }
      const qq = String(user_id);
      if (!update) return view(qq, profileId, context, linkedOnly !== null);
      try {
        const result = await gachaUpdate(qq, profileId, () =>
          context.reply(`[zzz] 正在为 profile ${profileId} 更新绝区零抽卡记录。`));
        if (!result) return "该档案的绝区零抽卡记录正在更新，请稍后再试。";
        try {
          const { png } = await renderZzzTuningResult(qq, result);
          return { type: "image" as const, file: png };
        } catch {
          return "[zzz] 绝区零抽卡记录更新完成。";
        }
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof ZzzManualGachaLinkRequired) return linkSession(context, profileId);
        if (error instanceof ZzzTuningHistoryChangedError) return "该角色的绝区零抽卡记录已由另一条请求更新。";
        if (error instanceof ProfileError) {
          if (error.code === "missing" || error.code === "login-required") return `[zzz] 请先登录 profile ${profileId}。`;
          if (error.code === "role-missing") return `[zzz] profile ${profileId} 没有同步绝区零 UID。`;
        }
        const reason = error instanceof ZzzTuningRateLimitError ? "rate-limited"
          : (error instanceof ProfileError && error.code === "changed") ||
            (error instanceof HoyoRequestError && error.code === "profile-changed") ? "profile-changed" : "request-failed";
        try {
          const { png } = await renderZzzTuningFailure({ qq, profileId, reason });
          return { type: "image" as const, file: png };
        } catch {
          return "[zzz] 绝区零抽卡记录更新失败，请检查档案登录状态与绝区零 UID。";
        }
      }
    },
  };
}
