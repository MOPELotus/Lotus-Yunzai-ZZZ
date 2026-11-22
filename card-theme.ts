import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import type { GameRole } from "@lotus-yunzai/account";
import { FontLibrary, loadImage, type CanvasGradient, type CanvasRenderingContext2D as Context, type Image } from "skia-canvas";
import { fetchZzzOfficialArtwork, fetchZzzQqAvatar } from "./tuning-artwork.ts";

const font = '"LotusZzzRecordHongmeng", "Noto Sans CJK SC", sans-serif';
export const zzzCardFooter = "Lotus-Yunzai · ZZZ";
export const zzzScoreColors = { C: "#5ed559", B: "#5ebdf9", A: "#d256ff", S: "#ffdabe", SS: "#ffe174",
  SSS: "#ffa33b", ACE: "#ff5656", MAX: "#ff5656" } as const;

export interface ZzzCardOptions {
  readonly legacyResources?: string;
  readonly signal?: AbortSignal;
  readonly qq?: string;
  readonly rankVisibility?: boolean;
  readonly inlineImageByteLimit?: number;
}

async function localPath(root: string | undefined, path: string) {
  if (!root) return;
  const filePath = await realpath(join(root, path)).catch(() => undefined);
  return filePath?.startsWith(root + sep) ? filePath : undefined;
}

async function localArtwork(root: string | undefined, path: string): Promise<Buffer | undefined> {
  const filePath = await localPath(root, path);
  if (!filePath) return;
  const file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(() => undefined);
  if (!file) return;
  try {
    const info = await file.stat();
    if (info.isFile() && info.size <= 8 * 1024 * 1024) return await file.readFile();
  } finally {
    await file.close();
  }
}

export async function readZzzCardLocalArtwork(directory: string | undefined, path: string) {
  const root = directory ? await realpath(directory).catch(() => undefined) : undefined;
  return localArtwork(root, path);
}

export async function artwork(bytes: Promise<Buffer | undefined> | undefined) {
  try {
    const source = await bytes;
    if (source) return await loadImage(source);
  } catch {
    return;
  }
}

export function cover(context: Context, image: Image, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / image.width, h / image.height);
  const sourceW = w / scale;
  const sourceH = h / scale;
  context.drawImage(image, (image.width - sourceW) / 2, (image.height - sourceH) / 2, sourceW, sourceH, x, y, w, h);
}

export function box(context: Context, color: string, x: number, y: number, w: number, h: number) {
  context.fillStyle = color;
  context.fillRect(x, y, w, h);
}

export function drawTag(context: Context, color: string, x: number, y: number, w: number, h = 35, cut = 5) {
  context.beginPath();
  context.moveTo(x + cut, y);
  context.lineTo(x + w - cut, y);
  context.lineTo(x + w, y + cut);
  context.lineTo(x + w, y + h - cut);
  context.lineTo(x + w - cut, y + h);
  context.lineTo(x + cut, y + h);
  context.lineTo(x, y + h - cut);
  context.lineTo(x, y + cut);
  context.closePath();
  context.fillStyle = color;
  context.fill();
}

export function measureZzzCardLabel(context: Context, text: string, size: number, weight = 400) {
  context.font = `${weight} ${size}px ${font}`;
  return context.measureText(text).width;
}

export function label(context: Context, text: string, x: number, y: number, size: number, settings: {
  color?: string | CanvasGradient;
  weight?: number;
  align?: CanvasTextAlign;
  maxWidth?: number;
  ellipsis?: boolean;
} = {}) {
  const { color = "white", weight = 400, align = "left", maxWidth, ellipsis = true } = settings;
  context.textBaseline = "middle";
  context.textAlign = align;
  context.font = `${weight} ${size}px ${font}`;
  context.fillStyle = color;
  if (maxWidth !== undefined) {
    const width = context.measureText(text).width;
    if (!ellipsis && width > maxWidth) {
      context.save();
      context.translate(x, y);
      context.scale(maxWidth / width, 1);
      context.fillText(text, 0, 0);
      context.restore();
      return;
    }
    if (width > maxWidth) {
      const points = Array.from(text);
      while (points.length && context.measureText(points.join("") + "…").width > maxWidth) points.pop();
      text = points.join("") + "…";
    }
    context.fillText(text, x, y, maxWidth);
    return;
  }
  context.fillText(text, x, y);
}


export async function openZzzCardTheme(options: ZzzCardOptions) {
  const root = options.legacyResources ? await realpath(options.legacyResources).catch(() => undefined) : undefined;
  const originalFont = await localPath(root, "common/fonts/inpinhongmengti.ttf");
  if (originalFont) {
    try { FontLibrary.use("LotusZzzRecordHongmeng", [originalFont]); } catch { /* Use a system font if the old font cannot be loaded. */ }
  }
  return (path: string) => artwork(localArtwork(root, path));
}

export async function loadZzzCardPlayer(local: Awaited<ReturnType<typeof openZzzCardTheme>>, options: ZzzCardOptions, icon?: string) {
  const [frame, uidBar, accountAvatar, officialAvatar] = await Promise.all([
    local("common/images/SuitBg.png"), local("common/images/UIDBg.png"),
    options.qq ? artwork(fetchZzzQqAvatar(options.qq, options.signal)) : undefined,
    icon ? artwork(fetchZzzOfficialArtwork(icon, options.signal)) : undefined,
  ]);
  return { frame, uidBar, avatar: accountAvatar ?? officialAvatar };
}

export function drawZzzCardPlayer(context: Context, role: GameRole, region: string,
  { frame, uidBar, avatar }: Awaited<ReturnType<typeof loadZzzCardPlayer>>, rightEdge?: number) {
  if (frame) context.drawImage(frame, 62, 31, 116, 116);
  context.save();
  context.beginPath();
  context.arc(120, 88.8, 48, 0, Math.PI * 2);
  context.clip();
  box(context, "#292a35", 72, 40.8, 96, 96);
  if (avatar) cover(context, avatar, 72, 40.8, 96, 96);
  else label(context, "绳", 120, 88.8, 36, { weight: 800, align: "center" });
  context.restore();
  const nickname = role.nickname || "绳匠";
  const nicknameWidth = measureZzzCardLabel(context, nickname, 29, 700);
  const regionWidth = measureZzzCardLabel(context, region, 22) + 18;
  const levelSpace = role.level === undefined ? 0 : 83;
  const playerRightEdge = rightEdge ?? 802;
  const available = playerRightEdge - 204 - 12 - levelSpace;
  const minNicknameWidth = Math.min(nicknameWidth, 62);
  const maxNicknameWidth = rightEdge === undefined ? 330 :
    Math.min(330, Math.max(minNicknameWidth, available - regionWidth));
  label(context, nickname, 204, 66, 29, { weight: 700, maxWidth: maxNicknameWidth });
  const levelPosition = 204 + Math.min(nicknameWidth, maxNicknameWidth) + 12;
  if (role.level !== undefined) {
    drawTag(context, "#f3cb45", levelPosition, 48, 73);
    label(context, `Lv${role.level}`, levelPosition + 36.5, 66, 22, { color: "#2b2628", align: "center" });
  }
  const serverPosition = levelPosition + levelSpace;
  const serverWidth = Math.min(playerRightEdge - serverPosition, regionWidth);
  drawTag(context, "#51b1fd", serverPosition, 48, serverWidth);
  label(context, region, serverPosition + serverWidth / 2, 66, 22, { color: "#2b2628", align: "center", maxWidth: serverWidth - 8 });
  if (uidBar) context.drawImage(uidBar, 192, 90, 225, 42);
  else box(context, "#1b1b25", 192, 90, 225, 42);
  label(context, `UID ${role.uid}`, 304.5, 111, 22, { color: "#ffffff99", align: "center" });
}
