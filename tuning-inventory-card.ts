import { builtinResourceDirectory } from "../../lib/builtin-resources.ts";
import { realpath, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import { FontLibrary, type CanvasRenderingContext2D as Context, type Image } from "skia-canvas";
import { artwork, cover, label, openZzzCardTheme, readZzzCardLocalArtwork, zzzCardFooter } from "./card-theme.ts";
import { renderZzzBattlePng } from "./challenge-card.ts";
import { fetchZzzQqAvatar } from "./tuning-artwork.ts";

export const inventoryFields = [
  ["monochrome", "菲林底片"], ["polychrome", "菲林"], ["encryptedMasterTape", "加密母带"],
  ["masterTape", "原装母带"], ["boopon", "邦布券"],
] as const;

export interface InventoryCard {
  readonly qq: string;
  readonly uid: string;
  readonly nickname: string;
  readonly level?: string | number;
  readonly rows: readonly { name: typeof inventoryFields[number][1]; value: string }[];
}

const width = 560;
const height = 381;
const style = '"LotusZzzInventory", "Noto Sans CJK SC", sans-serif';

async function originalFont(root: string | undefined) {
  if (!root) return;
  try {
    const directory = await realpath(root);
    const path = await realpath(join(directory, "font/yuan.ttf"));
    if (!path.startsWith(directory + sep)) return;
    const info = await stat(path);
    if (info.isFile() && info.size <= 16 * 1024 * 1024) FontLibrary.use("LotusZzzInventory", [path]);
  } catch { /* The rest of the card is usable without the operator-local font. */ }
}

function originalFrame(context: Context, background: Image | undefined) {
  if (!background || background.height <= 320) {
    context.fillStyle = "#383838";
    context.beginPath();
    context.roundRect(20, 4, 520, 358, 10);
    context.fill();
    return;
  }

  const { width, height } = background;
  // The original template uses a 160px vertical border-image slice rendered at 80 logical pixels.
  context.drawImage(background, 0, 0, width, 160, 20, 4, 520, 80);
  context.drawImage(background, 0, 160, width, height - 320, 20, 84, 520, 198);
  context.drawImage(background, 0, height - 160, width, 160, 20, 282, 520, 80);
}

function text(context: Context, value: string, x: number, y: number, size: number,
  color: string, align: Context["textAlign"] = "left", maxWidth = 200) {
  context.font = `${size}px ${style}`;
  context.textAlign = align;
  context.textBaseline = "middle";
  context.fillStyle = color;
  context.fillText(value, x, y, maxWidth);
}

function chip(context: Context, label: string, y: number) {
  context.font = `12px ${style}`;
  context.fillStyle = "#faebd7";
  const width = Math.min(208, context.measureText(label).width + 16);
  context.beginPath();
  context.roundRect(152, y, width, 18, 9);
  context.fill();
  text(context, label, 160, y + 9, 12, "#252525", "left", width - 16);
}

export async function renderZzzInventoryCard(model: InventoryCard, {
  themeDirectory = Bun.env.LOTUS_ZZZ_INVENTORY_THEME_DIR?.trim() || builtinResourceDirectory("games/zzz-inventory"), legacyResources, signal, avatar, mode = "auto", inlineImageByteLimit,
}: {
  themeDirectory?: string;
  legacyResources?: string;
  signal?: AbortSignal;
  avatar?: Buffer;
  mode?: "auto" | "gpu" | "cpu";
  inlineImageByteLimit?: number;
} = {}) {
  const local = (name: string) => artwork(readZzzCardLocalArtwork(themeDirectory, "zzz_md/imgs/" + name));
  const [background, originalLogo, player, icons] = await Promise.all([
    local("bg.png"), local("logo.png"), artwork(avatar ? Promise.resolve(avatar) : fetchZzzQqAvatar(model.qq, signal)),
    Promise.all(model.rows.map(({ name }) => local(name + ".png"))), originalFont(themeDirectory),
  ]);
  const logo = originalLogo ?? await (await openZzzCardTheme({ legacyResources }))("common/images/logo.png");
  signal?.throwIfAborted();

  return renderZzzBattlePng(width, height, context => {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    originalFrame(context, background);
    context.save();
    context.beginPath();
    context.roundRect(40, 92, 102, 102, 4);
    context.clip();
    context.fillStyle = "#24242b";
    context.fillRect(40, 92, 102, 102);
    if (player) cover(context, player, 40, 92, 102, 102);
    else label(context, "绳", 90, 140, 35, { align: "center" });
    context.restore();
    context.strokeStyle = "#ccc";
    context.beginPath();
    context.roundRect(40, 92, 102, 102, 4);
    context.stroke();

    chip(context, "等级：" + (model.level ?? "未知"), 122);
    chip(context, "UID：" + model.uid, 147);
    chip(context, "昵称：" + (model.nickname || "未知"), 172);
    if (logo) {
      const w = 50 * logo.width / logo.height;
      context.drawImage(logo, 510 - w, 122, w, 50);
    } else {
      text(context, "绝区零", 510, 145, 26, "#fff", "right");
    }

    for (const [index, { name, value }] of model.rows.entries()) {
      const x = 50 + index % 3 * 162;
      const y = 202 + Math.floor(index / 3) * 70;
      const icon = icons[index];
      if (icon) {
        context.drawImage(icon, x, y, 60, 60);
        text(context, value, x + 62, y + 52, 16, "#f6bab4", "left", 75);
      } else {
        text(context, name, x, y + 24, 15, "#eee");
        text(context, value, x, y + 48, 18, "#f6bab4");
      }
    }
    context.shadowColor = "#252525";
    context.shadowBlur = 1;
    context.shadowOffsetY = 0.6;
    text(context, zzzCardFooter, width / 2, 369, 10, "#fff", "center");
  }, 4, inlineImageByteLimit, { allowHalfScale: true, mode });
}
