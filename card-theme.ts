import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import type { GameRole } from "@lotus-yunzai/account";
import { FontLibrary, loadImage, type CanvasRenderingContext2D as Context, type Image } from "skia-canvas";
import { fetchZzzOfficialArtwork, fetchZzzQqAvatar } from "./tuning-artwork.ts";

const font = '"LotusZzzRecordHongmeng", "Noto Sans CJK SC", sans-serif';

export interface ZzzCardOptions {
  readonly legacyResources?: string;
  readonly signal?: AbortSignal;
  readonly qq?: string;
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

function drawTag(context: Context, color: string, x: number, y: number, w: number) {
  const cut = 5;
  const h = 35;
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

export function label(context: Context, text: string, x: number, y: number, size: number, settings: {
  color?: string;
  weight?: number;
  align?: CanvasTextAlign;
  maxWidth?: number;
} = {}) {
  const { color = "white", weight = 400, align = "left", maxWidth } = settings;
  context.textBaseline = "middle";
  context.textAlign = align;
  context.font = `${weight} ${size}px ${font}`;
  context.fillStyle = color;
  if (maxWidth !== undefined) {
    if (context.measureText(text).width > maxWidth) {
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
  { frame, uidBar, avatar }: Awaited<ReturnType<typeof loadZzzCardPlayer>>) {
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
  label(context, nickname, 204, 66, 29, { weight: 700, maxWidth: 330 });
  const levelPosition = 204 + Math.min(context.measureText(nickname).width, 330) + 12;
  if (role.level !== undefined) {
    drawTag(context, "#f3cb45", levelPosition, 48, 73);
    label(context, `Lv${role.level}`, levelPosition + 36.5, 66, 22, { color: "#2b2628", align: "center" });
  }
  const serverPosition = levelPosition + (role.level !== undefined ? 83 : 0);
  const server = region;
  context.font = `22px ${font}`;
  const serverWidth = Math.min(840 - serverPosition - 38, context.measureText(server).width + 18);
  drawTag(context, "#51b1fd", serverPosition, 48, serverWidth);
  label(context, server, serverPosition + serverWidth / 2, 66, 22, { color: "#2b2628", align: "center", maxWidth: serverWidth - 8 });
  if (uidBar) context.drawImage(uidBar, 192, 90, 225, 42);
  else box(context, "#1b1b25", 192, 90, 225, 42);
  label(context, `UID ${role.uid}`, 304.5, 111, 22, { color: "#ffffff99", align: "center" });
}
