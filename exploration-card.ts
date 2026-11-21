import type { GameRole } from "@lotus-yunzai/account";
import { zzzExplorationColumns as columns, type ZzzExplorationSnapshot } from "@lotus-yunzai/hoyo-client";
import { renderPng } from "@lotus-yunzai/skia";
import type { Image } from "skia-canvas";
import { artwork, box, cover, drawZzzCardPlayer, label, loadZzzCardPlayer, openZzzCardTheme, zzzCardFooter,
  type ZzzCardOptions } from "./card-theme.ts";
import { contain, fillRound } from "./challenge-card.ts";
import { fetchZzzOfficialArtwork } from "./tuning-artwork.ts";

const width = 1000;
const mapHeight = 179;
const rowHeight = 192;
const start = 171;
const orange = "#ffa500";

function percent(value?: string) {
  return value === undefined ? "—" : `${value}%`;
}

function progress(value: { current?: number; maximum?: number }) {
  return `${value.current ?? "—"} / ${value.maximum ?? "—"}`;
}

function areaName(area: ZzzExplorationSnapshot["areas"][number]) {
  return `${area.name ?? "区域"}${area.continued ? "（续）" : ""}`;
}

function continuation(snapshot: ZzzExplorationSnapshot, command: string) {
  if (snapshot.page < snapshot.pageCount) return `下一页 ${command} 页 ${snapshot.page + 1}`;
}

export function zzzExplorationText(snapshot: ZzzExplorationSnapshot, command: string) {
  const title = snapshot.pageCount > 1 ? `区域收集 · ${snapshot.page} / ${snapshot.pageCount}` : "区域收集";
  return [title, ...snapshot.areas.flatMap(area => [
    `${areaName(area)} · ${percent(area.progress)}`,
    ...area.maps.map(map => `${map.name ?? "地图"} · ${percent(map.progress)}${map.collections.length ?
      ` · ${map.collections.map(progress).join(" · ")}` : ""}`),
  ]), continuation(snapshot, command)].filter(Boolean).join("\n");
}

export async function renderZzzExploration(snapshot: ZzzExplorationSnapshot, role: GameRole, command: string, options: ZzzCardOptions = {}) {
  const local = await openZzzCardTheme(options);
  const [background, player] = await Promise.all([
    local("common/images/bg.jpg"), loadZzzCardPlayer(local, options, role.avatar),
  ]);
  const icons = new Map<string, Image | undefined>();
  const urls = [...new Set(snapshot.areas.flatMap(area => area.maps.flatMap(map => [map.icon, ...map.collections.map(item => item.icon)]))
    .filter((url): url is string => typeof url === "string"))];
  for (let index = 0; index < urls.length; index += 8) {
    options.signal?.throwIfAborted();
    await Promise.all(urls.slice(index, index + 8).map(async url => icons.set(url, await artwork(fetchZzzOfficialArtwork(url, options.signal)))));
  }
  options.signal?.throwIfAborted();
  const heights = snapshot.areas.map(area => 65 + Math.ceil(area.maps.length / columns) * rowHeight);
  const follow = continuation(snapshot, command);
  const height = start + 81 + heights.reduce((sum, value) => sum + value + 21, 0) + (follow ? 96 : 52);
  return renderPng(width * 4, height * 4, ctx => {
    ctx.scale(4, 4);
    box(ctx, "#1d1a24", 0, 0, width, height);
    if (background) cover(ctx, background, 0, 0, width, height);
    drawZzzCardPlayer(ctx, role, snapshot.region, player);
    fillRound(ctx, "#0009", 29, start, 942, height - start - 34, 17, "#444");
    label(ctx, "区域收集", 58, start + 39, 36, { color: "#e6e6e6", weight: 700 });
    if (snapshot.pageCount > 1) label(ctx, `${snapshot.page} / ${snapshot.pageCount}`, 938, start + 39, 23,
      { align: "right", color: "#aaa" });
    box(ctx, "#444", 56, start + 64, 886, 2);
    let y = start + 81;
    for (const [index, area] of snapshot.areas.entries()) {
      const areaHeight = heights[index]!;
      fillRound(ctx, "#fff3", 56, y, 886, areaHeight, 12);
      fillRound(ctx, "#ffffff0d", 56, y, 886, 49, 12);
      label(ctx, areaName(area), 73, y + 25, 28, { color: "#e6e6e6", maxWidth: 700 });
      label(ctx, percent(area.progress), 923, y + 25, 27, { align: "right", color: orange });
      for (const [position, map] of area.maps.entries()) {
        const x = 65 + position % columns * 292;
        const top = y + 59 + Math.floor(position / columns) * rowHeight;
        fillRound(ctx, "#ffffff0d", x, top, 283, mapHeight, 9);
        if (map.name) label(ctx, map.name, x + 10, top + 20, 19, { color: "#e6e6e6", maxWidth: 258 });
        const mapIcon = map.icon && icons.get(map.icon);
        if (mapIcon) contain(ctx, mapIcon, x + 6, top + 47, 92, 84);
        label(ctx, percent(map.progress), x + 52, top + 150, 23, { align: "center", color: orange });
        for (const [i, item] of map.collections.entries()) {
          const line = top + 41 + i * 31;
          fillRound(ctx, "#0005", x + 104, line, 166, 26, 3);
          const icon = item.icon && icons.get(item.icon);
          if (icon) contain(ctx, icon, x + 106, line + 3, 21, 21);
          else if (item.name) label(ctx, item.name, x + 109, line + 13, 13, { color: "#ddd", maxWidth: 67 });
          label(ctx, progress(item), x + 264, line + 13, 17, { align: "right", maxWidth: icon ? 128 : 83 });
        }
      }
      y += areaHeight + 21;
    }
    if (follow) label(ctx, follow, 61, y + 17, 23, { color: orange, maxWidth: 750 });
    label(ctx, zzzCardFooter, width / 2, height - 17, 15, { align: "center", color: "#a09ca3" });
  }, "gpu");
}
