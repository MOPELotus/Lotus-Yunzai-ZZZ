import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

type Redis = NonNullable<typeof globalThis.redis>;

export interface ChallengeReminderPreferences {
  readonly abyssCheckLevel?: number;
  readonly deadlyStars?: number;
  readonly remindTime?: string;
}

export interface ChallengeReminderUser extends ChallengeReminderPreferences {
  readonly enable: boolean;
  readonly botId?: number;
}

export interface ChallengeReminderDefaults {
  readonly enable: boolean;
  readonly abyssCheckLevel: number;
  readonly deadlyStars: number;
  readonly remindTime: string;
}

const oldUsers = "ZZZ:REMIND:USER_CONFIGS";
const users = "lotus-yunzai:zzz-challenge-reminders:users";
const settings = "lotus-yunzai:zzz-challenge-reminders:settings";
const oldSettings = fileURLToPath(new URL("../ZZZ-Plugin/config/remind.yaml", import.meta.url));
const defaults: ChallengeReminderDefaults = { enable: true, abyssCheckLevel: 5, deadlyStars: 6, remindTime: "每日20时" };

const replaceUser = `
local current = redis.call('HGET', KEYS[1], ARGV[1])
if (not current and ARGV[2] == '') or current == ARGV[2] then
  redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
  return 1
end
return 0
`;

const finishSlot = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], 'finished', 'EX', 172800)
return 1
`;
const releaseSlot = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('DEL', KEYS[1])
end
`;

const reminderTimePattern = /^(每日|每周[日天一二三四五六])(\d{1,2})时(?:(\d{1,2})分)?$/u;
const shanghaiClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
});
const weekNames: Record<string, string> = { Sun: "日", Mon: "一", Tue: "二", Wed: "三", Thu: "四", Fri: "五", Sat: "六" };

export function challengeReminderWindow(input: string, now: number) {
  const rule = reminderTimePattern.exec(input);
  if (!rule) return;
  const parts = Object.fromEntries(shanghaiClock.formatToParts(now).map(({ type, value }) => [type, value]));
  const weekday = rule[1]?.slice(2).replace("天", "日");
  if (weekday && weekday !== weekNames[parts.weekday ?? ""]) return;
  const elapsed = Number(parts.hour) * 60 + Number(parts.minute) - (Number(rule[2]) * 60 + Number(rule[3] ?? 0));
  if (elapsed >= 0 && elapsed < 10) return `${parts.year}-${parts.month}-${parts.day}`;
}

export function challengeReminderTime(input: string): { readonly time: string; readonly error?: never } | { readonly error: string; readonly time?: never } {
  const match = reminderTimePattern.exec(input);
  if (!match) return { error: "时间格式错误，请使用每日20时或每周五20时30分。" } as const;
  const hour = Number(match[2]), minute = Number(match[3] || 0);
  if (hour > 23) return { error: "小时必须在 0 到 23 之间。" } as const;
  if (minute >= 60 || minute % 10 !== 0) return { error: "分钟必须为整十分钟。" } as const;
  return { time: `${match[1]}${hour}时${minute ? `${minute}分` : ""}` } as const;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function count(value: unknown, maximum: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum ? value : undefined;
}

function time(value: unknown) {
  if (typeof value === "string" && value.length <= 32) return challengeReminderTime(value).time;
}

function parseUser(raw: string | null | undefined, useBinding: boolean): ChallengeReminderUser | undefined {
  if (!raw || raw.length > 4096) return;
  try {
    const doc = object(JSON.parse(raw));
    const botId = useBinding ? count(doc.botId, Number.MAX_SAFE_INTEGER) : undefined;
    if (typeof doc.enable !== "boolean" || (useBinding && doc.botId !== undefined && !botId)) return;
    return { enable: doc.enable, abyssCheckLevel: count(doc.abyssCheckLevel, 6), deadlyStars: count(doc.deadlyStars, 9),
      remindTime: time(doc.remindTime), botId };
  } catch {
    return;
  }
}

async function readOldSettings(path: string) {
  try {
    const data = await readFile(path, "utf8");
    return data.length <= 16_384 ? object(Bun.YAML.parse(data)) : {};
  } catch {
    return {};
  }
}

export function createZzzChallengeReminderStore(redis: Redis, configPath = Bun.env.LOTUS_ZZZ_LEGACY_REMIND_CONFIG || oldSettings) {
  async function readUser(qq: string) {
    const modern = await redis.hGet(users, qq);
    if (modern != null) return { modern, value: parseUser(modern, true) };
    return { modern, value: parseUser(await redis.hGet(oldUsers, qq), false) };
  }

  return {
    async global(): Promise<ChallengeReminderDefaults> {
      const [current, legacy] = await Promise.all([redis.hGetAll(settings), readOldSettings(configPath)]);
      return {
        enable: current.enable === "1" ? true : current.enable === "0" ? false :
          typeof legacy.enable === "boolean" ? legacy.enable : defaults.enable,
        abyssCheckLevel: count(current.abyssCheckLevel === undefined ? undefined : Number(current.abyssCheckLevel), 6) ??
          count(legacy.abyssCheckLevel, 6) ?? defaults.abyssCheckLevel,
        deadlyStars: count(current.deadlyStars === undefined ? undefined : Number(current.deadlyStars), 9) ??
          count(legacy.deadlyStars, 9) ?? defaults.deadlyStars,
        remindTime: time(current.remindTime) ?? time(legacy.globalRemindTime) ?? defaults.remindTime,
      };
    },
    async updateGlobal<Field extends keyof ChallengeReminderDefaults>(key: Field, value: ChallengeReminderDefaults[Field]) {
      await redis.hSet(settings, key, typeof value === "boolean" ? value ? "1" : "0" : String(value));
    },
    async user(qq: string) {
      return (await readUser(qq)).value;
    },
    async *subscriberIds() {
      for (const key of [users, oldUsers]) {
        for await (const { field, value } of redis.hScanIterator(key, { COUNT: 100 })) {
          if (!/^[1-9]\d{0,15}$/u.test(field) || !Number.isSafeInteger(Number(field)) || !parseUser(value, key === users)?.enable) continue;
          if (key === oldUsers && await redis.hExists(users, field)) continue;
          yield field;
        }
      }
    },
    async claim(qq: string, day: string) {
      const key = `lotus-yunzai:zzz-challenge-reminders:dispatch:${day}:${qq}`;
      const token = crypto.randomUUID();
      if (await redis.set(key, token, { NX: true, EX: 90 }) !== "OK") return;
      return {
        async finish() { return await redis.eval(finishSlot, { keys: [key], arguments: [token] }) === 1; },
        async release() { await redis.eval(releaseSlot, { keys: [key], arguments: [token] }); },
      };
    },
    async updateUser(qq: string, update: (current: ChallengeReminderUser) => ChallengeReminderUser | undefined,
      initial?: Pick<ChallengeReminderDefaults, "abyssCheckLevel" | "deadlyStars">) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const { modern, value } = await readUser(qq);
        const next = update(value ?? { enable: false, abyssCheckLevel: initial?.abyssCheckLevel, deadlyStars: initial?.deadlyStars });
        if (!next) return;
        const changed = await redis.eval(replaceUser, { keys: [users], arguments: [qq, modern ?? "", JSON.stringify(next)] });
        if (changed === 1) return next;
      }
      throw new Error("绝区零挑战提醒设置发生并发修改。");
    },
  };
}
