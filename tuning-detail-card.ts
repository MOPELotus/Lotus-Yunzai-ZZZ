import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { renderPng } from "@lotus-yunzai/skia";
import { FontLibrary, loadImage, type CanvasRenderingContext2D as Context, type Image } from "skia-canvas";
import type { ZzzTuningDetailModel, ZzzTuningDetailPool } from "./tuning-detail.ts";

interface TuningDetailCardOptions {
  readonly mode?: "auto" | "gpu" | "cpu";
  readonly scale?: number;
  readonly themeDirectory?: string;
  readonly loadArtwork?: (key: string) => Promise<Buffer | Uint8Array | undefined>;
  readonly level?: number;
  readonly regionName?: string;
}

// Measurements from ZZZ-Plugin's gachalog and shared player-info layouts at a 24 px base font.
const width = 840;
const margin = 24;
const header = 196.796875;
const titleHeight = 186.359375;
const rowHeight = 133.0625;
const footHeight = 55.59375;
const tileWidth = 159.6;
const tileHeight = 109.0625;
const maxImageBytes = 8 * 1024 * 1024;
const font = '"LotusZzzHongmeng", sans-serif';
const white = "#fff";
const muted = "#e4e4e4";
const defaultTheme = fileURLToPath(new URL("../../data/zzz/gacha-theme", import.meta.url));

async function themePath(root: string, path: string) {
  const actual = await realpath(join(root, path)).catch(() => undefined);
  return actual?.startsWith(root + sep) ? actual : undefined;
}

async function themeImage(root: string, path: string): Promise<Image | undefined> {
  const actual = await themePath(root, path);
  if (!actual) return;
  try {
    const file = await open(actual, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await file.stat();
      if (stat.isFile() && stat.size <= maxImageBytes) return await loadImage(await file.readFile());
    } finally {
      await file.close();
    }
  } catch {
    return undefined;
  }
}

async function loadTheme(root: string) {
  const originalFont = await themePath(root, "common/fonts/inpinhongmengti.ttf");
  if (!originalFont) throw new Error("绝区零调频的原版字体不可用。");
  try {
    FontLibrary.use("LotusZzzHongmeng", [originalFont]);
  } catch {
    throw new Error("绝区零调频的原版字体不可用。");
  }
  const [background, suit, uid, rank, up, blue, orange, red] = await Promise.all([
    "common/images/bg.jpg", "common/images/SuitBg.png", "common/images/UIDBg.png", "common/images/RANK_S.png",
    "gachalog/images/IconTabUP.png", "gachalog/images/bg1.png", "gachalog/images/bg2.png", "gachalog/images/bg3.png",
  ].map((path) => themeImage(root, path)));
  if (!background || !suit || !uid || !rank || !up || !blue || !orange || !red) {
    throw new Error("绝区零调频的原版图片不可用。");
  }
  const emojis = await Promise.all([4, 1, 16, 12, 6].map(async (number) =>
    [number, await themeImage(root, `gachalog/images/emoji/${number}.png`)] as const));
  if (emojis.some(([, image]) => !image)) throw new Error("绝区零调频的原版评级素材不可用。");
  return { background, suit, uid, rank, up, titles: [blue, orange, red], emojis: new Map(emojis) };
}

const themes = new Map<string, ReturnType<typeof loadTheme>>();

function themeAt(root: string) {
  let theme = themes.get(root);
  if (!theme) {
    theme = loadTheme(root).catch((error: unknown) => {
      themes.delete(root);
      throw error;
    });
    themes.set(root, theme);
  }
  return theme;
}

type Theme = Awaited<ReturnType<typeof loadTheme>>;

async function loadArt(model: ZzzTuningDetailModel, loader: TuningDetailCardOptions["loadArtwork"]) {
  const images = new Map<string, Image>();
  if (!loader) return images;
  const keys = [...new Set([model.avatar, ...model.data.flatMap(({ list }) => list.map(({ square_icon }) => square_icon))]
    .filter((key): key is string => !!key))];

  for (let index = 0; index < keys.length; index += 8) {
    await Promise.all(keys.slice(index, index + 8).map(async (key) => {
      try {
        const bytes = await loader(key);
        if (bytes?.byteLength && bytes.byteLength <= maxImageBytes) {
          images.set(key, await loadImage(Buffer.from(bytes)));
        }
      } catch {
        // Account or catalogue art may be unavailable while authenticated tuning stats remain usable.
      }
    }));
  }
  return images;
}

function shape(ctx: Context, x: number, y: number, w: number, h: number, corners: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, corners);
}

function rect(ctx: Context, x: number, y: number, w: number, h: number, corners: number, fill: string) {
  shape(ctx, x, y, w, h, corners);
  ctx.fillStyle = fill;
  ctx.fill();
}

function text(ctx: Context, value: string | number, x: number, y: number, size: number, fill = white,
  align: CanvasTextAlign = "left", maxWidth?: number, weight = false) {
  ctx.font = `${weight ? "700 " : ""}${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = fill;
  ctx.save();
  ctx.translate(x, y);
  if (maxWidth !== undefined) {
    const measured = ctx.measureText(String(value)).width;
    if (measured > maxWidth) ctx.scale(maxWidth / measured, 1);
  }
  if (weight) {
    ctx.strokeStyle = fill;
    ctx.lineWidth = size * 0.018;
    ctx.strokeText(String(value), 0, 0);
  }
  ctx.fillText(String(value), 0, 0);
  ctx.restore();
}

function fitImage(ctx: Context, image: Image, x: number, y: number, w: number, h: number, cover = false) {
  const zoom = (cover ? Math.max : Math.min)(w / image.width, h / image.height);
  const dw = image.width * zoom, dh = image.height * zoom;
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function titleTexture(ctx: Context, image: Image, top: number) {
  // CSS border-image slice 37 27 37 131 and destination width 24 24 24 108.
  const sourceX = [0, 131, image.width - 27, image.width];
  const sourceY = [0, 37, image.height - 37, image.height];
  const destX = [margin, margin + 108, width - margin - 24, width - margin];
  const destY = [top, top + 24, top + titleHeight - 24, top + titleHeight];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const sx = sourceX[col]!, sy = sourceY[row]!, x = destX[col]!, y = destY[row]!;
      ctx.drawImage(image, sx, sy, sourceX[col + 1]! - sx, sourceY[row + 1]! - sy,
        x, y, destX[col + 1]! - x, destY[row + 1]! - y);
    }
  }
}

function uidTexture(ctx: Context, image: Image, x: number, y: number, w: number, h: number) {
  const edge = 34.56;
  const inner = image.width - 200;
  ctx.drawImage(image, 0, 0, 100, image.height, x, y, edge, h);
  ctx.drawImage(image, 100, 0, inner, image.height, x + edge, y, w - 2 * edge, h);
  ctx.drawImage(image, image.width - 100, 0, 100, image.height, x + w - edge, y, edge, h);
}

function clippedBadge(ctx: Context, x: number, y: number, width: number, textValue: string, fill: string) {
  const corners = 4.3;
  const h = 35;
  ctx.beginPath();
  ctx.moveTo(x + corners, y);
  ctx.lineTo(x + width - corners, y);
  ctx.lineTo(x + width, y + corners);
  ctx.lineTo(x + width, y + h - corners);
  ctx.lineTo(x + width - corners, y + h);
  ctx.lineTo(x + corners, y + h);
  ctx.lineTo(x, y + h - corners);
  ctx.lineTo(x, y + corners);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  text(ctx, textValue, x + width / 2, y + 18, 21.6, "#2b2628", "center", width - 14);
}

function drawPlayer(ctx: Context, model: ZzzTuningDetailModel, theme: Theme, images: ReadonlyMap<string, Image>,
  { level, regionName }: TuningDetailCardOptions) {
  ctx.drawImage(theme.suit, 62.4, 31.2, 115.2, 115.2);
  ctx.save();
  shape(ctx, 72, 40.8, 96, 96, 48);
  ctx.clip();
  const avatar = model.avatar && images.get(model.avatar);
  if (avatar) fitImage(ctx, avatar, 72, 40.8, 96, 96);
  else text(ctx, model.nickname.slice(0, 2) || "绳匠", 120, 88.8, 23, muted, "center", 78);
  ctx.restore();

  const tags = [
    ...(typeof level === "number" && Number.isSafeInteger(level) && level > 0 ? [[`Lv${level}`, "#f3cb45"]] : []),
    ...(regionName?.trim() ? [[regionName.trim(), "#51b1fd"]] : []),
  ] as const;
  ctx.font = `21.6px ${font}`;
  const boxes = tags.map(([name, fill]) => ({ name: name!, fill: fill!, width: Math.min(125, ctx.measureText(name!).width + 17.28) }));
  let x = 204;
  ctx.font = `700 28.8px ${font}`;
  const nameWidth = Math.min(ctx.measureText(model.nickname).width, 532 - boxes.reduce((sum, item) => sum + item.width + 12, 0));
  text(ctx, model.nickname, x, 65, 28.8, white, "left", nameWidth, true);
  x += nameWidth;
  for (const tag of boxes) {
    x += 12;
    clippedBadge(ctx, x, 48, tag.width, tag.name, tag.fill);
    x += tag.width;
  }

  const uid = `UID ${model.uid}`;
  ctx.font = `21.6px ${font}`;
  const w = ctx.measureText(uid).width + 69.12;
  uidTexture(ctx, theme.uid, 192, 91, w, 40.64);
  text(ctx, uid, 192 + w / 2, 112, 21.6, "rgba(255,255,255,.60)", "center");
}

function drawTitle(ctx: Context, pool: ZzzTuningDetailPool, top: number, background: Image, emblem: Image | undefined) {
  titleTexture(ctx, background, top);
  const x = 112.8;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.40)";
  ctx.shadowBlur = 1;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  text(ctx, pool.name, x, top + 36, 36);
  ctx.restore();
  ctx.font = `36px ${font}`;
  const statusX = x + ctx.measureText(pool.name).width + 2.4;
  const statusParts = pool.pityLabel ? [pool.pityLabel] : ["已", String(pool.lastFive), "抽未出S级"];
  ctx.font = `19.2px ${font}`;
  const lengths = statusParts.map((part) => ctx.measureText(part).width);
  const pillWidth = 23 + lengths.reduce((sum, part) => sum + part, 0);
  rect(ctx, statusX, top + 29, pillWidth, 27, 14, "rgba(0,0,0,.50)");
  let left = statusX + 9;
  for (const [index, part] of statusParts.entries()) {
    text(ctx, part, left, top + 42, 19.2, index === 1 ? "#80ed54" : muted);
    left += lengths[index]! + 1.92;
  }
  text(ctx, pool.timeRange, x, top + 73, 14.4, muted, "left", 510);

  const summary = [
    [pool.avgFive, "平均出金"], [pool.avgUp, pool.avgUpEstimated ? "平均UP（估算）" : "平均UP"],
    [pool.totalCount, "抽卡总数"],
    ...(pool.type === "GACHA_TYPE_PERMANENT" || pool.type === "GACHA_TYPE_BANGBOO" ? []
      : [[pool.noWai, pool.noWaiEstimated ? "不歪率（估算）" : "不歪率"]]),
  ] as const;
  rect(ctx, x + 24, top + 92, 360, 72.78125, 38, "rgba(0,0,0,.50)");
  const cell = 336 / summary.length;
  for (const [index, [value, label]] of summary.entries()) {
    const center = x + 36 + (index + 0.5) * cell;
    text(ctx, value, center, top + 118, 31.2, white, "center", cell - 6);
    text(ctx, label, center, top + 150, 19.2, muted, "center", cell - 6);
  }

  if (emblem) fitImage(ctx, emblem, 652.8, top + 17.2, 108, 108);
  text(ctx, pool.tag, 706.8, top + 155, 24, white, "center", 110);
}

function drawRecord(ctx: Context, row: ZzzTuningDetailPool["list"][number], theme: Theme,
  images: ReadonlyMap<string, Image>, x: number, y: number) {
  const innerX = x + 4.8, innerY = y + 4.8;
  const contentWidth = tileWidth - 9.6, contentHeight = tileHeight - 9.6;
  rect(ctx, x, y, tileWidth, tileHeight, 12, "#000");
  ctx.save();
  shape(ctx, innerX, innerY, contentWidth, contentHeight, 7.2);
  ctx.clip();
  ctx.fillStyle = "#e2e2e2";
  ctx.fillRect(innerX, innerY, contentWidth, contentHeight);
  const image = row.square_icon && images.get(row.square_icon);
  if (image) fitImage(ctx, image, innerX, innerY, contentWidth, contentHeight, true);
  else text(ctx, row.name, x + tileWidth / 2, y + 49, 18, "#656565", "center", contentWidth - 18);
  if (row.isUp) fitImage(ctx, theme.up, x + 9.6, y + 7.2, 40.8, 40.8);
  fitImage(ctx, theme.rank, x + tileWidth - 44.8, y + 8.8, 36, 36);

  const label = `${row.totalCount}抽`;
  ctx.font = `21.6px ${font}`;
  const countWidth = ctx.measureText(label).width + 14.4;
  rect(ctx, innerX - 12, y + tileHeight - 34.8, countWidth + 12, 38, 10.8, "rgba(0,0,0,.30)");
  text(ctx, label, innerX + countWidth / 2, y + tileHeight - 19.5, 21.6, row.color, "center", contentWidth - 10);
  ctx.restore();
}

function footer(ctx: Context, y: number) {
  const parts = [
    ["Created By ", "#797979", 16.8], ["ZZZ-Plugin", white, 16.8], ["2.5.4", white, 13.4],
    [" & Powered By ", "#797979", 16.8], ["ZZZure", white, 16.8],
  ] as const;
  const sizes = parts.map(([part, , size]) => {
    ctx.font = `${size}px ${font}`;
    return ctx.measureText(part).width;
  });
  let left = width / 2 - sizes.reduce((sum, right) => sum + right, 0) / 2;
  for (const [index, [part, color, size]] of parts.entries()) {
    text(ctx, part, left, y + (size < 15 ? 8 : 11), size, color);
    left += sizes[index]!;
  }
}

export async function renderZzzTuningDetail(
  model: ZzzTuningDetailModel,
  options: TuningDetailCardOptions = {},
) {
  const {
    mode = "auto", scale = 2,
    themeDirectory = Bun.env.LOTUS_ZZZ_GACHA_THEME_DIR?.trim() || defaultTheme,
    loadArtwork,
  } = options;
  if (!Number.isFinite(scale) || scale < 1 || scale > 4) throw new RangeError("调频统计缩放须在 1 至 4 之间。");
  const layouts = model.data.map(({ list }) => list.length ? Math.ceil(list.length / 4) * rowHeight + 36 : 140);
  const height = header + layouts.reduce((sum, value) => sum + titleHeight + value, 0) + footHeight;
  if (height > 24_000) throw new RangeError("绝区零调频统计超出可渲染高度。");
  const root = await realpath(themeDirectory).catch(() => undefined);
  if (!root) throw new Error("绝区零调频的原版主题目录不可用。");
  const theme = await themeAt(root);
  const images = await loadArt(model, loadArtwork);

  const zoom = Math.min(scale, 24_000 / height);
  return renderPng(Math.round(width * zoom), Math.round(height * zoom), (ctx) => {
    ctx.scale(zoom, zoom);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    fitImage(ctx, theme.background, 0, 0, width, height, true);
    drawPlayer(ctx, model, theme, images, options);

    let top = header;
    for (const [index, pool] of model.data.entries()) {
      drawTitle(ctx, pool, top, theme.titles[Math.min(2, Math.floor(index / 2))]!, theme.emojis.get(pool.emoji));
      const next = top + titleHeight;
      if (!pool.list.length) text(ctx, "暂无数据", width / 2, next + 40, 24, white, "center");
      for (const [item, row] of pool.list.entries()) {
        drawRecord(ctx, row, theme, images, 64.8 + item % 4 * 183.6, next + 12 + Math.floor(item / 4) * rowHeight);
      }
      top = next + layouts[index]!;
    }
    footer(ctx, top);
  }, mode);
}
