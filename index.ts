import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import { zzzResourceDirectory } from "./card-theme.ts";
import { fileURLToPath } from "node:url";
import type { InboundSegment, ReplyOptions } from "../../lib/messages.ts";
import { createProfileStore, gameCommandProfileId, MAX_PROFILE_ID, ProfileError, profileCookieAccountId, type GameRole, type ProfileRequestContext } from "@lotus-yunzai/account";
import { createGachaUpdater } from "@lotus-yunzai/gacha/update";
import {
  createProfileHoyoClient, GameRecordRequestError, HoyoRequestError, isZzzGachaLinkMessage, readZzzGachaLink, resolveZzzGachaLinkRole, resolveZzzTuningRegion,
  splitZzzExploration, ZzzManualGachaLinkRequired, ZzzTuningRateLimitError, type ZzzExplorationSnapshot, type ZzzGameRecordSnapshot,
  type ZzzHollowMode, type ZzzOwnedBuddyRoster, type ZzzZenkovMode,
} from "@lotus-yunzai/hoyo-client";
import { readZzzFlatLegacyGacha, readZzzLegacyGachaSources, ZzzLegacyGachaError } from "./gacha-legacy.ts";
import { buildZzzLegacyDetail } from "./gacha-legacy-detail.ts";
import { createZzzLinkHistory, mergeZzzLegacyWithLinked } from "./gacha-link-history.ts";
import { createZzzGachaLinkSession } from "./gacha-link-session.ts";
import { ImageSizeLimitError } from "@lotus-yunzai/skia";
import { ownOperationSession, type OwnOperationContext } from "../../lib/own-operation-session.ts";
import { zzzRegionName } from "./card-theme.ts";
import { ZzzInlineImageLimitError } from "./challenge-card.ts";
import { renderZzzClimbingTower, zzzClimbingTowerText } from "./climbing-tower-card.ts";
import { createZzzExplorationRenderer, zzzExplorationText } from "./exploration-card.ts";
import { renderZzzGameRecord, zzzGameRecordText } from "./game-record-card.ts";
import { renderZzzOwnedBuddyCard, zzzOwnedBuddyText } from "./owned-buddy-card.ts";
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
import { sameZzzTuningProfile, zzzTuningProfile } from "./tuning-profile.ts";
import { renderZzzTuningDetail } from "./tuning-detail-card.ts";
import { createZzzInventoryQuery, zzzInventoryCommand } from "./tuning-inventory-command.ts";
import { renderZzzTuningFailure, renderZzzTuningResult, zzzTuningFailureText } from "./tuning-result-card.ts";
import { createZzzTuningSync, ZzzTuningHistoryChangedError } from "./tuning-sync.ts";
import { renderZzzZenkov, zzzZenkovFollowUp, zzzZenkovText } from "./zenkov-card.ts";
import { zzzCommandProfileSuffix } from "./profile-command.ts";

const updateCommand = /^#绝区零(?:更新|刷新)抽卡(?:记录|链接)?([1-9]\d{0,2})?$/u;
const viewCommand = /^#绝区零抽卡(?:记录|分析|统计)([1-9]\d{0,2})?$/u;
const linkedViewCommand = /^#绝区零逐抽记录([1-9]\d{0,2})?$/u;
const linkCommand = /^#绝区零抽卡链接([1-9]\d{0,2})?$/u;
const generateLinkCommand = /^#绝区零获取抽卡链接([1-9]\d{0,2})?$/u;
const helpCommand = /^#绝区零抽卡帮助$/u;
const gameRecordCommand = /^#绝区零(?:card|卡片|个人信息|角色)\s*([1-9]\d{0,2})?$/iu;
const ownedBuddyCommand = /^(?:#*绝区零?|[%％](?:绝区零?)?)(?:邦布|人偶)\s*([1-9]\d{0,2})?$/u;
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
  $t("index.text_8efe873b92"),
  $t("index.text_bc6853ff0f"),
  $t("index.text_cccc574501"),
  $t("index.text_115410d9ce"),
  $t("index.text_800df7007a"),
  $t("index.text_76b18000b5"),
  $t("index.text_fbb1f97e09"),
  $t("index.text_9512bae9c6"),
  $t("index.text_874cda5a44"),
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

interface GachaContext extends ZzzRoleGalleryContext, OwnOperationContext {
  readonly adapter?: string;
  readonly normalizedMessage: string;
  readonly inlineImageByteLimit?: number;
  readonly self_id?: number;
  readonly user_id?: number;
  readonly message_type?: string;
  readonly groupActivitySignal?: AbortSignal;
  readonly message?: readonly InboundSegment[];
  reply(message: string | { readonly type: "image"; readonly file: Uint8Array }, quote?: boolean, options?: ReplyOptions): unknown;
}

export function createModule({ signal, lockFile, zzzPanelRankRoles, zzzReminderRuntime, hoyoTransport = fetch }: {
  signal: AbortSignal;
  lockFile: Parameters<typeof createZzzTuningSync>[3];
  zzzPanelRankRoles?: ZzzPanelRankRoleReader;
  zzzReminderRuntime?: ZzzReminderRuntime;
  hoyoTransport?: Parameters<typeof createProfileHoyoClient>[1];
}) {
  const profiles = createProfileStore(Bun.env.LOTUS_PROFILE_DIR || undefined);
  const client = createProfileHoyoClient(profiles, hoyoTransport);
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
  const syncOfficial = createGachaUpdater((qq, profileId, workflow?: AbortSignal) =>
    sync.sync(qq, profileId, { signal: workflow ? AbortSignal.any([signal, workflow]) : signal }));
  async function gachaUpdate(qq: string, profileId: number, notify?: () => unknown, _isDelegated?: boolean, workflow?: AbortSignal) {
    const role = await profiles.savedRole(qq, profileId, "zzz");
    if (overseasRegion(role)) throw new ZzzManualGachaLinkRequired();
    return syncOfficial(qq, profileId, notify, workflow);
  }
  const legacyOverride = Bun.env.LOTUS_ZZZ_LEGACY_HISTORY_DIR;
  const legacySources = legacyOverride ? [] : retiredData.map(directory => fileURLToPath(new URL("zzzGachaJson/", directory)));
  const readLegacy = (qq: string, uid: string) =>
    readZzzLegacyGachaSources(legacyOverride || legacyHistoryDirectory, legacySources, qq, uid);
  const linkHistory = createZzzLinkHistory(linkHistoryDirectory, lockFile);
  const getLink = createGachaUpdater(async (qq, profileId, active?: AbortSignal) => {
    const source = await profiles.requestSelectedContext(qq, profileId, "zzz");
    const result = await client.fetchZzzGachaAuthKey(source, { signal: active });
    const latest = await profiles.requestSelectedContext(qq, profileId, "zzz").catch(() => undefined);
    if (latest?.revision !== result.revision || latest.role.uid !== result.uid) {
      throw new ProfileError("changed", $t("index.text_9cf98a9cde"));
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
        $t("index.text_1ad19c8a98", { "name": name, "value2": added[type], "value3": records.find((pool) => pool.type === type)?.records.length ?? 0 }));
      const command = $t("index.text_87a81e8170", { "value1": zzzCommandProfileSuffix(profileId) });
      return { type: "forward", nodes: [$t("index.text_8ff173785b"), ...lines, $t("index.text_32cdf01bcc", { "command": command })] };
    },
  });

  async function gameRecord(context: GachaContext, profileId: number, buddyOnly = false) {
    const { user_id: user } = context;
    if ((context.message_type !== "private" && context.message_type !== "group") ||
        typeof user !== "number" || !Number.isSafeInteger(user) || user < 1) {
      return $t("index.text_066ab2246e");
    }
    const qq = String(user);
    const subject = buddyOnly ? $t("index.text_aa46a7c35b") : $t("index.text_f7ae19fb98");
    const changed = $t("index.text_318d0fed8b", { "subject": subject });
    let activeSignal = signal;
    if (buddyOnly) {
      const bot = context.self_id;
      const connection = context.message_type === "group" ? context.groupActivitySignal : context.privateCredentialSignal;
      if (!connection || context.isDelegated || !bot || !Number.isSafeInteger(bot) || bot < 1 || user === bot) {
        return $t("index.text_2d7ab0ec89");
      }
      if (context.message?.some(segment => segment.type === "at" && String(segment.qq) !== String(bot))) {
        return $t("index.text_eed183658b");
      }
      activeSignal = AbortSignal.any([signal, connection]);
    }
    async function present(record: ZzzGameRecordSnapshot | ZzzOwnedBuddyRoster, role: GameRole, renderSignal: AbortSignal) {
      try {
        const options = { signal: renderSignal, inlineImageByteLimit: context.inlineImageByteLimit };
        const { png } = "avatars" in record
          ? await renderZzzGameRecord(record, role, { ...options, qq, legacyResources: zzzResourceDirectory() })
          : await renderZzzOwnedBuddyCard(record, options);
        return { type: "image" as const, file: png };
      } catch (error) {
        if (!(error instanceof ZzzInlineImageLimitError || error instanceof ImageSizeLimitError)) throw error;
        return $t("index.text_c26b33d678", { "value1": "avatars" in record ? zzzGameRecordText(record) : zzzOwnedBuddyText(record) });
      }
    }
    try {
      const source = await profiles.requestSelectedContext(qq, profileId, "zzz").catch((error: unknown) => {
        if (!(error instanceof ProfileError) || error.code !== "role-missing") throw error;
      });
      if (!source || overseasRegion(source.role)) {
        const international = await profiles.internationalRoleContext(qq, profileId, "zzz");
        if (!source && !international) return $t("index.text_f4a9dc8367", { "profileId": profileId });
        if (buddyOnly) return $t("index.text_267a24063f");
        const groupSession = context.message_type === "group" ? ownOperationSession(context) : undefined;
        const connection = groupSession?.signal ?? (context.message_type === "private" ? context.privateCredentialSignal : undefined);
        if (context.isDelegated || !connection) {
          return $t("index.text_04cb51c45a");
        }
        activeSignal = AbortSignal.any([activeSignal, connection]);
        if (activeSignal.aborted) return [];
        if (!international) return $t("index.text_47f3e3964b", { "profileId": profileId });
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
      if (activeSignal.aborted) return [];
      const options = { signal: activeSignal };
      const record = buddyOnly ? await client.fetchZzzOwnedBuddyRoster(source, options) : await client.fetchZzzGameRecord(source, options);
      const reply = await present(record, source.role, activeSignal);
      const active = await profiles.requestSelectedContext(qq, profileId, "zzz").catch(() => undefined);
      if (activeSignal.aborted) return [];
      if (active?.revision !== record.revision || active.role.uid !== record.uid) {
        return changed;
      }
      return reply;
    } catch (error) {
      if (activeSignal.aborted || context.privateCredentialSignal?.aborted) return [];
      if (error instanceof ProfileError) {
        if (error.code === "missing" || error.code === "login-required") return $t("index.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") return $t("index.text_f4a9dc8367", { "profileId": profileId });
      }
      if (error instanceof GameRecordRequestError || (error instanceof HoyoRequestError && error.code === "refresh")) {
        return error.message;
      }
      if (error instanceof HoyoRequestError) {
        if (error.code === "profile-changed") return changed;
        if (error.code === "invalid-input") return error.message;
      }
      return $t("index.text_acbd9b9ebe", { "subject": subject });
    }
  }

  async function zenkov(context: GachaContext, profileId: number, kind: ZzzZenkovMode, page?: number) {
    const user = context.user_id;
    if ((context.message_type !== "private" && context.message_type !== "group") || context.isDelegated ||
        typeof user !== "number" || !Number.isSafeInteger(user) || user < 1) {
      return $t("index.text_df04936c91");
    }
    const qq = String(user);
    const changed = $t("index.text_9d19833de3");
    try {
      const source = await profiles.requestSelectedContext(qq, profileId, "zzz");
      const record = await client.fetchZzzZenkov(source, { kind, page, signal });
      if (record.status === "empty") return kind === "detail" ? $t("index.text_85d6c7a419") : $t("index.text_9df23feb26");
      const command = $t("index.text_10d85181ae", { "value1": zzzCommandProfileSuffix(profileId) });
      if (record.kind === "detail" && record.firstPage > record.pageCount) {
        return $t("index.text_1abb50bdb0", { "pageCount": record.pageCount, "command": command, "value3": record.pageCount });
      }
      const pages = await renderZzzZenkov(record, source.role, command,
        { qq, signal, legacyResources: zzzResourceDirectory(), inlineImageByteLimit: context.inlineImageByteLimit })
        .catch((error: unknown) => error instanceof ZzzInlineImageLimitError ? [`${error.message}\n${zzzZenkovText(record, command)}`] : undefined);
      if (signal.aborted) return [];
      const active = await profiles.requestSelectedContext(qq, profileId, "zzz").catch(() => undefined);
      if (signal.aborted) return [];
      if (active?.revision !== record.revision || active.role.uid !== record.uid) return changed;
      if (!pages) return zzzZenkovText(record, command);
      const nodes = pages.map(page => typeof page === "string" ? page : ({ type: "image" as const, file: page.png }));
      if (nodes.length === 1) return nodes[0];
      const followUp = zzzZenkovFollowUp(record, command, nodes.length);
      const title = $t("index.text_69c07d5803", { "length": nodes.length, "value2": followUp ? `\n${followUp}` : "" });
      return { type: "forward" as const, nodes: [title, ...nodes] };
    } catch (error) {
      if (signal.aborted) return [];
      if (error instanceof ProfileError) {
        if (error.code === "missing" || error.code === "login-required") return $t("index.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") return $t("index.text_f4a9dc8367", { "profileId": profileId });
      }
      if (error instanceof GameRecordRequestError || (error instanceof HoyoRequestError && error.code === "refresh")) {
        return error.message;
      }
      if (error instanceof HoyoRequestError) {
        if (error.code === "profile-changed") return changed;
        if (error.code === "invalid-input") return error.message;
      }
      return $t("index.text_adffe5f7e7");
    }
  }

  async function exploration(context: GachaContext, profileId: number, page?: number) {
    const user = context.user_id;
    if ((context.message_type !== "private" && context.message_type !== "group") || context.isDelegated ||
        typeof user !== "number" || !Number.isSafeInteger(user) || user < 1) {
      return $t("index.text_ed7861cc60");
    }
    const qq = String(user);
    const changed = $t("index.text_ae44912b69");
    try {
      const source = await profiles.requestSelectedContext(qq, profileId, "zzz");
      const record = await client.fetchZzzExploration(source, { page, whole: page === undefined, signal });
      if (record.status === "empty") return $t("index.text_bd41c791c2");
      const command = $t("index.text_e1cc153c64", { "value1": zzzCommandProfileSuffix(profileId) });
      if (record.page > record.pageCount) return $t("index.text_c6e8269745", { "pageCount": record.pageCount, "command": command, "value3": record.pageCount });
      const renderer = createZzzExplorationRenderer(record, source.role, command, {
        qq, signal, legacyResources: zzzResourceDirectory(), inlineImageByteLimit: context.inlineImageByteLimit,
      });
      const render = (view: ZzzExplorationSnapshot) => renderer.then(draw => draw(view))
        .catch((error: unknown) => error instanceof ZzzInlineImageLimitError || error instanceof ImageSizeLimitError ? error : undefined);
      const result = await render(record);
      if (signal.aborted) return [];
      const body = (view: ZzzExplorationSnapshot, image: Awaited<ReturnType<typeof render>>) => {
        if (image && !(image instanceof Error)) return { type: "image" as const, file: image.png };
        const text = zzzExplorationText(view, command);
        return image instanceof Error ? $t("index.text_86b48550a7", { "text": text }) : text;
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
        if (nodes.length > 1) reply = { type: "forward" as const, nodes: [$t("index.text_2d43673910", { "length": nodes.length }), ...nodes] };
      }
      if (signal.aborted) return [];
      const active = await profiles.requestSelectedContext(qq, profileId, "zzz").catch(() => undefined);
      if (signal.aborted) return [];
      if (active?.revision !== record.revision || active.role.uid !== record.uid) return changed;
      return reply ?? body(record, result);
    } catch (error) {
      if (signal.aborted) return [];
      if (error instanceof ProfileError) {
        if (error.code === "missing" || error.code === "login-required") return $t("index.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") return $t("index.text_f4a9dc8367", { "profileId": profileId });
      }
      if (error instanceof GameRecordRequestError || (error instanceof HoyoRequestError && error.code === "refresh")) {
        return error.message;
      }
      if (error instanceof HoyoRequestError) {
        if (error.code === "profile-changed") return changed;
        if (error.code === "invalid-input") return error.message;
      }
      return $t("index.text_eaf852bf97");
    }
  }

  async function battleRecord(context: GachaContext, profileId: number, scheduleType: 1 | 2,
    mode: "shiyu" | "deadly" | "holoBoss" | "voidFront" | "climbingTower" | ZzzHollowMode) {
    const name = { shiyu: $t("index.text_f718dc4321"), deadly: $t("index.text_4b7b8e83d9"), holoBoss: $t("index.text_29e80a0630"), voidFront: $t("index.text_86bf7c9458"),
      climbingTower: $t("index.text_16a75e0027"), ...zzzHollowTitles }[mode];
    const personalHollow = mode === "withered" || mode === "lost";
    const { user_id: user } = context;
    if ((context.message_type !== "private" && context.message_type !== "group") ||
        ((mode === "holoBoss" || mode === "voidFront" || mode === "climbingTower" || personalHollow) && context.isDelegated) ||
        typeof user !== "number" || !Number.isSafeInteger(user) || user < 1) {
      return $t("index.text_20072b851c", { "name": name });
    }
    const qq = String(user);
    const period = scheduleType === 2 ? $t("index.text_2823616a99") : $t("index.text_474da3018a");
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
      if (snapshot.status === "older-format") return $t("index.text_91fdc991b5", { "period": period, "name": name });
      if (snapshot.status === "empty") return mode === "climbingTower" ? $t("index.text_f3a733209a") : personalHollow ? $t("index.text_450b8c5716", { "name": name }) : $t("index.text_028f2c565d", { "period": period, "name": name });
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
        qq, signal, rankVisibility, towerVisibility, inlineImageByteLimit, legacyResources: zzzResourceDirectory(),
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
        return $t("index.text_71a331d410", { "name": name });
      }
      if (result) return { type: "image" as const, file: result.png };
      if ("hollowMode" in snapshot) return zzzHollowText(snapshot);
      if ("seasons" in snapshot) return zzzClimbingTowerText(snapshot);
      if ("stages" in snapshot) {
        const stages = snapshot.finalStage ? [snapshot.finalStage, ...snapshot.stages] : snapshot.stages;
        return [`${name} · ${period}`, $t("index.text_422aa73408", { "value1": snapshot.totalScore ?? "—" }),
          ...stages.map(stage => `${stage.name ?? $t("index.text_ff534801b8")} · ${stage.score ?? "—"}${stage.rating ? ` · ${stage.rating}` : ""}`),
        ].join("\n");
      }
      if ("bosses" in snapshot) {
        return [
          `${name} · ${period}`,
          $t("index.text_4fbd96a211", { "value1": holoBossDuration(snapshot.totalDuration), "value2": snapshot.totalStars ?? "—", "undamaged": snapshot.undamaged }),
          ...snapshot.bosses.map(boss =>
            $t("index.text_59faa7ffd6", { "value1": boss.name ?? $t("index.text_58cae7ec87"), "value2": holoBossDuration(boss.duration), "value3": boss.stars ?? "—", "value4": boss.undamaged ? $t("index.text_7c68e212d7") : "" })),
        ].join("\n");
      }
      if ("trial" in snapshot) {
        return [
          $t("index.text_841c31ef32", { "period": period }),
          snapshot.totalScore === undefined ? undefined : $t("index.text_94f5c06650", { "totalScore": snapshot.totalScore }),
          snapshot.totalStars === undefined ? undefined : $t("index.text_c6eac1ddc3", { "totalStars": snapshot.totalStars }),
          ...snapshot.hard.map(room => $t("index.text_22ca39a135", { "value1": room.name ?? $t("index.text_58cae7ec87"), "value2": room.score ?? "—" })),
          ...snapshot.trial.map(room => $t("index.text_4e10d31e79", { "value1": room.name ?? $t("index.text_58cae7ec87"), "value2": room.score ?? "—" })),
        ].filter(Boolean).join("\n");
      }
      const score = snapshot.overall?.score;
      const rating = snapshot.overall?.rating;
      return [$t("index.text_d90ec91ae9", { "period": period }), score !== undefined ? $t("index.text_f8227398b3", { "score": score, "value2": rating ? ` · ${rating}` : "" }) : undefined,
        ...snapshot.layers.map(layer => $t("index.text_0c53b24fef", { "number": layer.number, "length": layer.teams.length, "value3": layer.rating ? ` · ${layer.rating}` : "" }))]
        .filter(Boolean).join("\n");
    } catch (error) {
      if (signal.aborted) return [];
      if (error instanceof ProfileError) {
        if (error.code === "missing" || error.code === "login-required") return $t("index.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") return $t("index.text_f4a9dc8367", { "profileId": profileId });
      }
      if (error instanceof GameRecordRequestError || (error instanceof HoyoRequestError && error.code === "refresh")) {
        return error.message;
      }
      if (error instanceof HoyoRequestError) {
        if (error.code === "profile-changed") return $t("index.text_71a331d410", { "name": name });
        if (error.code === "invalid-input") return error.message;
      }
      return $t("index.text_a72f794b97", { "name": name });
    }
  }

  async function viewOfficialTuning(source: ProfileRequestContext, profileId: number, context: GachaContext) {
    const { qq, role } = source;
    const identity = zzzTuningProfile(source);
    const { uid, region } = identity;
    const connection = context.message_type === "group" ? context.groupActivitySignal : context.privateCredentialSignal;
    const active = connection ? AbortSignal.any([signal, connection]) : signal;
    const selected = () => profiles.requestSelectedContext(qq, profileId, "zzz").catch(() => undefined);
    const cached = await sync.read(qq, { uid, region });
    const stats = cached ?? await client.fetchZzzTuning(source, { signal: active });
    const revision = "revision" in stats && typeof stats.revision === "string" ? stats.revision : source.revision;
    const { avatar, resolveIcon, loadArtwork } = createZzzTuningArtwork(stats, qq, active);
    const model = buildZzzTuningDetail({ stats, player: { nickname: role.nickname || $t("index.text_4efe2edb6d"), avatar }, resolveIcon });
    const level = role.level === undefined ? undefined : Number(role.level);
    const { png } = await renderZzzTuningDetail(model, {
      level: Number.isFinite(level) ? level : undefined,
      regionName: zzzRegionName(region, role.regionName), inlineImageByteLimit: context.inlineImageByteLimit, loadArtwork,
    });
    const current = await selected();
    if (active.aborted) return [];
    if (!current || !sameZzzTuningProfile(current, identity, revision)) return $t("index.text_ffa6a35fe8");

    let delivered = false;
    const accepted = await context.reply({ type: "image", file: png }, false, { onDelivered: () => { delivered = true; } });
    if (accepted === false || !delivered || active.aborted) return [];
    const confirmed = await selected();
    if (active.aborted || !confirmed || !sameZzzTuningProfile(confirmed, identity, revision)) return [];
    const live = await client.fetchZzzTuningInventory(confirmed, { signal: active }).catch(() => undefined);
    if (!live || live.uid !== uid) return [];
    const inventory = buildZzzTuningInventoryReply({ uid, profileId, live });
    if (!inventory) return [];
    const latest = await selected();
    if (active.aborted || !sameZzzTuningProfile(latest, identity, live.revision)) return [];
    return context.message_type === "group" ? [{ type: "at" as const, qq }, inventory] : inventory;
  }

  async function view(qq: string, profileId: number, context: GachaContext, linkedOnly: boolean) {
    try {
      const role = await profiles.savedRole(qq, profileId, "zzz");
      const { uid } = role;
      const regionOf = (current: GameRole) => linkedOnly ? resolveZzzGachaLinkRole(current).region
        : overseasRegion(current) ?? resolveZzzTuningRegion({ game: "zzz", role: current });
      const region = regionOf(role);
      if (!linkedOnly && (region === "prod_gf_cn" || region === "prod_qd_cn")) {
        const source = await profiles.requestSelectedContext(qq, profileId, "zzz");
        if (source.role.uid !== uid || regionOf(source.role) !== region) {
          return $t("index.text_ffa6a35fe8");
        }
        return await viewOfficialTuning(source, profileId, context);
      }

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
        if (!source || !profileCookieAccountId(source.account)) return;
        const archiveRole = resolveZzzGachaLinkRole(source.role);
        if (archiveRole.region !== region || archiveRole.gameBiz !== resolveZzzGachaLinkRole(role).gameBiz) return;
        return source.revision;
      }

      const nickname = role.nickname || $t("index.text_4efe2edb6d");
      const level = role.level === undefined ? undefined : Number(role.level);
      const display = { level: Number.isFinite(level) ? level : undefined, regionName: zzzRegionName(region, role.regionName),
        inlineImageByteLimit: context.inlineImageByteLimit };
      const [scoped, linked] = await Promise.all([
        readLegacy(qq, uid), linkHistory.read(qq, { uid, region }),
      ]);
      let legacy = scoped;
      let flatRevision: string | undefined;
      if (!scoped && !legacyOverride) {
        const revision = await flatArchiveRevision();
        if (revision) {
          legacy = await readZzzFlatLegacyGacha(flatLegacyDirectories, uid);
          if (legacy) flatRevision = revision;
        }
      }
      const stats = mergeZzzLegacyWithLinked(legacy, linked);
      if (!stats) return linkedOnly ? $t("index.text_c5fb434ef4") : $t("index.text_77cd087915");
      const { avatar, resolveIcon, loadArtwork } = createZzzLegacyGachaArtwork(qq, signal);
      const model = buildZzzLegacyDetail({ stats, player: { nickname, avatar }, resolveIcon });
      const { png } = await renderZzzTuningDetail(model, { ...display, loadArtwork });
      if (signal.aborted) return [];
      if (!await roleMatches() || (flatRevision && await flatArchiveRevision() !== flatRevision)) {
        return $t("index.text_ffa6a35fe8");
      }
      if (!signal.aborted) await context.reply({ type: "image", file: png });
      return [];
    } catch (error) {
      if (signal.aborted) return [];
      if (error instanceof ProfileError) {
        if (error.code === "missing" || error.code === "login-required") return $t("index.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") return $t("index.text_4ea60872c8", { "profileId": profileId });
      }
      if (error instanceof HoyoRequestError && error.code === "invalid-input") return error.message;
      if (error instanceof HoyoRequestError && error.code === "profile-changed") return $t("index.text_ffa6a35fe8");
      if (error instanceof ZzzTuningRateLimitError) return $t("index.text_a3f0d28183");
      if (error instanceof ZzzLegacyGachaError || error instanceof ImageSizeLimitError) return error.message;
      return $t("index.text_5f697c7948");
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
          command.trim() === "取消" || isZzzGachaLinkMessage(command)) return [$t("index.text_5f636b7036")];
      return [];
    },
    async fallback(_message: string, context: GachaContext) {
      const recallSetting = recall.setting(context.normalizedMessage, context);
      if (recallSetting !== undefined) return recallSetting;
      const inventoryRequest = zzzInventoryCommand.exec(context.normalizedMessage);
      if (inventoryRequest) return inventory(gameCommandProfileId("zzz", inventoryRequest[1]), context);
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
      if (historyQuery) return poolHistory(historyQuery, zzzResourceDirectory());
      const command = context.normalizedMessage.replace(legacyPrefix, "#绝区零");
      const buddies = ownedBuddyCommand.exec(command);
      if (buddies) {
        const profileId = gameCommandProfileId("zzz", buddies[1]);
        return profileId <= MAX_PROFILE_ID ? gameRecord(context, profileId, true) : $t("index.text_3dd62228d2");
      }
      const card = gameRecordCommand.exec(command);
      if (card) {
        const profileId = gameCommandProfileId("zzz", card[1]);
        if (profileId <= MAX_PROFILE_ID) return gameRecord(context, profileId);
        return;
      }
      const ledger = zzzMonthlyCommand.exec(command);
      if (ledger) {
        const profileId = gameCommandProfileId("zzz", ledger[4]);
        const page = ledger[5] ? Number(ledger[5]) : undefined;
        if (profileId <= MAX_PROFILE_ID) return monthly(context, profileId,
          { collect: !!ledger[1], year: ledger[2], month: ledger[3], page });
        return;
      }
      const collection = explorationCommand.exec(command);
      if (collection) {
        const profileId = gameCommandProfileId("zzz", collection[1]);
        const page = collection[2] === undefined ? undefined : Number(collection[2]);
        if (profileId <= MAX_PROFILE_ID) return exploration(context, profileId, page);
        return;
      }
      const expedition = zenkovCommand.exec(command);
      if (expedition) {
        const profileId = gameCommandProfileId("zzz", expedition[2]);
        if (profileId > MAX_PROFILE_ID) return;
        const page = expedition[3] === undefined ? undefined : Number(expedition[3]);
        if (!expedition[1] && page !== undefined) return $t("index.text_62a355e2fd", { "value1": zzzCommandProfileSuffix(profileId), "page": page });
        return zenkov(context, profileId, expedition[1] ? "detail" : "summary", page);
      }
      if (hollowHelp.test(command)) return $t("index.text_8c44ab8e13");
      const hollow = hollowCommand.exec(command);
      if (hollow) {
        const profileId = gameCommandProfileId("zzz", hollow[2]);
        if (profileId <= MAX_PROFILE_ID) return battleRecord(context, profileId, 1, hollow[1]!.startsWith("迷失") ? "lost" : "withered");
        return;
      }
      const tower = climbingTowerCommand.exec(command);
      if (tower) {
        const profileId = gameCommandProfileId("zzz", tower[1]);
        if (profileId <= MAX_PROFILE_ID) return battleRecord(context, profileId, 1, "climbingTower");
        return;
      }
      const shiyu = shiyuCommand.exec(command);
      const deadly = shiyu ? null : deadlyCommand.exec(command);
      const holoBoss = shiyu || deadly ? null : holoBossCommand.exec(command);
      const battle = shiyu ?? deadly ?? holoBoss ?? voidFrontCommand.exec(command);
      if (battle) {
        const profileId = gameCommandProfileId("zzz", battle[2]);
        if (profileId <= MAX_PROFILE_ID) {
          const scheduleType = battle[1] === "上期" || battle[1] === "往期" ? 2 : 1;
          return battleRecord(context, profileId, scheduleType, shiyu ? "shiyu" : deadly ? "deadly" : holoBoss ? "holoBoss" : "voidFront");
        }
        return;
      }
      if (helpCommand.test(command)) return help;
      const generateLink = generateLinkCommand.exec(command);
      if (generateLink) {
        const profileId = gameCommandProfileId("zzz", generateLink[1]);
        if (profileId > MAX_PROFILE_ID) return;
        if (context.message_type !== "private" || !context.self_id || !Number.isSafeInteger(context.self_id) || context.self_id < 1 ||
            !context.user_id || !Number.isSafeInteger(context.user_id) || context.user_id < 1) {
          return $t("index.text_8260a16f37");
        }
        const session = context.privateCredentialSignal;
        if (context.isDelegated || !session) return $t("index.text_06bcc1352b");
        const active = AbortSignal.any([signal, session]);
        if (active.aborted) return;
        try {
          const url = await getLink(String(context.user_id), profileId, undefined, active);
          if (!active.aborted) return url ?? $t("index.text_0b45b96b8f");
        } catch (error) {
          if (active.aborted) return;
          if (error instanceof ProfileError) {
            if (error.code === "missing" || error.code === "login-required") return $t("index.text_76720712c8", { "profileId": profileId });
            if (error.code === "role-missing") return $t("index.text_f4a9dc8367", { "profileId": profileId });
            if (error.code === "changed") return $t("index.text_776f6c2221");
          }
          if (error instanceof HoyoRequestError) {
            if (error.code === "profile-changed") return $t("index.text_776f6c2221");
            if (error.status === 429 || error.retcode === -110) return $t("index.text_7ef2a6dcd2");
            if (error.code === "invalid-input" || error.code === "api" || error.code === "refresh") return error.message;
          }
          return $t("index.text_3c53446b0f");
        }
        return;
      }
      const link = linkCommand.exec(command);
      if (link) {
        const profileId = gameCommandProfileId("zzz", link[1]);
        if (profileId <= MAX_PROFILE_ID) return recall.transient(linkSession(context, profileId));
        return;
      }
      const continuation = await linkSession(context);
      if (continuation !== undefined) return recall.transient(continuation);
      const update = updateCommand.exec(command);
      const linkedOnly = linkedViewCommand.exec(command);
      const matched = update ?? linkedOnly ?? viewCommand.exec(command);
      if (!matched) return;
      const profileId = gameCommandProfileId("zzz", matched[1]);
      if (profileId > MAX_PROFILE_ID) return;
      const { user_id } = context;
      if (typeof user_id !== "number" || !Number.isSafeInteger(user_id) || user_id < 1) {
        return $t("index.text_af07d075a4");
      }
      const qq = String(user_id);
      if (!update) return view(qq, profileId, context, linkedOnly !== null);
      try {
        const result = await gachaUpdate(qq, profileId, () =>
          context.reply($t("index.text_48afbcd626", { "profileId": profileId })));
        if (!result) return $t("index.text_da0a78540b");
        try {
          const { png } = await renderZzzTuningResult(qq, result);
          return { type: "image" as const, file: png };
        } catch {
          return $t("index.text_ae4d566def");
        }
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof ZzzManualGachaLinkRequired) return recall.transient(linkSession(context, profileId));
        if (error instanceof ZzzTuningHistoryChangedError) return $t("index.text_fb6f6ac9a5");
        if (error instanceof ProfileError) {
          if (error.code === "missing" || error.code === "login-required") return $t("index.text_76720712c8", { "profileId": profileId });
          if (error.code === "role-missing") return $t("index.text_f4a9dc8367", { "profileId": profileId });
        }
        const reason = error instanceof ZzzTuningRateLimitError ? "rate-limited"
          : (error instanceof ProfileError && error.code === "changed") ||
            (error instanceof HoyoRequestError && error.code === "profile-changed") ? "profile-changed"
          : error instanceof HoyoRequestError && error.code === "transport" ? "network-failed"
          : error instanceof HoyoRequestError && error.status !== undefined && error.status >= 500 && error.status <= 599
            ? "service-unavailable" : "request-failed";
        try {
          const { png } = await renderZzzTuningFailure({ qq, profileId, reason });
          return { type: "image" as const, file: png };
        } catch {
          return zzzTuningFailureText(reason);
        }
      }
    },
  };
}
