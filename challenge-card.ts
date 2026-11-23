import type { ZzzShiyuPortrait } from "@lotus-yunzai/hoyo-client";
import { nativeImageRasterScale, renderPng } from "@lotus-yunzai/skia";
import type { CanvasRenderingContext2D as Context, Image } from "skia-canvas";
import { cover, label, type openZzzCardTheme } from "./card-theme.ts";

export interface ZzzChallengeArt {
  readonly local: ReadonlyMap<string, Image | undefined>;
  readonly portraits: ReadonlyMap<ZzzShiyuPortrait, Image | undefined>;
}

export function fillRound(context: Context, color: string, x: number, y: number, w: number, h: number, radius: number, border?: string) {
  context.beginPath();
  context.roundRect(x, y, w, h, radius);
  context.fillStyle = color;
  context.fill();
  if (border) {
    context.lineWidth = 3;
    context.strokeStyle = border;
    context.stroke();
  }
}

export function contain(context: Context, image: Image, x: number, y: number, w: number, h: number) {
  const scale = Math.min(w / image.width, h / image.height);
  const imageWidth = image.width * scale;
  const imageHeight = image.height * scale;
  context.drawImage(image, x + (w - imageWidth) / 2, y + (h - imageHeight) / 2, imageWidth, imageHeight);
}

export function frame(context: Context, texture: Image | undefined, x: number, y: number, w: number, h: number) {
  if (!texture || texture.width < 381 || texture.height < 271) {
    fillRound(context, "#242326", x + 12, y + 4, w - 24, h - 10, 12, "#333");
    return;
  }
  const sourceX = [0, 280, texture.width - 100, texture.width];
  const sourceY = [0, 200, texture.height - 70, texture.height];
  const destX = [x, x + 67.2, x + w - 24, x + w];
  const destY = [y, y + 48, y + h - 16.8, y + h];
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      const sx = sourceX[column]!, sy = sourceY[row]!, dx = destX[column]!, dy = destY[row]!;
      context.drawImage(texture, sx, sy, sourceX[column + 1]! - sx, sourceY[row + 1]! - sy,
        dx, dy, destX[column + 1]! - dx, destY[row + 1]! - dy);
    }
  }
}

export function rankBand(points: number) {
  if (points < 100) return 1;
  if (points < 500) return 2;
  if (points < 1_000) return 3;
  if (points < 5_000) return 4;
  return 5;
}

export function drawPortrait(context: Context, art: ZzzChallengeArt, entry: ZzzShiyuPortrait | undefined, x: number, y: number, size: number, buddy = false) {
  if (!entry) return;
  const image = art.portraits.get(entry);
  fillRound(context, "#151517", x, y, size, size, 11, "#343534");
  context.save();
  context.beginPath();
  context.roundRect(x + 3, y + 3, size - 6, size - 6, 9);
  context.clip();
  if (image) {
    if (buddy) cover(context, image, x - size * 0.32, y - size * 0.2, size * 2.1, size * 2);
    else {
      const scale = Math.max(size / image.width, size / image.height);
      const scaledWidth = image.width * scale;
      context.drawImage(image, x - (scaledWidth - size) / 2, y, scaledWidth, image.height * scale);
    }
  } else if (entry.name) {
    label(context, entry.name, x + size / 2, y + size / 2, 15, { color: "#ada9af", align: "center", maxWidth: size - 10 });
  }
  if (entry.rarity) {
    const badge = art.local.get(`common/images/RANK_${entry.rarity}.png`);
    fillRound(context, "#09090b", x, y, 27, 27, 5);
    if (badge) contain(context, badge, x + 3, y + 3, 22, 22);
    else label(context, entry.rarity, x + 14, y + 14, 14, { align: "center", weight: 700 });
  }
  if (entry.rank) {
    fillRound(context, "#0008", x + size - 24, y, 24, 25, 5);
    label(context, String(entry.rank), x + size - 13, y + 13, 16, { weight: 800, align: "center" });
  }
  context.restore();
}


export async function loadChallengePortrait(entry: ZzzShiyuPortrait | undefined, buddy: boolean,
  local: Awaited<ReturnType<typeof openZzzCardTheme>>, official: (url: string) => Promise<Image | undefined>,
  portraits: Map<ZzzShiyuPortrait, Image | undefined>) {
  if (!entry) return;
  const img = entry.icon && await official(entry.icon);
  if (img) {
    portraits.set(entry, img);
    return;
  }
  if (!entry.itemId || !/^\d{1,6}$/u.test(entry.itemId)) return;
  const path = buddy ? `images/bangboo_square_avatar/bangboo_rectangle_avatar_${entry.itemId}.png`
    : `images/square_avatar/role_square_avatar_${entry.itemId}.png`;
  portraits.set(entry, await local(path));
}


export class ZzzInlineImageLimitError extends Error {
  constructor() {
    super("图片超过当前会话大小上限，已改为文字。");
  }
}

export async function renderZzzBattlePng(width: number, height: number, draw: (context: Context) => void,
  scale: 2 | 4, inlineImageByteLimit?: number, { allowHalfScale = false } = {}) {
  const standard = nativeImageRasterScale() === 4;
  function render(density: 2 | 4) {
    return renderPng(width * density, height * density, context => {
      context.scale(density, density);
      draw(context);
    }, "gpu", { allowHalfScale: standard && density === 4 && allowHalfScale });
  }

  const image = await render(standard ? scale : 4);
  if (inlineImageByteLimit === undefined || image.png.byteLength <= inlineImageByteLimit) return image;
  if (standard && scale === 4 && image.reducedScaleReason === undefined) {
    const reduced = await render(2);
    if (reduced.png.byteLength <= inlineImageByteLimit) return reduced;
  }
  throw new ZzzInlineImageLimitError();
}
