import type { ZzzTuningSnapshot } from "@lotus-yunzai/hoyo-client";

type Pool = ZzzTuningSnapshot["pools"][number];
type TuningRecord = Pool["records"][number];
type Inventory = ZzzTuningSnapshot["inventory"];

const poolKinds = {
  GACHA_TYPE_CHARACTER_UP: { limited: true, lowerCeiling: false, levels: [74, 87, 99, 105, 120] },
  GACHA_TYPE_CHARACTER_RETURN: { limited: true, lowerCeiling: false, levels: [74, 87, 99, 105, 120] },
  GACHA_TYPE_WEAPON_UP: { limited: true, lowerCeiling: true, levels: [62, 75, 88, 99, 111] },
  GACHA_TYPE_WEAPON_RETURN: { limited: true, lowerCeiling: true, levels: [62, 75, 88, 99, 111] },
  GACHA_TYPE_PERMANENT: { limited: false, lowerCeiling: false, levels: [53, 60, 68, 73, 75] },
  GACHA_TYPE_BANGBOO: { limited: false, lowerCeiling: true, levels: [51, 55, 61, 68, 70] },
} as const satisfies Record<Pool["type"], { limited: boolean; lowerCeiling: boolean; levels: readonly number[] }>;

const inventoryLabels = [
  ["polychrome", "菲林"], ["monochrome", "菲林底片"], ["encryptedMasterTape", "加密母带"],
  ["masterTape", "原装母带"], ["boopon", "邦布券"],
] as const satisfies readonly [keyof Inventory, string][];
const luckTags = ["非到极致", "运气不好", "平稳保底", "小欧一把", "欧狗在此"] as const;
const luckEmojis = [4, 1, 16, 12, 6] as const;
const timeFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "medium" });

export interface ZzzTuningDetailOptions {
  readonly stats: ZzzTuningSnapshot;
  readonly player: { readonly nickname: string; readonly avatar?: string };
  readonly resolveIcon?: (record: TuningRecord) => string | undefined;
}

export interface ZzzTuningDetailEntry {
  readonly itemId: string;
  readonly name: string;
  readonly square_icon: string;
  readonly isUp: boolean;
  readonly totalCount: string;
  readonly color: string;
  readonly date?: string;
  readonly version: string;
}

export interface ZzzTuningDetailPool {
  readonly type: Pool["type"];
  readonly name: Pool["name"];
  readonly timeRange: string;
  readonly lastFive: number | "-";
  readonly pityLabel?: string;
  readonly fiveStars: number;
  readonly upCount: number;
  readonly totalCount: number;
  readonly avgFive: string;
  readonly avgUp: string;
  readonly avgUpEstimated: boolean;
  readonly noWai: string;
  readonly noWaiEstimated: boolean;
  readonly level: number;
  readonly tag: typeof luckTags[number];
  readonly emoji: typeof luckEmojis[number];
  readonly list: readonly ZzzTuningDetailEntry[];
}

export interface ZzzTuningDetailModel {
  readonly uid: string;
  readonly nickname: string;
  readonly avatar?: string;
  readonly data: readonly ZzzTuningDetailPool[];
}

function compareSort(left: string, right: string) {
  if (/^\d+$/u.test(left) && /^\d+$/u.test(right)) return left.length - right.length || left.localeCompare(right);
  return left.localeCompare(right);
}

function positive(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function formatTime(value: number | null): string | undefined {
  if (!positive(value)) return;
  const time = new Date(value * 1000);
  return Number.isFinite(time.getTime()) ? timeFormat.format(time) : undefined;
}

function recordColor(draws: number | null, lowerCeiling: boolean) {
  if (!positive(draws)) return "white";
  if (draws <= (lowerCeiling ? 50 : 60)) return "rgb(63, 255, 0)";
  if (draws >= (lowerCeiling ? 70 : 80)) return "rgb(255, 20, 20)";
  return "white";
}

function renderPool(pool: Pool, resolveIcon: ZzzTuningDetailOptions["resolveIcon"]): ZzzTuningDetailPool {
  const { type, name, totalS: fiveStars, totalDraws: totalCount } = pool;
  const { limited, lowerCeiling, levels } = poolKinds[type];
  const records = [...pool.records].sort((a, b) => (b.time ?? 0) - (a.time ?? 0) || compareSort(b.sort, a.sort));
  const upCount = pool.upCount ?? 0;
  const totalIntervals = fiveStars > 0 && records.length === fiveStars && records.every(({ count }) => positive(count))
    ? records.reduce((sum, record) => sum + record.count!, 0) : undefined;
  const avgFive = totalIntervals === undefined ? undefined : totalIntervals / fiveStars;
  const officialAvgUp = positive(pool.averageUp) && (pool.upCount === null || upCount > 0) ? pool.averageUp : undefined;
  const calculatedAvgUp = totalIntervals !== undefined && upCount > 0 ? totalIntervals / upCount : undefined;
  const avgUp = officialAvgUp ?? calculatedAvgUp;
  const averageForLuck = limited || type === "GACHA_TYPE_BANGBOO" ? avgUp : avgFive;
  const level = averageForLuck === undefined ? 2 : Math.max(0, 4 - levels.filter((limit) => limit < averageForLuck).length);
  const noWaiEstimated = limited && upCount > 0 && fiveStars > 0;
  const noWai = noWaiEstimated ? `${Math.round(Math.max(0, Math.min(1, 2 - fiveStars / upCount)) * 100)}%` : "-";
  const list = records.map((record) => {
    const date = formatTime(record.time);
    return {
      itemId: record.itemId, name: record.name, isUp: record.isUp === true, version: record.version,
      square_icon: resolveIcon ? resolveIcon(record) ?? "" : /^https:\/\//iu.test(record.icon) ? record.icon : "",
      totalCount: positive(record.count) ? String(record.count) : "-", color: recordColor(record.count, lowerCeiling),
      ...(date ? { date } : {}),
    };
  });
  const dates = list.flatMap(({ date }) => date ? [date] : []);
  return {
    type, name, timeRange: dates.length ? `${dates[0]} ～ ${dates.at(-1)}（S级）` : totalCount ? "暂无 S 级记录" : "还没有抽卡",
    lastFive: pool.pity ?? "-", fiveStars, upCount, totalCount, avgFive: avgFive?.toFixed(1) ?? "-",
    avgUp: avgUp?.toFixed(1) ?? "-", avgUpEstimated: officialAvgUp === undefined && calculatedAvgUp !== undefined,
    noWai, noWaiEstimated, level, tag: luckTags[level]!, emoji: luckEmojis[level]!, list,
  };
}

export function buildZzzTuningDetail({ stats, player, resolveIcon }: ZzzTuningDetailOptions): ZzzTuningDetailModel {
  const byType = new Map(stats.pools.map((pool) => [pool.type, pool]));
  const types = Object.keys(poolKinds) as Pool["type"][];
  const data = types.map((type) => {
    const pool = byType.get(type);
    if (!pool) throw new TypeError("绝区零调频详情缺少频段。");
    return renderPool(pool, resolveIcon);
  });
  return {
    uid: stats.uid, nickname: player.nickname, ...(player.avatar ? { avatar: player.avatar } : {}), data,
  };
}

export function buildZzzTuningInventoryReply({ uid, profileId, live }: {
  readonly uid: string;
  readonly profileId: number;
  readonly live?: { readonly uid: string; readonly inventory: Inventory };
}): string | undefined {
  if (live?.uid !== uid) return;
  const fields = inventoryLabels.flatMap(([key, name]) => {
    const count = live.inventory[key];
    return typeof count === "number" && Number.isSafeInteger(count) && count >= 0
      ? [`${name} × ${count.toLocaleString("zh-CN")}`] : [];
  });
  if (!fields.length) return;
  const rows = [fields.slice(0, 2), fields.slice(2)].filter((line) => line.length).map((line) => line.join(" · "));
  return [`Profile ${profileId}（UID: ${uid}）`, "当前库存：", ...rows].join("\n");
}
