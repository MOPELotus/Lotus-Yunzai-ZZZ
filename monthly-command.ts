import { ProfileError, type createProfileStore, type ProfileRequestContext } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError, resolveZzzGachaLinkRole, type createProfileHoyoClient,
  type ZzzMonthlyRecord } from "@lotus-yunzai/hoyo-client";
import { previewRedeemIdentity } from "@lotus-yunzai/hoyo-client/redeem-submit";
import { createZzzMonthlyArchive } from "./monthly-archive.ts";
import { renderZzzMonthly, zzzMonthlyPageSize, zzzMonthlyText } from "./monthly-card.ts";
import { zzzMonthlyDate } from "./monthly-model.ts";

export const zzzMonthlyCommand = /^#绝区零(?:monthly|菲林|邦布券|收入|月报)(?:(统计)|(?:(\d{4})年)?(?:(\d{1,2}|上)月)?)\s*([1-9]\d{0,2})?(?:\s*页\s*([1-9]\d{0,5}))?$/iu;

interface Context {
  readonly user_id?: number;
  readonly message_type?: string;
  readonly isDelegated?: boolean;
}

async function selectedMonthlyRole(profiles: Pick<ReturnType<typeof createProfileStore>, "requestContext" | "savedRole">,
  qq: string, profileId: number) {
  const before = await profiles.requestContext(qq, profileId, "zzz");
  const selected = await profiles.savedRole(qq, profileId, "zzz");
  const source = await profiles.requestContext(qq, profileId, "zzz", selected.uid);
  if (before.revision !== source.revision) throw new ProfileError("changed", "绝区零档案已变化。");
  if (!source.role.region || !source.role.gameBiz || source.role.uid !== selected.uid ||
      source.role.region !== selected.region || source.role.gameBiz !== selected.gameBiz) {
    throw new ProfileError("role-missing", "档案没有已同步的绝区零角色。");
  }
  return source;
}

function archiveAccountId(source: ProfileRequestContext) {
  const accountId = source.account.stuid || source.account.ltuid;
  if (accountId && previewRedeemIdentity(source) === accountId) return accountId;
}

export function createZzzMonthlyCommands(profiles: ReturnType<typeof createProfileStore>, client: ReturnType<typeof createProfileHoyoClient>,
  archive: ReturnType<typeof createZzzMonthlyArchive>, signal: AbortSignal) {
  const changed = "绝区零档案已变化，请重新查询月报。";
  return async function monthly(context: Context, profileId: number, options: {
    readonly collect: boolean; readonly year?: string; readonly month?: string; readonly page?: number;
  }) {
    const user = context.user_id;
    if ((context.message_type !== "private" && context.message_type !== "group") || context.isDelegated ||
        typeof user !== "number" || !Number.isSafeInteger(user) || user < 1) {
      return "请从登录档案对应的 QQ 会话查询绝区零月报。";
    }
    const command = `%月报统计${profileId === 1 ? "" : profileId}`;
    const month = zzzMonthlyDate(options.year, options.month);
    if (month === undefined) return "获取月报数据失败，请检查日期是否正确";
    if (!options.collect && options.page !== undefined) return `发送 ${command} 页 ${options.page} 查看指定统计页。`;
    const page = options.page ?? 1;
    const qq = String(user);
    const fallback = options.collect ? "获取月报数据失败" : "获取月报数据失败，请检查日期是否正确";
    try {
      const source = await selectedMonthlyRole(profiles, qq, profileId);
      const resolved = resolveZzzGachaLinkRole(source.role);
      const { uid, region } = resolved;
      const identity = { qq, uid, region };
      let revision = source.revision;
      async function current() {
        signal.throwIfAborted();
        const active = await selectedMonthlyRole(profiles, qq, profileId).catch(() => undefined);
        if (active?.revision !== revision || active.role.uid !== uid ||
            active.role.region !== region || active.role.gameBiz !== resolved.gameBiz) {
          throw new HoyoRequestError("profile-changed", changed);
        }
        signal.throwIfAborted();
        return active;
      }
      const archiveAccount = archiveAccountId(source);
      let collected: readonly ZzzMonthlyRecord[] = [];
      let live: Awaited<ReturnType<typeof client.fetchZzzMonthly>> | undefined;
      let failed: HoyoRequestError | undefined;
      const fetchedAt = Date.now();
      if (page > 1 && archiveAccount) {
        await current();
        collected = await archive.read(identity);
      }
      if (!collected.length) {
        try {
          live = await client.fetchZzzMonthly(source, { month, collect: options.collect, signal });
          revision = live.revision;
        } catch (error) {
          if (!(error instanceof HoyoRequestError) || error.code === "profile-changed" || signal.aborted) throw error;
          failed = error;
        }
        const active = await current();
        if (archiveAccount && archiveAccountId(active) === archiveAccount) {
          collected = live?.months.length ?
            await archive.update(identity, live.months, fetchedAt, async () => {
              if (archiveAccountId(await current()) !== archiveAccount) throw new HoyoRequestError("profile-changed", changed);
            }) : await archive.read(identity);
        } else {
          collected = live?.months ?? [];
        }
      }
      let warning = failed || (!live?.months.length && page === 1) ? "本次未更新，仅显示已存档月报。" : undefined;
      if (!options.collect) {
        const actual = live?.selectedMonth ?? month;
        const selected = actual && collected.find(row => row.data_month === actual);
        collected = selected ? [selected] : (!month && !live?.hasEnvelope ? collected.slice(0, 1) : []);
      }
      if (!collected.length) {
        if (failed instanceof GameRecordRequestError || failed?.code === "refresh" || failed?.code === "invalid-input") return failed.message;
        return !options.collect && live?.hasEnvelope ? "月报数据为空" : fallback;
      }
      if (page > Math.ceil(collected.length / zzzMonthlyPageSize)) {
        const last = Math.ceil(collected.length / zzzMonthlyPageSize);
        return `绝区零月报统计共 ${last} 页。发送 ${command} 页 ${last} 查看末页。`;
      }
      if (failed instanceof GameRecordRequestError && warning) warning = `${failed.message} ${warning}`;
      const view = { all: collected, collect: options.collect, page, warning, command };
      const image = await renderZzzMonthly(view, source.role, region,
        { qq, signal, legacyResources: Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR }).catch(() => undefined);
      await current();
      return image ? { type: "image" as const, file: image.png } : zzzMonthlyText(view);
    } catch (error) {
      if (signal.aborted) return [];
      if (error instanceof ProfileError) {
        if (error.code === "missing" || error.code === "login-required") return `[zzz] 请先登录 profile ${profileId}。`;
        if (error.code === "changed") return changed;
        if (error.code === "role-missing") return `[zzz] profile ${profileId} 没有同步绝区零 UID。`;
      }
      if (error instanceof HoyoRequestError && error.code === "profile-changed") return changed;
      return fallback;
    }
  };
}
