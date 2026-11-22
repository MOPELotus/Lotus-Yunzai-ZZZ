import { renderPng } from "@lotus-yunzai/skia";
import { openProfileCardTheme } from "@lotus-yunzai/skia/profile";
import { Canvas, type CanvasRenderingContext2D as Context } from "skia-canvas";
import { artwork, cover, openZzzCardTheme, zzzCardFooter, type ZzzCardOptions } from "./card-theme.ts";
import { contain, fillRound } from "./challenge-card.ts";
import { cachedPanelWeaponImage, readPanelArtMap } from "./panel-artwork.ts";
import { panelObject } from "./panel-detail.ts";
import { loadPanelPortraits } from "./panel-list-card.ts";
import type { ZzzPanelRankRow } from "./panel-rank-model.ts";
import { fetchZzzOfficialArtwork } from "./tuning-artwork.ts";

const width = 820;
const gold = "#d3bc8e";
const skillNames = ["普攻", "闪避", "支援", "特殊", "连携", "核心"];

function text(ctx: Context, value: string, x: number, y: number, max: number, px: number, font: string,
  color = "#fff", align: CanvasTextAlign = "left") {
  ctx.textBaseline = "top";
  ctx.textAlign = align;
  ctx.font = `${px}px ${font}`;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y, max);
}

function nameLines(ctx: Context, name: string, font: string) {
  ctx.font = `18px ${font}`;
  const lines: string[] = [];
  let line = "";
  for (const char of name) {
    if (line && ctx.measureText(line + char).width > 110) {
      lines.push(line);
      line = "";
    }
    line += char;
  }
  lines.push(line);
  return lines;
}

// Lotus e28c6df source-cards.js zzz-rank uses the rank-profile-list strips over the original miao hydro background.
export async function renderZzzPanelRank(title: string, rows: readonly ZzzPanelRankRow[],
  options: ZzzCardOptions & { readonly offset: number; readonly weighted: boolean; readonly overview?: string; readonly next?: string }) {
  const [theme, local, weapons] = await Promise.all([
    openProfileCardTheme(Bun.env.LOTUS_PASSPORT_QR_RESOURCES?.trim() || undefined),
    openZzzCardTheme(options), readPanelArtMap(options.legacyResources, "WeaponId2Data"),
  ]);
  const [portraits, weaponImages] = await Promise.all([
    loadPanelPortraits(rows.map(row => row.avatar), local, options),
    Promise.all(rows.map(async ({ avatar, weapon }) => {
      if (!weapon) return;
      const cached = await cachedPanelWeaponImage(local, weapons[weapon.id]);
      const icon = panelObject(avatar.weapon).icon;
      return cached ?? (typeof icon === "string" ? await artwork(fetchZzzOfficialArtwork(icon, options.signal)) : undefined);
    })),
  ]);
  options.signal?.throwIfAborted();
  const measure = new Canvas(1, 1).getContext("2d");
  const strips = rows.map(row => {
    const lines = nameLines(measure, row.avatar.name_mi18n, theme.text);
    return { lines, height: Math.max(74, 28 + lines.length * 24) };
  });
  const rowsY = options.overview ? 106 : 86;
  const height = Math.max(240, rowsY + strips.reduce((sum, strip) => sum + strip.height + 10, 0) + 50 +
    (options.next ? 21 : 0));
  return renderPng(width * 4, height * 4, ctx => {
    ctx.scale(4, 4);
    ctx.drawImage(theme.background, 0, 0, width, height);
    ctx.save();
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    text(ctx, title, 35, 30, width - 70, 36, theme.title);
    if (options.overview) text(ctx, options.overview, 35, 76, width - 70, 15, theme.text, "#f4e3c6");
    ctx.restore();

    let y = rowsY;
    rows.forEach((row, index) => {
      const x = 10;
      const { lines, height: h } = strips[index]!;
      fillRound(ctx, "#0008", x, y, width - 25, h, 10);
      text(ctx, String(options.offset + index + 1), x + 19, y + 24, 32, 18, theme.text, gold, "center");
      const portrait = portraits[index];
      if (portrait) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + 68, y + 35, 25, 0, 2 * Math.PI);
        ctx.clip();
        cover(ctx, portrait, x + 43, y + 10, 50, 50);
        ctx.restore();
      }
      lines.forEach((line, i) => text(ctx, line, x + 103, y + 8 + i * 24, 110, 18, theme.text, gold));
      text(ctx, `${row.uid} · ${row.avatar.rank}影`, x + 103, y + 10 + lines.length * 24, 119, row.uid.length === 10 ? 11 : 12, theme.text);
      skillNames.forEach((label, i) => {
        const xx = x + 224 + i * 37;
        text(ctx, label, xx + 18.5, y + 10, 37, 11, theme.text, "#fff", "center");
        fillRound(ctx, "#fff", xx + 5, y + 33, 27, 21, 5);
        text(ctx, String(row.skills[i] ?? "未记录"), xx + 18.5, y + 37, 27, 12, theme.text, "#000", "center");
      });
      const weaponX = x + 458, scoreX = weaponX + 162;
      for (const edge of [weaponX, scoreX]) {
        ctx.fillStyle = "#fffb";
        ctx.fillRect(edge - 6, y + 8, 1, h - 16);
      }
      const weaponImage = weaponImages[index];
      if (weaponImage) contain(ctx, weaponImage, weaponX, y + 16, 36, 36);
      text(ctx, row.weapon?.name ?? "音擎未装配", weaponX + 40, y + 10, 108, 13, theme.text, gold);
      if (row.weapon) text(ctx, `Lv.${row.weapon.level ?? "—"} · ${row.weapon.star ?? "—"}星`,
        weaponX + 40, y + 47, 108, 12, theme.text);
      text(ctx, options.weighted ? "加权分" : "面板分", scoreX, y + 12, 165, 12, theme.text, "#aaa");
      text(ctx, (options.weighted ? row.weighted : row.drive).toFixed(2), scoreX, y + 34, 165, 18, theme.number);
      y += h + 10;
    });
    if (options.next) {
      text(ctx, `下一页 ${options.next}`, width / 2, y + 3, width - 40, 15, theme.text, gold, "center");
      y += 21;
    }
    text(ctx, zzzCardFooter, width / 2, y + 15, width - 30, 12, theme.text, "#fff", "center");
  }, "gpu");
}
