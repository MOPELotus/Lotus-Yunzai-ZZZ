import { gameCommandProfileId, MAX_PROFILE_ID, ProfileError, type createProfileStore } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError, type createProfileHoyoClient, type ZzzDeadlySnapshot, type ZzzShiyuSnapshot } from "@lotus-yunzai/hoyo-client";
import { challengeReminderTime, createZzzChallengeReminderStore, type ChallengeReminderDefaults,
  type ChallengeReminderPreferences, type ChallengeReminderUser } from "./challenge-reminder-store.ts";

interface ReminderContext {
  readonly message_type?: string;
  readonly user_id?: number;
  readonly self_id?: number;
  readonly isMaster?: boolean;
  readonly adapter?: string;
  readonly isBotMaster?: (userId: number) => boolean;
  readonly isDelegated?: boolean;
  readonly isFriend?: () => Promise<boolean>;
  reply(message: string): unknown;
}

const prefix = /^(?:[%％](?:zzz|绝区零)?|[#/](?:zzz|绝区零)(?:zzz|绝区零)?|zzz|绝区零)/iu;

export function zzzChallengeReminderCommand(text: string) {
  const command = text.replace(prefix, "#绝区零");
  const status = /^#绝区零查询挑战状态\s*([1-9]\d{0,2})?$/u.exec(command);
  if (status) {
    const profileId = gameCommandProfileId("zzz", status[1]);
    if (profileId <= MAX_PROFILE_ID) return { kind: "status", profileId } as const;
  }
  const enable = /^#绝区零(开启|启用|关闭|禁用)(全局)?挑战提醒$/u.exec(command);
  if (enable && (enable[2] || enable[1] === "开启" || enable[1] === "关闭")) {
    return { kind: "enable", global: !!enable[2], enabled: enable[1] === "开启" || enable[1] === "启用" } as const;
  }
  const threshold = /^#绝区零设置(全局)?(式舆|危局)阈值\s*(\d+)$/u.exec(command);
  if (threshold) return { kind: "threshold", global: !!threshold[1],
    field: threshold[2] === "式舆" ? "abyssCheckLevel" : "deadlyStars", value: Number(threshold[3]) } as const;
  const time = /^#绝区零设置(个人|全局)提醒时间\s*(.*)$/u.exec(command);
  if (time) return { kind: "time", global: time[1] === "全局", input: time[2]! } as const;
  if (/^#绝区零(重置|删除|取消)个人提醒时间$/u.test(command)) return { kind: "reset", global: false } as const;
  if (/^#绝区零(全局提醒时间|个人提醒(?:状态|时间))$/u.test(command)) {
    return { kind: "settings", global: command === "#绝区零全局提醒时间" } as const;
  }
}

export function effectiveChallengeReminder(global: ChallengeReminderDefaults, user?: ChallengeReminderPreferences) {
  return {
    abyssCheckLevel: user?.abyssCheckLevel ?? global.abyssCheckLevel,
    deadlyStars: user?.deadlyStars ?? global.deadlyStars,
    remindTime: user?.remindTime ?? global.remindTime,
  };
}

function summary({ abyssCheckLevel, deadlyStars, remindTime }: ReturnType<typeof effectiveChallengeReminder>) {
  const abyss = abyssCheckLevel === 0 ? "式舆防卫战不提醒" :
    `防卫战S评级<${Math.min(abyssCheckLevel, 5)}层${abyssCheckLevel === 6 ? "或第五层<S+评价" : ""}进行提醒`;
  const deadly = deadlyStars === 0 ? "危局强袭战不提醒" : `危局<${deadlyStars}星进行提醒`;
  return `提醒时间: ${remindTime}，${abyss}，${deadly}`;
}

function chinaTime(value: string) {
  return Date.parse(value.replace(" ", "T") + "+08:00");
}

function inPeriod(period: ZzzDeadlySnapshot["period"], now: number) {
  return !period || (chinaTime(period.start) <= now && now <= chinaTime(period.end));
}

function periodLines(period: ZzzDeadlySnapshot["period"], now: number) {
  if (!period) return [];
  const day = (value: string) => value.slice(0, 10).split("-").map(Number).join("/");
  const end = chinaTime(period.end);
  const hours = Math.max(0, Math.floor((end - now) / 3_600_000));
  return [`统计周期：${day(period.start)} - ${day(period.end)}`, `刷新剩余: ${Math.floor(hours / 24)}天${hours % 24}小时`];
}

function statusFailure(name: string, error: unknown) {
  return error instanceof GameRecordRequestError ? `${name}：${error.message}` : `${name}查询失败，请稍后再试。`;
}

export function renderZzzChallengeStatus(
  status: Awaited<ReturnType<ReturnType<typeof createProfileHoyoClient>["fetchZzzChallengeStatus"]>>,
  preferences: Pick<ChallengeReminderDefaults, "abyssCheckLevel" | "deadlyStars">, now = Date.now(), onlyIncomplete = false,
) {
  const { shiyu, deadly } = status;
  const lines: string[] = [];
  if (shiyu.status === "rejected" && !onlyIncomplete) lines.push(statusFailure("式舆防卫战", shiyu.reason));
  if (shiyu.status === "fulfilled") {
    const result: ZzzShiyuSnapshot = shiyu.value;
    if (result.status === "older-format") {
      if (!onlyIncomplete) lines.push("本期式舆防卫战使用旧版深渊战绩格式。");
    } else {
      const count = result.clearedSRanks ?? (result.status === "empty" ? 0 : undefined);
      const fifth = result.overall?.rating;
      const target = preferences.abyssCheckLevel;
      const passed = !!target && count !== undefined && (target === 6 ? count === 5 && fifth === "S+" : count >= target);
      if (!onlyIncomplete || (target > 0 && count !== undefined && !passed && inPeriod(result.period, now))) {
        lines.push(`式舆防卫战S评级: ${count ?? "—"}/5${passed ? " ✓" : ""}`);
        if (fifth || target === 0 || target === 6) lines.push(`第五层评价: ${fifth ?? "无"}${passed && target === 6 ? " ✓" : ""}`);
        lines.push(...periodLines(result.period, now));
      }
    }
  }

  if (deadly.status === "rejected" && !onlyIncomplete) lines.push(statusFailure("危局强袭战", deadly.reason));
  if (deadly.status === "fulfilled") {
    const result = deadly.value;
    const stars = result.totalStars ?? (result.status === "empty" ? 0 : undefined);
    const target = preferences.deadlyStars;
    const passed = !!target && stars !== undefined && stars >= target;
    if (!onlyIncomplete || (target > 0 && stars !== undefined && !passed && inPeriod(result.period, now))) {
      lines.push(`危局强袭战星数: ${stars ?? "—"}/9${passed ? " ✓" : ""}`, ...periodLines(result.period, now));
    }
  }
  return lines.join("\n");
}

type Command = NonNullable<ReturnType<typeof zzzChallengeReminderCommand>>;

export function createZzzChallengeReminders(profiles: ReturnType<typeof createProfileStore>,
  client: ReturnType<typeof createProfileHoyoClient>, signal: AbortSignal) {
  return async (context: ReminderContext, command: Command) => {
    if (context.isDelegated || (context.message_type !== "private" && context.message_type !== "group") ||
        !Number.isSafeInteger(context.user_id) || context.user_id! < 1) return "请使用本人 QQ 会话。";
    const qq = String(context.user_id);
    const redis = globalThis.redis;
    if (!redis) return "挑战提醒设置暂时不可用。";
    const store = createZzzChallengeReminderStore(redis);
    try {
      if (signal.aborted) return;
      if (command.kind !== "status" && command.kind !== "settings" && command.global) {
        const owner = context.adapter === "milky" ? context.isBotMaster?.(context.user_id!) : context.isMaster;
        if (!owner) return "仅限主人设置";
      }
      const global = await store.global();
      const updateUser = (update: (current: ChallengeReminderUser) => ChallengeReminderUser | undefined) =>
        store.updateUser(qq, update, global);
      if (command.kind === "status") {
        const { profileId } = command;
        const source = await profiles.requestSelectedContext(qq, profileId, "zzz");
        if (source.role.gameBiz !== "nap_cn") return "挑战状态暂支持国服绝区零角色。";
        const preferences = effectiveChallengeReminder(global, await store.user(qq));
        if (signal.aborted) return;
        await context.reply("正在查询，请稍候...");
        const result = await client.fetchZzzChallengeStatus(source, { signal });
        const active = await profiles.requestSelectedContext(qq, profileId, "zzz").catch(() => undefined);
        if (signal.aborted) return;
        if (active?.revision !== result.revision || active.role.uid !== source.role.uid || active.role.region !== source.role.region) {
          return "绝区零档案已变化，请重新查询挑战状态。";
        }
        return renderZzzChallengeStatus(result, preferences);
      }
      if (command.kind === "settings") {
        if (command.global) return `当前全局提醒时间: ${global.remindTime}`;
        const user = await store.user(qq);
        const time = user?.remindTime ? `当前个人提醒时间: ${user.remindTime}` : `个人提醒时间未设置，默认使用全局时间: ${global.remindTime}`;
        return user ? `${time}\n当前提醒功能已${user.enable ? `开启\n${summary(effectiveChallengeReminder(global, user))}` : "关闭"}` : time;
      }
      if (!command.global && !(command.kind === "enable" && !command.enabled)) {
        if (!global.enable) return "当前未启用防卫战/危局挑战提醒功能";
        if (!await context.isFriend?.().catch(() => false)) return "请添加好友后重试";
        if (signal.aborted) return;
      }
      if (command.kind === "enable") {
        if (command.global) {
          if (global.enable === command.enabled) return command.enabled ?
            "全局防卫战/危局挑战提醒功能已启用，请勿重复操作" : "全局防卫战/危局挑战提醒功能已禁用，请勿重复操作";
          await store.updateGlobal("enable", command.enabled);
          return `全局防卫战/危局挑战提醒功能已${command.enabled ? "启用" : "禁用"}`;
        }
        const botId = context.self_id;
        if (command.enabled) {
          if (!botId || !Number.isSafeInteger(botId) || botId < 1 || botId === context.user_id) return "无法确认当前提醒机器人。";
          const source = await profiles.requestSelectedContext(qq, 1, "zzz");
          if (source.role.gameBiz !== "nap_cn") return "请先选择已认证的国服绝区零角色，再开启挑战提醒。";
        }
        if (signal.aborted) return;
        const changed = await updateUser(user => user.enable === command.enabled && (!command.enabled || user.botId === botId) ?
          undefined : { ...user, enable: command.enabled, botId: command.enabled ? botId : undefined });
        if (!changed) return command.enabled ? "提醒已开启，请勿重复操作" : "提醒功能尚未开启";
        return `提醒功能已${command.enabled ? `开启，${summary(effectiveChallengeReminder(global, changed))}` : "关闭"}`;
      }
      if (command.kind === "threshold") {
        const shiyu = command.field === "abyssCheckLevel";
        const max = shiyu ? 6 : 9;
        if (command.value > max) return `${shiyu ? "防卫战" : "危局"}阈值必须在0到${max}之间，设置为0时不提醒。`;
        if (signal.aborted) return;
        if (command.global) await store.updateGlobal(command.field, command.value);
        else await updateUser(user => ({ ...user, [command.field]: command.value }));
        const label = `${command.global ? "全局默认" : ""}${shiyu ? "式舆防卫战" : "危局强袭战"}挑战提醒`;
        const threshold = shiyu ? `S层数<${Math.min(5, command.value)}层${command.value === 6 ? "或第五层<S+评价" : ""}` : `<${command.value}星`;
        return `${label}${command.value === 0 ? "已关闭" : `阈值已设为: ${threshold}时提醒`}`;
      }
      if (command.kind === "time") {
        const parsed = challengeReminderTime(command.input);
        if (!parsed.time) return parsed.error;
        if (signal.aborted) return;
        if (command.global) await store.updateGlobal("remindTime", parsed.time);
        else await updateUser(user => ({ ...user, remindTime: parsed.time }));
        return command.global ? `全局提醒时间已更新为: ${parsed.time}` : `您的个人提醒时间已设置为: ${parsed.time}`;
      }
      const reset = await updateUser(user => user.remindTime ? { ...user, remindTime: undefined } : undefined);
      return reset ? "个人提醒时间已重置为全局默认时间" : "个人提醒时间尚未设置";
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return "绝区零档案已变化，请重试。";
        return "请先登录并选择已认证的国服绝区零角色。";
      }
      if (error instanceof HoyoRequestError && error.code === "profile-changed") return "绝区零档案已变化，请重新查询挑战状态。";
      if (command.kind === "status") return "查询失败，请稍后再试。";
      return "挑战提醒设置暂时不可用。";
    }
  };
}
