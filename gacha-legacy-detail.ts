import type { ZzzLegacyGachaDraw, ZzzLegacyGachaPool, ZzzLegacyGachaSnapshot } from "./gacha-legacy.ts";
import type { ZzzTuningDetailEntry, ZzzTuningDetailModel, ZzzTuningDetailPool } from "./tuning-detail.ts";

interface ZzzLegacyDetailOptions {
  readonly stats: ZzzLegacyGachaSnapshot;
  readonly player: { readonly nickname: string; readonly avatar?: string };
  readonly resolveIcon?: (draw: ZzzLegacyGachaDraw) => string | undefined;
}

const poolTypes = [
  "GACHA_TYPE_CHARACTER_UP", "GACHA_TYPE_CHARACTER_RETURN",
  "GACHA_TYPE_WEAPON_UP", "GACHA_TYPE_WEAPON_RETURN",
  "GACHA_TYPE_PERMANENT", "GACHA_TYPE_BANGBOO",
] as const satisfies readonly ZzzLegacyGachaPool["type"][];
const tags = ["非到极致", "运气不好", "平稳保底", "小欧一把", "欧狗在此"] as const;
const emojis = [4, 1, 16, 12, 6] as const;

function intervalColor(interval: number, lowerCeiling: boolean): string {
  if (interval <= (lowerCeiling ? 50 : 60)) return "rgb(63, 255, 0)";
  if (interval >= (lowerCeiling ? 70 : 80)) return "rgb(255, 20, 20)";
  return "white";
}

function analyzePool(pool: ZzzLegacyGachaPool, resolveIcon: ZzzLegacyDetailOptions["resolveIcon"]): ZzzTuningDetailPool {
  const { type, name, records } = pool;
  const totalCount = records.length;
  const permanent = type === "GACHA_TYPE_PERMANENT";
  const lowerCeiling = type === "GACHA_TYPE_WEAPON_UP" || type === "GACHA_TYPE_WEAPON_RETURN" || type === "GACHA_TYPE_BANGBOO";
  const fiveStars = records.flatMap((draw, index) => draw.rank === "4" ? [{ draw, index }] : []);
  const newest = fiveStars[0];
  const oldest = fiveStars.at(-1);
  const average = newest && oldest && fiveStars.length > 1
    ? (oldest.index - newest.index) / (fiveStars.length - 1)
    : undefined;
  const level = permanent && average !== undefined
    ? Math.max(0, 4 - [53, 60, 68, 73, 75].filter((limit) => limit < average).length)
    : 2;
  const list = fiveStars.map(({ draw, index }, row): ZzzTuningDetailEntry => {
    const previous = fiveStars[row + 1];
    return {
      itemId: draw.itemId, name: draw.name, square_icon: resolveIcon?.(draw) ?? "",
      // The archive carries an activity ID but no featured item or guarantee state.
      isUp: false, version: "", date: draw.time,
      totalCount: previous ? String(previous.index - index) : `≥${totalCount - index}`,
      color: previous ? intervalColor(previous.index - index, lowerCeiling) : "white",
    };
  });
  return {
    type, name, totalCount, list, fiveStars: fiveStars.length, upCount: 0,
    timeRange: totalCount ? `${records[0]!.time} ～ ${records.at(-1)!.time}` : "还没有抽卡",
    lastFive: newest?.index ?? "-",
    ...(!newest ? { pityLabel: totalCount ? "档案内未出S级" : "暂无抽卡记录" } : {}),
    avgFive: average?.toFixed(1) ?? "-", avgUp: "-", noWai: "-",
    avgUpEstimated: false, noWaiEstimated: false,
    level, tag: tags[level]!, emoji: emojis[level]!,
  };
}

export function buildZzzLegacyDetail({ stats, player, resolveIcon }: ZzzLegacyDetailOptions): ZzzTuningDetailModel {
  const byType = new Map(stats.pools.map((pool) => [pool.type, pool]));
  const data = poolTypes.map((type) => {
    const pool = byType.get(type);
    if (!pool) throw new TypeError("绝区零旧逐抽档案缺少频段。");
    return analyzePool(pool, resolveIcon);
  });
  return {
    uid: stats.uid, nickname: player.nickname, ...(player.avatar ? { avatar: player.avatar } : {}), data,
  };
}
