import { fileURLToPath } from "node:url";
import type { InboundSegment } from "../../lib/messages.ts";
import { createProfileStore, MAX_PROFILE_ID, ProfileError, type GameRole } from "@lotus-yunzai/account";
import { createGachaUpdater } from "@lotus-yunzai/gacha/update";
import {
  createProfileHoyoClient, GameRecordRequestError, HoyoRequestError, isZzzGachaLinkMessage, readZzzGachaLink, resolveZzzGachaLinkRole, resolveZzzTuningRegion,
  splitZzzExploration, ZzzManualGachaLinkRequired, ZzzTuningRateLimitError, type ZzzExplorationSnapshot, type ZzzGameRecordSnapshot,
  type ZzzHollowMode, type ZzzZenkovMode,
} from "@lotus-yunzai/hoyo-client";
import { readZzzFlatLegacyGacha, readZzzLegacyGachaSources, ZzzLegacyGachaError } from "./gacha-legacy.ts";
import { buildZzzLegacyDetail } from "./gacha-legacy-detail.ts";
import { createZzzLinkHistory, mergeZzzLegacyWithLinked } from "./gacha-link-history.ts";
import { createZzzGachaLinkSession } from "./gacha-link-session.ts";
import { ImageSizeLimitError } from "@lotus-yunzai/skia";
import { zzzRegionName } from "./card-theme.ts";
import { ZzzInlineImageLimitError } from "./challenge-card.ts";
import { renderZzzClimbingTower, zzzClimbingTowerText } from "./climbing-tower-card.ts";
import { createZzzExplorationRenderer, zzzExplorationText } from "./exploration-card.ts";
import { renderZzzGameRecord, zzzGameRecordText } from "./game-record-card.ts";
import { renderZzzDeadly } from "./deadly-card.ts";
import { renderZzzHollowZero, zzzHollowText, zzzHollowTitles } from "./hollow-zero-card.ts";
import { holoBossDuration, renderZzzHoloBoss } from "./holo-boss-card.ts";
import { renderZzzVoidFront } from "./void-front-card.ts";
import { createZzzCinema, zzzCinemaCommand } from "./cinema.ts";
import { createZzzMonthlyArchive } from "./monthly-archive.ts";
import { createZzzMonthlyCommands, zzzMonthlyCommand } from "./monthly-command.ts";
import { rankCommand, towerRanks } from "./challenge-rank-model.ts";
import { startZzzChallengeReminders, type ZzzReminderRuntime } from "./challenge-reminder-runtime.ts";
import { createZzzChallengeReminders, zzzChallengeReminderCommand } from "./challenge-reminder.ts";
import { createZzzChallengeRanks } from "./challenge-rank.ts";
import type { ZzzPanelRankRoleReader } from "./panel-rank-identity.ts";
import { createZzzPanelRanks } from "./panel-rank.ts";
import { createZzzShowcaseClient } from "./enka-showcase.ts";
import { zzzPanelRankCommand } from "./panel-rank-model.ts";
import { createZzzPanelCommands, zzzPanelCommand, zzzPanelCommandHint } from "./panel-command.ts";
import { zzzPanelIntervalCommand } from "./panel-interval-command.ts";
import { createZzzPoolHistory, zzzPoolHistoryCommand } from "./pool-history.ts";
import { createZzzCurrentPool, zzzCurrentPoolCommand } from "./current-pool.ts";
import { createZzzRoleAliasCommands, zzzRoleAliasCommand } from "./role-alias-command.ts";
import { createZzzRecallSettings } from "./recall-settings.ts";
import { createZzzRoleGallery, zzzRoleGalleryCommand, type ZzzRoleGalleryContext } from "./role-gallery.ts";
import { renderZzzShiyu } from "./shiyu-card.ts";
import { createZzzSkillReader } from "./skills-command.ts";
import { zzzSkillCommand } from "./skills-data.ts";
import { createZzzLegacyGachaArtwork, createZzzTuningArtwork } from "./tuning-artwork.ts";
import { buildZzzTuningDetail, buildZzzTuningInventoryReply } from "./tuning-detail.ts";
import { renderZzzTuningDetail } from "./tuning-detail-card.ts";
import { createZzzInventoryQuery, zzzInventoryCommand } from "./tuning-inventory-command.ts";
import { renderZzzTuningFailure, renderZzzTuningResult } from "./tuning-result-card.ts";
import { createZzzTuningSync, ZzzTuningHistoryChangedError } from "./tuning-sync.ts";
import { renderZzzZenkov, zzzZenkovFollowUp, zzzZenkovText } from "./zenkov-card.ts";

const updateCommand = /^#绝区零(?:更新|刷新)抽卡(?:记录|链接)?([1-9]\d{0,2})?$/u;
const viewCommand = /^#绝区零抽卡(?:记录|分析|统计)([1-9]\d{0,2})?$/u;
const linkedViewCommand = /^#绝区零逐抽记录([1-9]\d{0,2})?$/u;
const linkCommand = /^#绝区零抽卡链接([1-9]\d{0,2})?$/u;
const generateLinkCommand = /^#绝区零获取抽卡链接([1-9]\d{0,2})?$/u;
const helpCommand = /^#绝区零抽卡帮助$/u;
const gameRecordCommand = /^#绝区零(?:card|卡片|个人信息|角色)\s*([1-9]\d{0,2})?$/iu;
const shiyuCommand = /^#绝区零(本期|当期|上期|往期)?(?:式舆防卫战|式舆防卫|式舆|深渊|防卫战|防卫)\s*([1-9]\d{0,2})?$/u;
const deadlyCommand = /^#绝区零(本期|当期|上期|往期)?(?:危局强袭战|危局|强袭战|强袭)\s*([1-9]\d{0,2})?$/u;
const holoBossCommand = /^#绝区零(本期|当期|上期|往期)?(?:拟境湮灭战|拟境|湮灭战|湮灭)\s*([1-9]\d{0,2})?$/u;
const voidFrontCommand = /^#绝区零(本期|当期|上期|往期)?(?:临界推演|临界|推演)\s*([1-9]\d{0,2})?$/u;
const climbingTowerCommand = /^#绝区零(?:拟真鏖战试炼|鏖战|爬塔)\s*([1-9]\d{0,2})?$/u;
const hollowHelp = /^#绝区零(?:零号空洞|零号|空洞)$/u;
const hollowCommand = /^#绝区零(枯萎苗圃|枯萎|苗圃|迷失之地|迷失)\s*([1-9]\d{0,2})?$/u;
const zenkovCommand = /^#绝区零(?:迷宫诡域|迷宫|诡域|搜打撤|塔科夫|塔可夫|塔克夫|鸭科夫|绝科夫)(战绩|记录|详情|回顾)?\s*([1-9]\d{0,2})?(?:\s*页\s*([1-9]\d{0,5}))?$/u;
const explorationCommand = /^#绝区零(?:区域收集|收集|探索度|探索)\s*([1-9]\d{0,2})?(?:\s*页\s*([1-9]\d{0,5}))?$/u;
const legacyPrefix = /^(?:[#/](?:zzz|绝区零)(?:zzz|绝区零)?|[%％](?:zzz|绝区零)?|zzz|绝区零)(?=(?:更新|刷新|获取)?抽卡|逐抽记录|card|卡片|个人信息|角色|拟真鏖战试炼|鏖战|爬塔|枯萎|苗圃|迷失|零号|空洞|迷宫|诡域|搜打撤|塔[科可克]夫|鸭科夫|绝科夫|区域收集|收集|探索|monthly|菲林|邦布券|收入|月报|(?:本期|当期|上期|往期)?(?:式舆|深渊|防卫|危局|强袭|拟境|湮灭|临界|推演))/iu;
const help = [
  "绝区零抽卡记录",
  "%更新抽卡记录 同步国服米游社的六个频段。",
  "%抽卡记录 查看调频记录，当前登录可用时另发实时库存。",
  "%母带 / #绝区零存货 直接查看本人实时调频库存。",
  "%抽卡链接 私聊录入有效的绝区零官方抽卡链接。",
  "%获取抽卡链接 私聊获取当前国服档案的官方抽卡链接。",
  "%逐抽记录 查看录入的记录和已有旧档案。",
  "国际服绑定档案可查看已有的旧调频记录。",
  "命令末尾可加档案编号，例如 %抽卡记录2。",
].join("\n");
const historyDirectory = fileURLToPath(new URL("../../data/zzzTuningStats/", import.meta.url));
const legacyHistoryDirectory = fileURLToPath(new URL("../../data/zzzGachaJson/", import.meta.url));
const linkHistoryDirectory = fileURLToPath(new URL("../../data/zzzGachaRows/", import.meta.url));
const retiredData = ["Lotus-Plugin", "Lotus-ReFactor"].flatMap(name => [
  `../${name}/data/`, `../../data/legacy-game-history/${name}/`,
].map(path => new URL(path, import.meta.url)));
const monthlyDirectory = fileURLToPath(new URL("../../data/zzzMonthly/", import.meta.url));
const monthlyLegacyDirectories = ["../../data/ZZZ-Plugin/monthly/", "../ZZZ-Plugin/data/monthly/"]
  .map(path => fileURLToPath(new URL(path, import.meta.url)));
const flatLegacyDirectories = ["../../data/ZZZ-Plugin/gacha/", "../ZZZ-Plugin/data/gacha/"]
  .map(path => fileURLToPath(new URL(path, import.meta.url)));

function overseasRegion({ uid, region, gameBiz }: GameRole) {
  if (!/^\d{10}$/u.test(uid)) return;
  try {
    return resolveZzzGachaLinkRole({ uid, region, gameBiz }).region;
  } catch {
    return;
  }
}

interface GachaContext extends ZzzRoleGalleryContext {
  readonly adapter?: string;
  readonly normalizedMessage: string;
  readonly inlineImageByteLimit?: number;
  readonly self_id?: number;
  readonly user_id?: number;
  readonly message_type?: string;
  readonly groupActivitySignal?: AbortSignal;
  readonly message?: readonly InboundSegment[];
  reply(message: string | { readonly type: "image"; readonly file: Uint8Array }): unknown;
}

export function createModule({ signal, lockFile, zzzPanelRankRoles, zzzReminderRuntime }: {
  signal: AbortSignal;
  lockFile: Parameters<typeof createZzzTuningSync>[3];
  zzzPanelRankRoles?: ZzzPanelRankRoleReader;
  zzzReminderRuntime?: ZzzReminderRuntime;
}) {
  const profiles = createProfileStore(Bun.env.LOTUS_PROFILE_DIR || undefined);
  const client = createProfileHoyoClient(profiles);
  const inventory = createZzzInventoryQuery(profiles, client, signal);
  const legacyMonthly = Bun.env.LOTUS_ZZZ_LEGACY_MONTHLY_DIR?.trim();
  const monthly = createZzzMonthlyCommands(profiles, client,
    createZzzMonthlyArchive(monthlyDirectory, legacyMonthly ? [legacyMonthly] : monthlyLegacyDirectories, lockFile), signal);
  const challengeRanks = createZzzChallengeRanks(profiles, signal);
  const reminder = createZzzChallengeReminders(profiles, client, signal);
  const requestShowcase = createZzzShowcaseClient();
  const panelCommands = createZzzPanelCommands(profiles, client, lockFile, signal, requestShowcase);
  const panelRanks = createZzzPanelRanks(profiles, zzzPanelRankRoles ?? client.openHoYoLabZzzCheckin, signal, requestShowcase,
    { renderStrongest: panelCommands.renderPublic });
  const roleAliases = createZzzRoleAliasCommands(signal);
  const roleGallery = createZzzRoleGallery(signal);
  const recall = createZzzRecallSettings(signal);
  const cinema = createZzzCinema(signal);
  const skills = createZzzSkillReader(signal);
  const poolHistory = createZzzPoolHistory(signal);
  const currentPool = createZzzCurrentPool(signal);
  const sync = createZzzTuningSync(profiles, client, historyDirectory, lockFile,
    retiredData.map(directory => fileURLToPath(new URL("zzzTuningStats/", directory))));
  const syncOfficial = createGachaUpdater((qq, profileId) => sync.sync(qq, profileId, { signal }));
  async function gachaUpdate(qq: string, profileId: number, notify?: () => unknown) {
    const role = await profiles.savedRole(qq, profileId, "zzz");
    if (overseasRegion(role)) throw new ZzzManualGachaLinkRequired();
    return syncOfficial(qq, profileId, notify);
  }
  const legacyOverride = Bun.env.LOTUS_ZZZ_LEGACY_HISTORY_DIR;
  const legacySources = legacyOverride ? [] : retiredData.map(directory => fileURLToPath(new URL("zzzGachaJson/", directory)));
  const readLegacy = (qq: string, uid: string) =>
    readZzzLegacyGachaSources(legacyOverride || legacyHistoryDirectory, legacySources, qq, uid);
  const linkHistory = createZzzLinkHistory(linkHistoryDirectory, lockFile);
  const getLink = createGachaUpdater(async (qq, profileId) => {
    const source = await profiles.requestSelectedContext(qq, profileId, "zzz");
    const result = await client.fetchZzzGachaAuthKey(source, { signal });
    const latest = await profiles.requestSelectedContext(qq, profileId, "zzz").catch(() => undefined);
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
      const legacy = await readLegacy(qq, identity.uid);
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
    const changed = "绝区零档案已变化，请重新查询战绩。";
    async function present(record: ZzzGameRecordSnapshot, role: GameRole, renderSignal: AbortSignal) {
      try {
        const { png } = await renderZzzGameRecord(record, role, {
          qq, signal: renderSignal, legacyResources: Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR,
          inlineImageByteLimit: context.inlineImageByteLimit,
        });
        return { type: "image" as const, file: png };
      } catch (error) {
        if (!(error instanceof ZzzInlineImageLimitError || error instanceof ImageSizeLimitError)) throw error;
        return `图片超过当前会话大小上限，已改为文字。\n${zzzGameRecordText(record)}`;
      }
    }
    try {
      const source = await profiles.requestSelectedContext(qq, profileId, "zzz").catch((error: unknown) => {
        if (!(error instanceof ProfileError) || error.code !== "role-missing") throw error;
      });
      if (!source || overseasRegion(source.role)) {
        const international = await profiles.internationalRoleContext(qq, profileId, "zzz");
        if (!source && !international) return `[zzz] profile ${profileId} 未选中已认证的绝区零 UID。`;
        if (context.message_type !== "private" || context.isDelegated || !context.privateCredentialSignal) {
          return "绝区零国际服战绩请从本人私聊查询。";
        }
        const activeSignal = AbortSignal.any([signal, context.privateCredentialSignal]);
        if (activeSignal.aborted) return [];
        if (!international) return `[zzz] 请先在 profile ${profileId} 绑定已核验的 HoYoLAB 账号。`;
        if (source && source.revision !== international.revision) return changed;
        const { revision } = international;
        async function verifyProfile() {
          const active = await profiles.internationalRoleContext(qq, profileId, "zzz").catch(() => undefined);
          if (active?.revision !== revision) throw new HoyoRequestError("profile-changed", changed);
        }
        const record = await client.fetchHoYoLabZzzGameRecord(international, { signal: activeSignal, verifyProfile });
        const reply = await present(record, record.role, activeSignal);
        await verifyProfile();
        return activeSignal.aborted ? [] : reply;
      }
      const record = await client.fetchZzzGameRecord(source, { signal });
      const reply = await present(record, source.role, signal);
      const active = await profiles.requestSelectedContext(qq, profileId, "zzz").catch(() => undefined);
      if (signal.aborted) return [];
      if (active?.revision !== record.revision || active.role.uid !== record.uid) {
        return changed;
      }
      return reply;
    } catch (error) {
      if (signal.aborted || context.privateCredentialSignal?.aborted) return [];
      if (error instanceof ProfileError) {
        if (error.code === "missing" || error.code === "login-required") return `[zzz] 请先登录 profile ${profileId}。`;
        if (error.code === "role-missing") return `[zzz] profile ${profileId} 未选中已认证的绝区零 UID。`;
      }
      if (error instanceof GameRecordRequestError || (error instanceof HoyoRequestError && error.code === "refresh")) {
        return error.message;
      }
      if (error instanceof HoyoRequestError) {
        if (error.code === "profile-changed") return changed;
        if (error.code === "invalid-input") return error.message;
      }
      return "绝区零战绩暂时无法查询。";
    }
  }

  async function zenkov(context: GachaContext, profileId: number, kind: ZzzZenkovMode, page?: number) {
    const user = context.user_id;
    if ((context.message_type !== "private" && context.message_type !== "group") || context.isDelegated ||
        typeof user !== "number" || !Number.isSafeInteger(user) || user < 1) {
      return "请从登录档案对应的 QQ 会话查询迷宫诡域。";
    }
    const qq = String(user);
    const changed = "绝区零档案已变化，请重新查询迷宫诡域。";
    try {
      const source = await profiles.requestSelectedContext(qq, profileId, "zzz");
      const record = await client.fetchZzzZenkov(source, { kind, page, signal });
      if (record.status === "empty") return kind === "detail" ? "暂无迷宫诡域详细战绩数据" : "暂无迷宫诡域数据";
      const command = `%迷宫战绩${profileId === 1 ? "" : profileId}`;
      if (record.kind === "detail" && record.firstPage > record.pageCount) {
        return `迷宫诡域战绩共 ${record.pageCount} 页。发送 ${command} 页 ${record.pageCount} 查看末页。`;
      }
      const pages = await renderZzzZenkov(record, source.role, command,
        { qq, signal, legacyResources: Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR, inlineImageByteLimit: context.inlineImageByteLimit })
        .catch((error: unknown) => error instanceof ZzzInlineImageLimitError ? [`${error.message}\n${zzzZenkovText(record, command)}`] : undefined);
      if (signal.aborted) return [];
      const active = await profiles.requestSelectedContext(qq, profileId, "zzz").catch(() => undefined);
      if (signal.aborted) return [];
      if (active?.revision !== record.revision || active.role.uid !== record.uid) return changed;
      if (!pages) return zzzZenkovText(record, command);
      const nodes = pages.map(page => typeof page === "string" ? page : ({ type: "image" as const, file: page.png }));
      if (nodes.length === 1) return nodes[0];
      const followUp = zzzZenkovFollowUp(record, command, nodes.length);
      const title = `迷宫诡域战绩 · ${nodes.length} 页${followUp ? `\n${followUp}` : ""}`;
      return { type: "forward" as const, nodes: [title, ...nodes] };
    } catch (error) {
      if (signal.aborted) return [];
      if (error instanceof ProfileError) {
        if (error.code === "missing" || error.code === "login-required") return `[zzz] 请先登录 profile ${profileId}。`;
        if (error.code === "role-missing") return `[zzz] profile ${profileId} 未选中已认证的绝区零 UID。`;
      }
      if (error instanceof GameRecordRequestError || (error instanceof HoyoRequestError && error.code === "refresh")) {
        return error.message;
      }
      if (error instanceof HoyoRequestError) {
        if (error.code === "profile-changed") return changed;
        if (error.code === "invalid-input") return error.message;
      }
      return "迷宫诡域暂时无法查询。";
    }
  }

  async function exploration(context: GachaContext, profileId: number, page?: number) {
    const user = context.user_id;
    if ((context.message_type !== "private" && context.message_type !== "group") || context.isDelegated ||
        typeof user !== "number" || !Number.isSafeInteger(user) || user < 1) {
      return "请从登录档案对应的 QQ 会话查询绝区零区域收集。";
    }
    const qq = String(user);
    const changed = "绝区零档案已变化，请重新查询区域收集。";
    try {
      const source = await profiles.requestSelectedContext(qq, profileId, "zzz");
      const record = await client.fetchZzzExploration(source, { page, whole: page === undefined, signal });
      if (record.status === "empty") return "暂无探索详情数据";
      const command = `%区域收集${profileId === 1 ? "" : profileId}`;
      if (record.page > record.pageCount) return `区域收集共 ${record.pageCount} 页。发送 ${command} 页 ${record.pageCount} 查看末页。`;
      const renderer = createZzzExplorationRenderer(record, source.role, command, {
        qq, signal, legacyResources: Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR, inlineImageByteLimit: context.inlineImageByteLimit,
      });
      const render = (view: ZzzExplorationSnapshot) => renderer.then(draw => draw(view))
        .catch((error: unknown) => error instanceof ZzzInlineImageLimitError || error instanceof ImageSizeLimitError ? error : undefined);
      const result = await render(record);
      if (signal.aborted) return [];
      const body = (view: ZzzExplorationSnapshot, image: Awaited<ReturnType<typeof render>>) => {
        if (image && !(image instanceof Error)) return { type: "image" as const, file: image.png };
        const text = zzzExplorationText(view, command);
        return image instanceof Error ? `图片超过当前会话大小上限，已改为文字。\n${text}` : text;
      };
      let reply;
      if (page === undefined && result instanceof Error) {
        const nodes: ReturnType<typeof body>[] = [];
        async function include(view: ZzzExplorationSnapshot, image: Awaited<ReturnType<typeof render>>, rowLimit: number) {
          if (signal.aborted) return;
          if (image instanceof Error && rowLimit > 0) {
            const parts = splitZzzExploration(view, rowLimit);
            if (parts.length > 1) {
              for (const part of parts) {
                if (signal.aborted) return;
                const section = { ...part, page: 1, pageCount: 1 };
                await include(section, await render(section), Math.floor(rowLimit / 2));
              }
              return;
            }
            await include(view, image, Math.floor(rowLimit / 2));
            return;
          }
          nodes.push(body(view, image));
        }
        await include(record, result, 7);
        if (nodes.length > 1) reply = { type: "forward" as const, nodes: [`区域收集 · 共 ${nodes.length} 页`, ...nodes] };
      }
      if (signal.aborted) return [];
      const active = await profiles.requestSelectedContext(qq, profileId, "zzz").catch(() => undefined);
      if (signal.aborted) return [];
      if (active?.revision !== record.revision || active.role.uid !== record.uid) return changed;
      return reply ?? body(record, result);
    } catch (error) {
      if (signal.aborted) return [];
      if (error instanceof ProfileError) {
        if (error.code === "missing" || error.code === "login-required") return `[zzz] 请先登录 profile ${profileId}。`;
        if (error.code === "role-missing") return `[zzz] profile ${profileId} 未选中已认证的绝区零 UID。`;
      }
      if (error instanceof GameRecordRequestError || (error instanceof HoyoRequestError && error.code === "refresh")) {
        return error.message;
      }
      if (error instanceof HoyoRequestError) {
        if (error.code === "profile-changed") return changed;
        if (error.code === "invalid-input") return error.message;
      }
      return "绝区零区域收集暂时无法查询。";
    }
  }

  async function battleRecord(context: GachaContext, profileId: number, scheduleType: 1 | 2,
    mode: "shiyu" | "deadly" | "holoBoss" | "voidFront" | "climbingTower" | ZzzHollowMode) {
    const name = { shiyu: "式舆防卫战", deadly: "危局强袭战", holoBoss: "拟境湮灭战", voidFront: "临界推演",
      climbingTower: "拟真鏖战试炼", ...zzzHollowTitles }[mode];
    const personalHollow = mode === "withered" || mode === "lost";
    const { user_id: user } = context;
    if ((context.message_type !== "private" && context.message_type !== "group") ||
        ((mode === "holoBoss" || mode === "voidFront" || mode === "climbingTower" || personalHollow) && context.isDelegated) ||
        typeof user !== "number" || !Number.isSafeInteger(user) || user < 1) {
      return `请从登录档案对应的 QQ 会话查询${name}。`;
    }
    const qq = String(user);
    const period = scheduleType === 2 ? "上期" : "本期";
    try {
      const source = await profiles.requestSelectedContext(qq, profileId, "zzz");
      const request = { scheduleType, signal };
      const generation = mode === "shiyu" && scheduleType === 1 ? await challengeRanks.captureShiyuGeneration(context) : undefined;
      const requestedAt = Date.now();
      const snapshot = await (mode === "shiyu" ? client.fetchZzzShiyu(source, request) :
        mode === "deadly" ? client.fetchZzzDeadly(source, request) :
          mode === "holoBoss" ? client.fetchZzzHoloBoss(source, request) :
            mode === "voidFront" ? client.fetchZzzVoidFront(source, request) :
              personalHollow ? client.fetchZzzHollowZero(source, { hollowMode: mode, signal }) : client.fetchZzzClimbingTower(source, { signal }));
      if (snapshot.status === "older-format") return `${period}${name}使用旧版深渊战绩格式。`;
      if (snapshot.status === "empty") return mode === "climbingTower" ? "暂无爬塔数据" : personalHollow ? `暂无${name}数据` : `${period}暂无${name}战绩。`;
      async function stillActive() {
        const active = await profiles.requestSelectedContext(qq, profileId, "zzz").catch(() => undefined);
        return active?.revision === snapshot.revision && active.role.uid === snapshot.uid;
      }
      const rankVisibility = "seasons" in snapshot || "hollowMode" in snapshot ? undefined :
        await challengeRanks.remember(context, profileId, source.role, snapshot,
          "bosses" in snapshot ? "HOLO_BOSS" : "stages" in snapshot ? "VOID_FRONT_BATTLE" : mode === "shiyu" ? "ABYSS" : "DEADLY", requestedAt, stillActive, generation);
      const towerVisibility = "seasons" in snapshot ? await Promise.all(towerRanks.map(type =>
        challengeRanks.remember(context, profileId, source.role, snapshot, type, requestedAt, stillActive))) : undefined;
      const { inlineImageByteLimit } = context;
      const theme = {
        qq, signal, rankVisibility, towerVisibility, inlineImageByteLimit, legacyResources: Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR,
      };
      const result = await ("hollowMode" in snapshot ? renderZzzHollowZero(snapshot, source.role, theme) :
        "seasons" in snapshot ? renderZzzClimbingTower(snapshot, source.role, theme) :
        "stages" in snapshot ? renderZzzVoidFront(snapshot, source.role, theme) :
        "bosses" in snapshot ? renderZzzHoloBoss(snapshot, source.role, theme) :
        "trial" in snapshot ? renderZzzDeadly(snapshot, source.role.nickname, theme, 4, inlineImageByteLimit) :
        renderZzzShiyu(snapshot, source.role, theme, 4, inlineImageByteLimit)).catch(() => undefined);
      if (signal.aborted) return [];
      const active = await stillActive();
      if (signal.aborted) return [];
      if (!active) {
        return `绝区零档案已变化，请重新查询${name}。`;
      }
      if (result) return { type: "image" as const, file: result.png };
      if ("hollowMode" in snapshot) return zzzHollowText(snapshot);
      if ("seasons" in snapshot) return zzzClimbingTowerText(snapshot);
      if ("stages" in snapshot) {
        const stages = snapshot.finalStage ? [snapshot.finalStage, ...snapshot.stages] : snapshot.stages;
        return [`${name} · ${period}`, `总分 ${snapshot.totalScore ?? "—"}`,
          ...stages.map(stage => `${stage.name ?? "关卡"} · ${stage.score ?? "—"}${stage.rating ? ` · ${stage.rating}` : ""}`),
        ].join("\n");
      }
      if ("bosses" in snapshot) {
        return [
          `${name} · ${period}`,
          `总用时 ${holoBossDuration(snapshot.totalDuration)} · 总星数 ${snapshot.totalStars ?? "—"} · 无伤 ${snapshot.undamaged}`,
          ...snapshot.bosses.map(boss =>
            `${boss.name ?? "首领"} · ${holoBossDuration(boss.duration)} · ${boss.stars ?? "—"} 星${boss.undamaged ? " · 无伤" : ""}`),
        ].join("\n");
      }
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
        if (error.code === "role-missing") return `[zzz] profile ${profileId} 未选中已认证的绝区零 UID。`;
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

      async function flatArchiveRevision() {
        // A selected UID can come from an unverified field. The account's role catalog is required for flat files.
        const source = await profiles.requestContext(qq, profileId, "zzz", uid).catch(() => undefined);
        if (!source) return;
        const { stuid, ltuid } = source.account;
        if ((!stuid && !ltuid) || (stuid && ltuid && stuid !== ltuid)) return;
        if (source.role.region !== region || source.role.gameBiz !== resolveZzzGachaLinkRole(role).gameBiz) return;
        return source.revision;
      }

      const nickname = role.nickname || "绳匠";
      const level = role.level === undefined ? undefined : Number(role.level);
      const display = { level: Number.isFinite(level) ? level : undefined, regionName: zzzRegionName(region, role.regionName),
        inlineImageByteLimit: context.inlineImageByteLimit };
      let png: Uint8Array;
      let flatRevision: string | undefined;
      if (useOfficial) {
        const cached = await sync.read(qq, { uid, region });
        const stats = cached ?? await client.fetchZzzTuning(await profiles.requestContext(qq, profileId, "zzz", uid), { signal });
        const { avatar, resolveIcon, loadArtwork } = createZzzTuningArtwork(stats, qq, signal);
        const model = buildZzzTuningDetail({ stats, player: { nickname, avatar }, resolveIcon });
        ({ png } = await renderZzzTuningDetail(model, { ...display, loadArtwork }));
      } else {
        const [scoped, linked] = await Promise.all([
          readLegacy(qq, uid), linkHistory.read(qq, { uid, region }),
        ]);
        let legacy = scoped;
        if (!scoped && !legacyOverride) {
          const revision = await flatArchiveRevision();
          if (revision) {
            legacy = await readZzzFlatLegacyGacha(flatLegacyDirectories, uid);
            if (legacy) flatRevision = revision;
          }
        }
        const stats = mergeZzzLegacyWithLinked(legacy, linked);
        if (!stats) return linkedOnly ? "该角色还没有绝区零逐抽记录。" : "该角色还没有绝区零旧调频记录。";
        const { avatar, resolveIcon, loadArtwork } = createZzzLegacyGachaArtwork(qq, signal);
        const model = buildZzzLegacyDetail({ stats, player: { nickname, avatar }, resolveIcon });
        ({ png } = await renderZzzTuningDetail(model, { ...display, loadArtwork }));
      }
      if (signal.aborted) return [];
      if (!await roleMatches() || (flatRevision && await flatArchiveRevision() !== flatRevision)) {
        return "绝区零档案角色已变化，请重新查询。";
      }
      if (signal.aborted) return [];
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
      if (error instanceof ZzzLegacyGachaError || error instanceof ImageSizeLimitError) return error.message;
      return "绝区零抽卡记录暂时无法查看。";
    }
  }

  const dispose = zzzReminderRuntime && startZzzChallengeReminders(profiles, client, zzzReminderRuntime, signal);
  return {
    commands: {},
    dispose,
    gachaUpdate,
    fallbackFeatures(context: Pick<GachaContext, "normalizedMessage">) {
      const command = context.normalizedMessage.replace(legacyPrefix, "#绝区零");
      if ([helpCommand, generateLinkCommand, linkCommand, updateCommand, linkedViewCommand, viewCommand, zzzInventoryCommand].some(rule => rule.test(command)) ||
          command.trim() === "取消" || isZzzGachaLinkMessage(command)) return ["[gacha] 抽卡记录"];
      return [];
    },
    async fallback(_message: string, context: GachaContext) {
      const recallSetting = recall.setting(context.normalizedMessage, context);
      if (recallSetting !== undefined) return recallSetting;
      const inventoryRequest = zzzInventoryCommand.exec(context.normalizedMessage);
      if (inventoryRequest) return inventory(Number(inventoryRequest[1] ?? 1), context);
      const gallery = zzzRoleGalleryCommand(context.normalizedMessage);
      if (gallery) return recall.transient(roleGallery(context, gallery));
      const alias = zzzRoleAliasCommand(context.normalizedMessage);
      if (alias) return recall.transient(roleAliases(context, alias));
      const rank = rankCommand(context.normalizedMessage);
      if (rank) {
        const reply = challengeRanks.handle(context, rank);
        return rank.kind === "admin-toggle" || rank.kind === "admin-clear" ? recall.transient(reply) : reply;
      }
      const panelRank = zzzPanelRankCommand(context.normalizedMessage);
      if (panelRank) return panelRanks(context, panelRank);
      const remind = zzzChallengeReminderCommand(context.normalizedMessage);
      if (remind) return reminder(context, remind);
      const cinemaQuery = zzzCinemaCommand(context.normalizedMessage);
      if (cinemaQuery) return cinema(cinemaQuery, { inlineImageByteLimit: context.inlineImageByteLimit });
      const skillQuery = zzzSkillCommand(context.normalizedMessage);
      if (skillQuery) return skills(skillQuery, { inlineImageByteLimit: context.inlineImageByteLimit });
      const setting = zzzPanelIntervalCommand(context.normalizedMessage, context, signal);
      if (setting !== undefined) return recall.transient(setting);
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
      const ledger = zzzMonthlyCommand.exec(command);
      if (ledger) {
        const profileId = Number(ledger[4] ?? 1);
        const page = ledger[5] ? Number(ledger[5]) : undefined;
        if (profileId <= MAX_PROFILE_ID) return monthly(context, profileId,
          { collect: !!ledger[1], year: ledger[2], month: ledger[3], page });
        return;
      }
      const collection = explorationCommand.exec(command);
      if (collection) {
        const profileId = Number(collection[1] ?? 1);
        const page = collection[2] === undefined ? undefined : Number(collection[2]);
        if (profileId <= MAX_PROFILE_ID) return exploration(context, profileId, page);
        return;
      }
      const expedition = zenkovCommand.exec(command);
      if (expedition) {
        const profileId = Number(expedition[2] ?? 1);
        if (profileId > MAX_PROFILE_ID) return;
        const page = expedition[3] === undefined ? undefined : Number(expedition[3]);
        if (!expedition[1] && page !== undefined) return `发送 %迷宫战绩${profileId === 1 ? "" : profileId} 页 ${page} 查看指定战绩页。`;
        return zenkov(context, profileId, expedition[1] ? "detail" : "summary", page);
      }
      if (hollowHelp.test(command)) return "当前可供查询的零号空洞数据有：\n- %枯萎苗圃\n- %迷失之地";
      const hollow = hollowCommand.exec(command);
      if (hollow) {
        const profileId = Number(hollow[2] ?? 1);
        if (profileId <= MAX_PROFILE_ID) return battleRecord(context, profileId, 1, hollow[1]!.startsWith("迷失") ? "lost" : "withered");
        return;
      }
      const tower = climbingTowerCommand.exec(command);
      if (tower) {
        const profileId = Number(tower[1] ?? 1);
        if (profileId <= MAX_PROFILE_ID) return battleRecord(context, profileId, 1, "climbingTower");
        return;
      }
      const shiyu = shiyuCommand.exec(command);
      const deadly = shiyu ? null : deadlyCommand.exec(command);
      const holoBoss = shiyu || deadly ? null : holoBossCommand.exec(command);
      const battle = shiyu ?? deadly ?? holoBoss ?? voidFrontCommand.exec(command);
      if (battle) {
        const profileId = Number(battle[2] ?? 1);
        if (profileId <= MAX_PROFILE_ID) {
          const scheduleType = battle[1] === "上期" || battle[1] === "往期" ? 2 : 1;
          return battleRecord(context, profileId, scheduleType, shiyu ? "shiyu" : deadly ? "deadly" : holoBoss ? "holoBoss" : "voidFront");
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
            if (error.code === "role-missing") return `[zzz] profile ${profileId} 未选中已认证的绝区零 UID。`;
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
        if (profileId <= MAX_PROFILE_ID) return recall.transient(linkSession(context, profileId));
        return;
      }
      const continuation = await linkSession(context);
      if (continuation !== undefined) return recall.transient(continuation);
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
        if (error instanceof ZzzManualGachaLinkRequired) return recall.transient(linkSession(context, profileId));
        if (error instanceof ZzzTuningHistoryChangedError) return "该角色的绝区零抽卡记录已由另一条请求更新。";
        if (error instanceof ProfileError) {
          if (error.code === "missing" || error.code === "login-required") return `[zzz] 请先登录 profile ${profileId}。`;
          if (error.code === "role-missing") return `[zzz] profile ${profileId} 未选中已认证的绝区零 UID。`;
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
