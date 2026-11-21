import type { GameRole } from "@lotus-yunzai/account";
import type { ZzzClimbingTowerSnapshot, ZzzShiyuPortrait, ZzzTowerSeason } from "@lotus-yunzai/hoyo-client";
import { renderPng } from "@lotus-yunzai/skia";
import type { CanvasRenderingContext2D as Context, Image } from "skia-canvas";
import { artwork, box, cover, drawZzzCardPlayer, label, loadZzzCardPlayer, openZzzCardTheme, zzzCardFooter,
  type ZzzCardOptions } from "./card-theme.ts";
import { contain, drawPortrait, fillRound, loadChallengePortrait } from "./challenge-card.ts";
import { fetchZzzOfficialArtwork } from "./tuning-artwork.ts";

const width = 840;
const top = 162;
const titles = { 1: "拟真鏖战试炼", 2: "鏖战试炼：末路", 3: "鏖战试炼：荣耀", 4: "鏖战试炼：狂澜" } as const;

function percentage(value: number | undefined) {
  return value === undefined ? "—" : `${(value / 100).toFixed(2)}%`;
}

function score(value: number | undefined) {
  return value === undefined ? "—" : String(value);
}

function mainMetrics(season: ZzzTowerSeason): readonly (readonly [string, string])[] {
  const layer = ["层数", score(season.layer)] as const;
  if (season.number === 1) return [layer];
  if (season.number === 2) return [layer, ["无伤通关", score(season.mvp)]];
  return [layer, ["分数", score(season.score)]];
}

function mvpMetrics(season: ZzzTowerSeason): readonly (readonly [string, string])[] {
  return [["无伤通关", score(season.mvp)], ["排名", percentage(season.percentile)]];
}

export function zzzClimbingTowerText(snapshot: ZzzClimbingTowerSnapshot) {
  return snapshot.seasons.map(season => {
    const metrics = [...mainMetrics(season), ...(season.number >= 3 ? mvpMetrics(season) : [])];
    return [titles[season.number], metrics.map(([name, value]) => `${name} ${value}`).join(" · "),
      ...season.avatars.map(entry => `${entry.name ?? "代理人"} · ${score(entry.score)} · ${percentage(entry.percentile)}`)].join("\n");
  }).join("\n\n");
}

function blockHeight(season: ZzzTowerSeason) {
  return (season.number < 3 ? 201 : 293) + (season.avatars.length ? 237 : 0);
}

function metrics(context: Context, entries: readonly (readonly [string, string])[], y: number) {
  for (const [i, [name, value]] of entries.entries()) {
    const x = width / 2 + (i - (entries.length - 1) / 2) * 228;
    label(context, name, x, y, 24, { align: "center", color: "#979797" });
    label(context, value, x + 2, y + 43, 33, { align: "center", color: "#383434", weight: 700 });
    label(context, value, x, y + 40, 33, { align: "center", color: "#e6e6e6", weight: 700 });
  }
}

// Fixed 2057599 personal tower template uses the same page background and player header as the record cards.
export async function renderZzzClimbingTower(snapshot: ZzzClimbingTowerSnapshot, role: GameRole, options: ZzzCardOptions & { readonly towerVisibility?: readonly (boolean | undefined)[] } = {}) {
  const local = await openZzzCardTheme(options);
  const fetched = new Map<string, Promise<Image | undefined>>();
  function official(url: string) {
    let image = fetched.get(url);
    if (!image) {
      image = artwork(fetchZzzOfficialArtwork(url, options.signal));
      fetched.set(url, image);
    }
    return image;
  }
  const portraits = new Map<ZzzShiyuPortrait, Image | undefined>();
  const badges = ["S", "A", "B"].map(rarity => `common/images/RANK_${rarity}.png`);
  const [background, player, ranks, medals] = await Promise.all([
    local("common/images/bg.jpg"), loadZzzCardPlayer(local, options, role.avatar),
    Promise.all(badges.map(async path => [path, await local(path)] as const)),
    Promise.all(snapshot.seasons.map(season => season.medal ? official(season.medal) : undefined)),
    Promise.all(snapshot.seasons.flatMap(season => season.avatars.map(entry =>
      loadChallengePortrait(entry, false, local, official, portraits)))),
  ]);
  const art = { local: new Map(ranks), portraits };
  options.signal?.throwIfAborted();
  const visibility = options.towerVisibility;
  const showVisibility = visibility?.some(value => value !== undefined);
  const height = top + snapshot.seasons.reduce((sum, season) => sum + blockHeight(season) + 22, 0) + (showVisibility ? 118 : 57);
  return renderPng(width * 2, height * 2, context => {
    context.scale(2, 2);
    box(context, "#1d1a24", 0, 0, width, height);
    if (background) cover(context, background, 0, 0, width, height);
    drawZzzCardPlayer(context, role, snapshot.region, player);
    let y = top;
    for (const [i, season] of snapshot.seasons.entries()) {
      const h = blockHeight(season);
      fillRound(context, "#0009", 27, y, 786, h, 20, "#444");
      label(context, titles[season.number], 64, y + 55, 37, { color: "#383434", weight: 700 });
      label(context, titles[season.number], 62, y + 52, 37, { color: "#e6e6e6", weight: 700 });
      const medal = medals[i];
      if (medal) contain(context, medal, 718, y + 19, 55, 62);
      metrics(context, mainMetrics(season), y + 106);
      if (season.number >= 3) {
        box(context, "#444", 51, y + 175, 738, 2);
        metrics(context, mvpMetrics(season), y + 212);
      }
      for (const [rank, entry] of season.avatars.entries()) {
        const x = 72 + rank * 246;
        const row = y + 288;
        drawPortrait(context, art, entry, x, row, 204);
        fillRound(context, "#000b", x + 3, row + 167, 198, 33, 6);
        label(context, score(entry.score), x + 10, row + 184, 21, { maxWidth: 86 });
        label(context, percentage(entry.percentile), x + 195, row + 184, 21, { align: "right", maxWidth: 90 });
      }
      y += h + 22;
    }
    if (showVisibility && visibility) {
      const state = (value: boolean | undefined) => value === undefined ? "未登记" : value ? "显示" : "隐藏";
      label(context, `本群爬塔排名 · S3 ${state(visibility[0])} · S4 ${state(visibility[1])}`, 40, y + 9, 20, { color: "#f3cb45" });
      label(context, "使用 %显示爬塔S3排名 或 %显示爬塔S4排名 设置", 40, y + 37, 18, { color: "#a09ca3" });
    }
    label(context, zzzCardFooter, width / 2, height - 37, 17, { align: "center", color: "#a09ca3" });
  }, "gpu");
}
