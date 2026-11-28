import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import { zzzChallengeTime } from "./challenge-time.ts";
import { readChallengeReminderContext } from "./challenge-profile.ts";
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
  const abyss = abyssCheckLevel === 0 ? $t("challenge-reminder.text_3d922fd4f8") :
    $t("challenge-reminder.text_c1d6fc7537", { "value1": Math.min(abyssCheckLevel, 5), "value2": abyssCheckLevel === 6 ? $t("challenge-reminder.text_751c29b5c7") : "" });
  const deadly = deadlyStars === 0 ? $t("challenge-reminder.text_d8f44fcb83") : $t("challenge-reminder.text_f5c193154e", { "deadlyStars": deadlyStars });
  return $t("challenge-reminder.text_0a989797d0", { "remindTime": remindTime, "abyss": abyss, "deadly": deadly });
}

function inPeriod(period: ZzzDeadlySnapshot["period"], now: number, region: string) {
  if (!period) return true;
  const start = zzzChallengeTime(period.start, region), end = zzzChallengeTime(period.end, region);
  return start !== undefined && end !== undefined && start <= now && now <= end;
}

function periodLines(period: ZzzDeadlySnapshot["period"], now: number, region: string) {
  if (!period) return [];
  const day = (value: string) => value.slice(0, 10).split("-").map(Number).join("/");
  const end = zzzChallengeTime(period.end, region);
  if (end === undefined) return [];
  const hours = Math.max(0, Math.floor((end - now) / 3_600_000));
  return [$t("challenge-reminder.text_001e45cbfe", { "value1": day(period.start), "value2": day(period.end) }), $t("challenge-reminder.text_86182928fc", { "value1": Math.floor(hours / 24), "value2": hours % 24 })];
}

function statusFailure(name: string, error: unknown) {
  return error instanceof GameRecordRequestError ? `${name}：${error.message}` : $t("challenge-reminder.text_fd669be8ec", { "name": name });
}

export function renderZzzChallengeStatus(
  status: Awaited<ReturnType<ReturnType<typeof createProfileHoyoClient>["fetchZzzChallengeStatus"]>>,
  preferences: Pick<ChallengeReminderDefaults, "abyssCheckLevel" | "deadlyStars">, now = Date.now(), onlyIncomplete = false,
) {
  const { shiyu, deadly } = status;
  const lines: string[] = [];
  if (shiyu.status === "rejected" && !onlyIncomplete) lines.push(statusFailure($t("challenge-reminder.text_f718dc4321"), shiyu.reason));
  if (shiyu.status === "fulfilled") {
    const result: ZzzShiyuSnapshot = shiyu.value;
    if (result.status === "older-format") {
      if (!onlyIncomplete) lines.push($t("challenge-reminder.text_03b6b35594"));
    } else {
      const count = result.clearedSRanks ?? (result.status === "empty" ? 0 : undefined);
      const fifth = result.overall?.rating;
      const target = preferences.abyssCheckLevel;
      const passed = !!target && count !== undefined && (target === 6 ? count === 5 && fifth === "S+" : count >= target);
      if (!onlyIncomplete || (target > 0 && count !== undefined && !passed && inPeriod(result.period, now, result.region))) {
        lines.push($t("challenge-reminder.text_e48e8362c8", { "value1": count ?? "—", "value2": passed ? " ✓" : "" }));
        if (fifth || target === 0 || target === 6) lines.push($t("challenge-reminder.text_2b69096fc4", { "value1": fifth ?? $t("challenge-reminder.text_484d556139"), "value2": passed && target === 6 ? " ✓" : "" }));
        lines.push(...periodLines(result.period, now, result.region));
      }
    }
  }

  if (deadly.status === "rejected" && !onlyIncomplete) lines.push(statusFailure($t("challenge-reminder.text_4b7b8e83d9"), deadly.reason));
  if (deadly.status === "fulfilled") {
    const result = deadly.value;
    const stars = result.totalStars ?? (result.status === "empty" ? 0 : undefined);
    const target = preferences.deadlyStars;
    const passed = !!target && stars !== undefined && stars >= target;
    if (!onlyIncomplete || (target > 0 && stars !== undefined && !passed && inPeriod(result.period, now, result.region))) {
      lines.push($t("challenge-reminder.text_5083419aa5", { "value1": stars ?? "—", "value2": passed ? " ✓" : "" }), ...periodLines(result.period, now, result.region));
    }
  }
  return lines.join("\n");
}

type Command = NonNullable<ReturnType<typeof zzzChallengeReminderCommand>>;

export function createZzzChallengeReminders(profiles: ReturnType<typeof createProfileStore>,
  client: ReturnType<typeof createProfileHoyoClient>, signal: AbortSignal) {
  return async (context: ReminderContext, command: Command) => {
    if (context.isDelegated || (context.message_type !== "private" && context.message_type !== "group") ||
        !Number.isSafeInteger(context.user_id) || context.user_id! < 1) return $t("challenge-reminder.text_3572dddd0b");
    const qq = String(context.user_id);
    const redis = globalThis.redis;
    if (!redis) return $t("challenge-reminder.text_0b6fd937eb");
    const store = createZzzChallengeReminderStore(redis);
    try {
      if (signal.aborted) return;
      if (command.kind !== "status" && command.kind !== "settings" && command.global) {
        const owner = context.adapter === "milky" ? context.isBotMaster?.(context.user_id!) : context.isMaster;
        if (!owner) return $t("challenge-reminder.text_0340379e5a");
      }
      const global = await store.global();
      const updateUser = (update: (current: ChallengeReminderUser) => ChallengeReminderUser | undefined) =>
        store.updateUser(qq, update, global);
      if (command.kind === "status") {
        const { profileId } = command;
        const source = await readChallengeReminderContext(profiles, qq, profileId);
        if (!source) return $t("challenge-reminder.text_99b13fad14");
        const preferences = effectiveChallengeReminder(global, await store.user(qq));
        if (signal.aborted) return;
        await context.reply($t("challenge-reminder.text_666d9ed291"));
        const result = await client.fetchZzzChallengeStatus(source, { signal });
        const active = await profiles.requestSelectedContext(qq, profileId, "zzz").catch(() => undefined);
        if (signal.aborted) return;
        if (active?.revision !== result.revision || active.role.uid !== source.role.uid || active.role.region !== source.role.region) {
          return $t("challenge-reminder.text_89dcf7dc6c");
        }
        return renderZzzChallengeStatus(result, preferences);
      }
      if (command.kind === "settings") {
        if (command.global) return $t("challenge-reminder.text_26fbdacd22", { "remindTime": global.remindTime });
        const user = await store.user(qq);
        const time = user?.remindTime ? $t("challenge-reminder.text_3a13d8e8df", { "remindTime": user.remindTime }) : $t("challenge-reminder.text_5cf51970d0", { "remindTime": global.remindTime });
        return user ? $t("challenge-reminder.text_01d829ecc1", { "time": time, "value2": user.enable ? $t("challenge-reminder.text_6721358145", { "value1": summary(effectiveChallengeReminder(global, user)) }) : $t("challenge-reminder.text_3fd47edce4") }) : time;
      }
      if (!command.global && !(command.kind === "enable" && !command.enabled)) {
        if (!global.enable) return $t("challenge-reminder.text_2d42c8a136");
        if (!await context.isFriend?.().catch(() => false)) return $t("challenge-reminder.text_4316355d17");
        if (signal.aborted) return;
      }
      if (command.kind === "enable") {
        if (command.global) {
          if (global.enable === command.enabled) return command.enabled ?
            $t("challenge-reminder.text_318d89c6f9") : $t("challenge-reminder.text_a69107d493");
          await store.updateGlobal("enable", command.enabled);
          return $t("challenge-reminder.text_44a4b3c65d", { "value1": command.enabled ? $t("challenge-reminder.text_f4f0ead111") : $t("challenge-reminder.text_7df5c456c7") });
        }
        const botId = context.self_id;
        if (command.enabled) {
          if (!botId || !Number.isSafeInteger(botId) || botId < 1 || botId === context.user_id) return $t("challenge-reminder.text_0a50984465");
          const source = await readChallengeReminderContext(profiles, qq, 1);
          if (!source) return $t("challenge-reminder.text_8fd6f36099");
        }
        if (signal.aborted) return;
        const changed = await updateUser(user => user.enable === command.enabled && (!command.enabled || user.botId === botId) ?
          undefined : { ...user, enable: command.enabled, botId: command.enabled ? botId : undefined });
        if (!changed) return command.enabled ? $t("challenge-reminder.text_b3aeba5478") : $t("challenge-reminder.text_4a1667a71f");
        return $t("challenge-reminder.text_c13b40d772", { "value1": command.enabled ? $t("challenge-reminder.text_d94391dc68", { "value1": summary(effectiveChallengeReminder(global, changed)) }) : $t("challenge-reminder.text_3fd47edce4") });
      }
      if (command.kind === "threshold") {
        const shiyu = command.field === "abyssCheckLevel";
        const max = shiyu ? 6 : 9;
        if (command.value > max) return $t("challenge-reminder.text_ca0faafcf5", { "value1": shiyu ? $t("challenge-reminder.text_0992e2443a") : $t("challenge-reminder.text_d5636be4da"), "max": max });
        if (signal.aborted) return;
        if (command.global) await store.updateGlobal(command.field, command.value);
        else await updateUser(user => ({ ...user, [command.field]: command.value }));
        const label = $t("challenge-reminder.text_3a49cc2d72", { "value1": command.global ? $t("challenge-reminder.text_419bf8bc14") : "", "value2": shiyu ? $t("challenge-reminder.text_f718dc4321") : $t("challenge-reminder.text_4b7b8e83d9") });
        const threshold = shiyu ? $t("challenge-reminder.text_307bd805d6", { "value1": Math.min(5, command.value), "value2": command.value === 6 ? $t("challenge-reminder.text_751c29b5c7") : "" }) : $t("challenge-reminder.text_e06b50e03d", { "value": command.value });
        return `${label}${command.value === 0 ? $t("challenge-reminder.text_6744b4c6a9") : $t("challenge-reminder.text_6ebd073589", { "threshold": threshold })}`;
      }
      if (command.kind === "time") {
        const parsed = challengeReminderTime(command.input);
        if (!parsed.time) return parsed.error;
        if (signal.aborted) return;
        if (command.global) await store.updateGlobal("remindTime", parsed.time);
        else await updateUser(user => ({ ...user, remindTime: parsed.time }));
        return command.global ? $t("challenge-reminder.text_69ea8e3e98", { "time": parsed.time }) : $t("challenge-reminder.text_b0db9143c5", { "time": parsed.time });
      }
      const reset = await updateUser(user => user.remindTime ? { ...user, remindTime: undefined } : undefined);
      return reset ? $t("challenge-reminder.text_eca3d5a10b") : $t("challenge-reminder.text_9ab4bcdd35");
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return $t("challenge-reminder.text_604a89f0f3");
        return $t("challenge-reminder.text_4c8c592412");
      }
      if (error instanceof HoyoRequestError && error.code === "profile-changed") return $t("challenge-reminder.text_89dcf7dc6c");
      if (command.kind === "status") return $t("challenge-reminder.text_a957087b16");
      return $t("challenge-reminder.text_0b6fd937eb");
    }
  };
}
