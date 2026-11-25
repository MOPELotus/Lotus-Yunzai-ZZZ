import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import type { GameRole } from "@lotus-yunzai/account";
import { zzzExplorationColumns as columns, type ZzzExplorationSnapshot } from "@lotus-yunzai/hoyo-client";
import type { CanvasRenderingContext2D, Image } from "skia-canvas";
import { artwork, box, cover, drawZzzCardPlayer, label, loadZzzCardPlayer, openZzzCardTheme, zzzCardFooter,
  type ZzzCardOptions } from "./card-theme.ts";
import { contain, fillRound, renderZzzBattlePng } from "./challenge-card.ts";
import { fetchZzzOfficialArtwork } from "./tuning-artwork.ts";

const width = 1000;
const start = 184.8;
const side = 57;
const areaWidth = width - 2 * side;
const mapGap = 19.2;
const mapWidth = (areaWidth - (columns - 1) * mapGap) / columns;
const orange = "#ffa500";

function percent(value?: string) {
  return value === undefined ? "—" : `${value}%`;
}

function progress(value: { current?: number; maximum?: number }) {
  return `${value.current ?? "—"} / ${value.maximum ?? "—"}`;
}

function areaName(area: ZzzExplorationSnapshot["areas"][number]) {
  return `${area.name ?? $t("exploration-card.text_3382870bc4")}${area.continued ? $t("exploration-card.text_d065195833") : ""}`;
}

function continuation(snapshot: ZzzExplorationSnapshot, command: string) {
  if (snapshot.page < snapshot.pageCount) return $t("exploration-card.text_05a2a8504c", { "command": command, "value2": snapshot.page + 1 });
}

export function zzzExplorationText(snapshot: ZzzExplorationSnapshot, command: string) {
  const title = snapshot.pageCount > 1 ? $t("exploration-card.text_53f6a935c5", { "page": snapshot.page, "pageCount": snapshot.pageCount }) : $t("exploration-card.text_8f85779c47");
  return [title, ...snapshot.areas.flatMap(area => [
    `${areaName(area)} · ${percent(area.progress)}`,
    ...area.maps.map(map => `${map.name ?? $t("exploration-card.text_41ab2e0ecb")} · ${percent(map.progress)}${map.collections.length ?
      ` · ${map.collections.map(progress).join(" · ")}` : ""}`),
  ]), continuation(snapshot, command)].filter(Boolean).join("\n");
}

export async function createZzzExplorationRenderer(snapshot: ZzzExplorationSnapshot, role: GameRole, command: string, options: ZzzCardOptions = {}) {
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
  return (view: ZzzExplorationSnapshot) => renderZzzExploration(view, role, command, background, player, icons, options);
}

function renderZzzExploration(snapshot: ZzzExplorationSnapshot, role: GameRole, command: string, background: Image | undefined,
  player: Awaited<ReturnType<typeof loadZzzCardPlayer>>, icons: ReadonlyMap<string, Image | undefined>, options: ZzzCardOptions) {
  options.signal?.throwIfAborted();
  const layouts = snapshot.areas.map(area => {
    const rows = Array.from({ length: Math.ceil(area.maps.length / columns) }, (_, row) =>
      area.maps.slice(row * columns, (row + 1) * columns));
    const heights = rows.map(row => row.some(map => map.collections.length === 4) ? 160.7 : 159.2);
    return { area, rows, heights, height: 88.8 + heights.reduce((sum, value) => sum + value, 0) + Math.max(0, rows.length - 1) * mapGap };
  });
  const follow = continuation(snapshot, command);
  const contentY = 303.8;
  const contentHeight = layouts.reduce((sum, layout) => sum + layout.height, 0) + Math.max(0, layouts.length - 1) * 36;
  const panelEnd = contentY + contentHeight + 33 + (follow ? 36 : 0);
  const height = Math.round(panelEnd + 103.6);
  return renderZzzBattlePng(width, height, ctx => {
    box(ctx, "#1d1a24", 0, 0, width, height);
    if (background) cover(ctx, background, 0, 0, width, height);
    ctx.save();
    ctx.translate(-48, 24);
    drawZzzCardPlayer(ctx, role, snapshot.region, player, 1024);
    ctx.restore();
    fillRound(ctx, "#0009", 24, start, 952, panelEnd - start, 24);
    ctx.beginPath();
    ctx.roundRect(28.5, start + 4.5, 943, panelEnd - start - 9, 19.5);
    ctx.lineWidth = 9;
    ctx.strokeStyle = "#444";
    ctx.stroke();
    label(ctx, $t("exploration-card.text_8f85779c47"), side + 2, 244.8, 36, { color: "#383434" });
    label(ctx, $t("exploration-card.text_8f85779c47"), side, 241.8, 36, { color: "#e6e6e6" });
    if (snapshot.pageCount > 1) label(ctx, `${snapshot.page} / ${snapshot.pageCount}`, 943, 241.8, 23,
      { align: "right", color: "#aaa" });
    box(ctx, "#444", side, 277.8, areaWidth, 2);
    let y = contentY;
    for (const layout of layouts) {
      const { area, rows, heights } = layout;
      fillRound(ctx, "#fff3", side, y, areaWidth, layout.height, 12);
      fillRound(ctx, "#ffffff0d", side, y, areaWidth, 64.8, 12);
      label(ctx, areaName(area), 76.2, y + 32.4, 26.4, { color: "#e6e6e6", maxWidth: 700 });
      label(ctx, percent(area.progress), 923.8, y + 32.4, 26.4, { align: "right", color: orange });
      let top = y + 88.8;
      for (const [row, maps] of rows.entries()) {
        const rowHeight = heights[row]!;
        for (const [column, map] of maps.entries()) {
          drawMap(ctx, map, icons, side + column * (mapWidth + mapGap), top, rowHeight);
        }
        top += rowHeight + mapGap;
      }
      y += layout.height + 36;
    }
    if (follow) label(ctx, follow, side, panelEnd - 45, 21.6, { color: orange, maxWidth: 750 });
    label(ctx, zzzCardFooter, width / 2, height - 45, 16.8, { align: "center", color: "#fff" });
  }, 4, options.inlineImageByteLimit, { allowHalfScale: true });
}

function drawMap(ctx: CanvasRenderingContext2D, map: ZzzExplorationSnapshot["areas"][number]["maps"][number],
  icons: ReadonlyMap<string, Image | undefined>, x: number, top: number, height: number) {
  fillRound(ctx, "#ffffff0d", x, top, mapWidth, height, 12);
  const mapIcon = map.icon && icons.get(map.icon);
  if (mapIcon) contain(ctx, mapIcon, x + 12, top + 12, 96, 96);
  else if (map.name) label(ctx, map.name, x + 60, top + 60, 14, { color: "#ddd", align: "center", maxWidth: 93 });
  label(ctx, percent(map.progress), x + 60, top + 131.2, 24, { align: "center", color: orange, maxWidth: 96 });
  for (const [i, item] of map.collections.entries()) {
    const line = top + 12 + i * 36;
    fillRound(ctx, "#0005", x + 120, line, mapWidth - 132, 28.8, 2.4);
    const icon = item.icon && icons.get(item.icon);
    if (icon) contain(ctx, icon, x + 122.4, line + 2.4, 24, 24);
    else if (item.name) label(ctx, item.name, x + 122.4, line + 14.4, 11, { color: "#ddd", maxWidth: 24 });
    label(ctx, `${item.current ?? "—"}/${item.maximum ?? "—"}`, x + 148.8, line + 14.4, 18,
      { color: "#e6e6e6", maxWidth: mapWidth - 162, ellipsis: false });
  }
}
