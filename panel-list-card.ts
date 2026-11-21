import type { GameRole } from "@lotus-yunzai/account";
import type { ZzzPanelAvatar } from "@lotus-yunzai/hoyo-client";
import { renderPng } from "@lotus-yunzai/skia";
import type { CanvasRenderingContext2D as Context, Image } from "skia-canvas";
import { artwork, box, cover, drawZzzCardPlayer, label, loadZzzCardPlayer, openZzzCardTheme, zzzCardFooter, type ZzzCardOptions } from "./card-theme.ts";
import { contain, fillRound } from "./challenge-card.ts";
import type { ZzzAtlasPortraitReader } from "./panel-original.ts";
import { readPanelJson } from "./panel-storage.ts";
import { fetchZzzOfficialArtwork } from "./tuning-artwork.ts";

const width = 840;
const rowHeight = 133.17;
const rankColors = ["#757575", "#3a742b", "#3d84d6", "#df7676", "#3336a1", "#667f13", "#da3020"];
type Local = Awaited<ReturnType<typeof openZzzCardTheme>>;
type ListOptions = ZzzCardOptions & {
  readonly atlasPortrait?: ZzzAtlasPortraitReader;
  readonly updatedIds?: ReadonlySet<number>;
  readonly showcase?: boolean;
};

function circle(context: Context, color: string, x: number, y: number, r: number) {
  context.beginPath();
  context.arc(x, y, r, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
}

export async function loadPanelPortraits(rows: readonly ZzzPanelAvatar[], local: Local, options: ListOptions) {
  const variants = options.legacyResources
    ? await readPanelJson(options.legacyResources, "map/PartnerId2Data.json", 8 * 1024 * 1024).catch(() => undefined)
    : undefined;
  const map = variants && typeof variants === "object" && !Array.isArray(variants)
    ? variants as Record<string, { sprite_id?: unknown } | undefined> : {};
  const portraits: (Image | undefined)[] = [];
  for (let start = 0; start < rows.length && !options.signal?.aborted; start += 8) {
    portraits.push(...await Promise.all(rows.slice(start, start + 8).map(async row => {
      const sprite = map[row.id]?.sprite_id;
      if (typeof sprite === "string" && /^[A-Za-z0-9_]{1,20}$/u.test(sprite)) {
        const legacy = await local(`images/hakush/square_avatar/IconRoleCrop${sprite}.webp`);
        if (legacy) return legacy;
      }
      const cached = await local(`images/square_avatar/role_square_avatar_${row.id}.png`);
      if (cached) return cached;
      const icon = row.role_square_url ?? row.group_icon_path;
      const official = icon ? await artwork(fetchZzzOfficialArtwork(icon, options.signal)) : undefined;
      return official ?? (await options.atlasPortrait?.(row.id, true))?.image;
    })));
  }
  return portraits;
}

// ZZZure/ZZZ-Plugin 2057599 resources/panel/{list,refresh}.html and refresh.css.
export async function renderZzzPanelList(rows: readonly ZzzPanelAvatar[], role: GameRole, options: ListOptions = {}) {
  const local = await openZzzCardTheme(options);
  const [background, title, frame, ribbon, s, a, b, player, portraits] = await Promise.all([
    local("panel/images/bg1.jpg"), local("panel/images/refresh_title.png"), local("panel/images/avatar_box.png"),
    local("panel/images/CurseBG04.png"), local("common/images/RANK_S.png"), local("common/images/RANK_A.png"),
    local("common/images/RANK_B.png"), loadZzzCardPlayer(local, options, role.avatar), loadPanelPortraits(rows, local, options),
  ]);
  options.signal?.throwIfAborted();
  const ranks = { S: s, A: a, B: b };
  const listHeight = Math.max(72, Math.ceil(rows.length / 5) * rowHeight + 25.6);
  const height = Math.ceil(129.33 + listHeight + 91.6);
  return renderPng(width * 4, height * 4, (context) => {
    context.scale(4, 4);
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#150937");
    gradient.addColorStop(1, "#4a1049");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    if (background) cover(context, background, 0, 0, width, height);
    box(context, "#0006", 0, 0, width, 112.53);
    context.save();
    context.scale(0.7, 0.7);
    drawZzzCardPlayer(context, role, role.regionName || role.region, player);
    context.restore();

    const count = options.showcase ? `公开展柜已保存 ${rows.length} 个角色` :
      options.updatedIds ? `已为您更新 ${options.updatedIds.size} 个角色` : `共计 ${rows.length} 个角色`;
    const countWidth = (options.showcase ? 306 : options.updatedIds ? 251.14 : 180.64) +
      (String(options.updatedIds?.size ?? rows.length).length - 1) * 14;
    const countLeft = 733.5 - countWidth;
    fillRound(context, "#101315", countLeft, 33.2, countWidth, 46.1, 13, "#302c48");
    context.beginPath();
    context.moveTo(732, 45);
    context.lineTo(742, 56.25);
    context.lineTo(732, 67.5);
    context.closePath();
    context.fillStyle = "#101315";
    context.fill();
    label(context, count, countLeft + countWidth / 2, 56.25, 23.5, { align: "center", weight: 700 });
    if (title) contain(context, title, 747.6, 26.86, 58.8, 58.8);
    else {
      circle(context, "#29468a", 777, 56, 27);
      label(context, "面板", 777, 56, 17, { align: "center" });
    }

    fillRound(context, "#0008", 37, 130.4, 766, listHeight - 2, 12, "#574f66");
    if (!rows.length) label(context, "暂无数据，请先刷新面板", width / 2, 161, 19, { align: "center" });
    rows.forEach((row, index) => {
      const x = 125.9 + (index % 5) * 147.03;
      const y = 145.72 + Math.floor(index / 5) * rowHeight;
      if (frame) context.drawImage(frame, x - 42, y, 84, 90);
      else circle(context, "#423b43", x, y + 42, 40);
      const portrait = portraits[index];
      context.save();
      context.beginPath();
      context.arc(x, y + 41.4, 35.4, 0, Math.PI * 2);
      context.clip();
      if (portrait) cover(context, portrait, x - 35.4, y + 6, 70.8, 70.8);
      else box(context, "#282032", x - 35.4, y + 6, 70.8, 70.8);
      context.restore();
      if (options.updatedIds?.has(row.id)) circle(context, "#33eb00", x + 31.2, y + 15.6, 6);
      circle(context, rankColors[row.rank]!, x, y + 80.4, 12);
      label(context, String(row.rank), x, y + 80.4, 16.8, { align: "center" });
      if (ribbon) context.drawImage(ribbon, x - 64.8, y + 94.8, 131.6, 28.8);
      else fillRound(context, "#302b32", x - 64.8, y + 94.8, 131.6, 28.8, 9);
      label(context, row.name_mi18n, x - 4.2, y + 109.2, 16.8, { align: "center", maxWidth: 88 });
      circle(context, "#110f12", x + 51, y + 109.2, 11.8);
      const rare = ranks[row.rarity];
      if (rare) contain(context, rare, x + 42.5, y + 100.7, 17, 17);
      else label(context, row.rarity, x + 51, y + 109.2, 13, { align: "center", color: "#efd368" });
    });
    label(context, zzzCardFooter, width / 2, height - 42, 17, { color: "#a09ca3", align: "center" });
  }, "gpu");
}
