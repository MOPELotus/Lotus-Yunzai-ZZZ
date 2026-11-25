import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAtlasRuntimeCatalog } from "@lotus-yunzai/atlas/catalog";
import { openProfileCardTheme } from "@lotus-yunzai/skia/profile";
import { Canvas, loadImage, type CanvasRenderingContext2D as Context } from "skia-canvas";
import { artwork, cover, openZzzCardTheme, zzzCardFooter, type ZzzCardOptions } from "./card-theme.ts";
import { contain, fillRound, renderZzzBattlePng } from "./challenge-card.ts";
import { cachedPanelWeaponImage, readPanelArtMap } from "./panel-artwork.ts";
import { panelObject } from "./panel-detail.ts";
import { loadPanelPortraits } from "./panel-list-card.ts";
import { createZzzAtlasPortraitReader } from "./panel-original.ts";
import type { ZzzPanelRankRow } from "./panel-rank-model.ts";
import { createZzzRecordPortraits, fetchZzzOfficialArtwork } from "./tuning-artwork.ts";

const width = 820;
const gold = "#d3bc8e";
const skillNames = [$t("panel-rank-card.text_8b79df27ba"), $t("panel-rank-card.text_3b89502eed"), $t("panel-rank-card.text_9aa79fc650"), $t("panel-rank-card.text_c32b61e9bd"), $t("panel-rank-card.text_f269f5e2c8"), $t("panel-rank-card.text_a8a88ddbea")];
const atlasRoot = fileURLToPath(new URL("../../data/atlas/", import.meta.url));
const fallbackFont = '"Noto Sans CJK SC", sans-serif';

async function readRankTheme() {
  const profileDirectory = Bun.env.LOTUS_PASSPORT_QR_RESOURCES?.trim();
  const original = await openProfileCardTheme(profileDirectory).catch(() => undefined);
  if (original) return original;
  const atlasDirectory = Bun.env.LOTUS_ATLAS_THEME_DIR?.trim() || join(atlasRoot, "theme");
  const background = await loadImage(join(atlasDirectory, "bg/bg-hydro.webp")).catch(() => undefined);
  return { background, text: fallbackFont, number: fallbackFont, title: fallbackFont };
}

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
  const atlas = createAtlasRuntimeCatalog(atlasRoot, Bun.env.LOTUS_ATLAS_DATA_DIR);
  const atlasPortrait = createZzzAtlasPortraitReader(atlas);
  const atlasWeapons = createZzzRecordPortraits("equipment", options.signal);
  const [theme, local, weapons] = await Promise.all([
    readRankTheme(),
    openZzzCardTheme(options), readPanelArtMap(options.legacyResources, "WeaponId2Data"),
  ]);
  const [portraits, weaponImages] = await Promise.all([
    loadPanelPortraits(rows.map(row => row.avatar), local, { ...options, atlasPortrait }),
    Promise.all(rows.map(async ({ avatar, weapon }) => {
      if (!weapon) return;
      const cached = await cachedPanelWeaponImage(local, weapons[weapon.id]);
      const icon = panelObject(avatar.weapon).icon;
      const official = !cached && typeof icon === "string" ? await artwork(fetchZzzOfficialArtwork(icon, options.signal)) : undefined;
      if (cached || official) return cached ?? official;
      const key = atlasWeapons.resolveIcon({ itemId: String(weapon.id), name: weapon.name });
      return key ? await artwork(atlasWeapons.loadArtwork(key)) : undefined;
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
  return renderZzzBattlePng(width, height, ctx => {
    if (theme.background) ctx.drawImage(theme.background, 0, 0, width, height);
    else {
      ctx.fillStyle = "#243344";
      ctx.fillRect(0, 0, width, height);
    }
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
      text(ctx, $t("panel-rank-card.text_c091ad7c71", { "uid": row.uid, "rank": row.avatar.rank }), x + 103, y + 10 + lines.length * 24, 119, row.uid.length === 10 ? 11 : 12, theme.text);
      skillNames.forEach((label, i) => {
        const xx = x + 224 + i * 37;
        text(ctx, label, xx + 18.5, y + 10, 37, 11, theme.text, "#fff", "center");
        fillRound(ctx, "#fff", xx + 5, y + 33, 27, 21, 5);
        text(ctx, String(row.skills[i] ?? $t("panel-rank-card.text_7450cc5b16")), xx + 18.5, y + 37, 27, 12, theme.text, "#000", "center");
      });
      const weaponX = x + 458, scoreX = weaponX + 162;
      for (const edge of [weaponX, scoreX]) {
        ctx.fillStyle = "#fffb";
        ctx.fillRect(edge - 6, y + 8, 1, h - 16);
      }
      const weaponImage = weaponImages[index];
      if (weaponImage) contain(ctx, weaponImage, weaponX, y + 16, 36, 36);
      text(ctx, row.weapon?.name ?? $t("panel-rank-card.text_1f8a33dc16"), weaponX + 40, y + 10, 108, 13, theme.text, gold);
      if (row.weapon) text(ctx, $t("panel-rank-card.text_626d751f37", { "value1": row.weapon.level ?? "—", "value2": row.weapon.star ?? "—" }),
        weaponX + 40, y + 47, 108, 12, theme.text);
      text(ctx, options.weighted ? $t("panel-rank-card.text_e6b3a9f5d6") : $t("panel-rank-card.text_9700898065"), scoreX, y + 12, 165, 12, theme.text, "#aaa");
      text(ctx, (options.weighted ? row.weighted : row.drive).toFixed(2), scoreX, y + 34, 165, 18, theme.number);
      y += h + 10;
    });
    if (options.next) {
      text(ctx, $t("panel-rank-card.text_2cb43eac24", { "next": options.next }), width / 2, y + 3, width - 40, 15, theme.text, gold, "center");
      y += 21;
    }
    text(ctx, zzzCardFooter, width / 2, y + 15, width - 30, 12, theme.text, "#fff", "center");
  }, 4, options.inlineImageByteLimit, { allowHalfScale: true });
}
