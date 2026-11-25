import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
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
const tags = [$t("gacha-legacy-detail.text_8d4011aa6a"), $t("gacha-legacy-detail.text_449e4419c0"), $t("gacha-legacy-detail.text_1038ca6f98"), $t("gacha-legacy-detail.text_3b0c768385"), $t("gacha-legacy-detail.text_e3ead1a16b")] as const;
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
    timeRange: totalCount ? `${records[0]!.time} ～ ${records.at(-1)!.time}` : $t("gacha-legacy-detail.text_33010258e7"),
    lastFive: newest?.index ?? "-",
    ...(!newest ? { pityLabel: totalCount ? $t("gacha-legacy-detail.text_8d055493e7") : $t("gacha-legacy-detail.text_b60895e8b7") } : {}),
    avgFive: average?.toFixed(1) ?? "-", avgUp: "-", noWai: "-",
    avgUpEstimated: false, noWaiEstimated: false,
    level, tag: tags[level]!, emoji: emojis[level]!,
  };
}

export function buildZzzLegacyDetail({ stats, player, resolveIcon }: ZzzLegacyDetailOptions): ZzzTuningDetailModel {
  const byType = new Map(stats.pools.map((pool) => [pool.type, pool]));
  const data = poolTypes.map((type) => {
    const pool = byType.get(type);
    if (!pool) throw new TypeError($t("gacha-legacy-detail.text_d53bc23ead"));
    return analyzePool(pool, resolveIcon);
  });
  return {
    uid: stats.uid, nickname: player.nickname, ...(player.avatar ? { avatar: player.avatar } : {}), data,
  };
}
