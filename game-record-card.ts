import type { GameRole } from "@lotus-yunzai/account";
import type { ZzzGameRecordItem, ZzzGameRecordSnapshot } from "@lotus-yunzai/hoyo-client";
import { renderPng } from "@lotus-yunzai/skia";
import type { CanvasRenderingContext2D, Image } from "skia-canvas";
import { artwork, box, cover, drawZzzCardPlayer, label, loadZzzCardPlayer, openZzzCardTheme, zzzCardFooter, type ZzzCardOptions } from "./card-theme.ts";
import { createZzzRecordPortraits } from "./tuning-artwork.ts";

type Context = CanvasRenderingContext2D;
const width = 840;
const tileWidth = 144;
const tileHeight = 180;
const gridWidth = 648;
const tileGap = 24;
const rarityColors = { S: "#e67733", A: "#8a33b7", B: "#5db7f9" };
const rankColors = ["#757575", "#3a742b", "#3d84d6", "#df7676", "#3336a1", "#667f13", "#da3020"];
const elementNames: Readonly<Record<string, string>> = {
  Physical: "物", Fire: "火", Ice: "冰", Electric: "电", Wind: "风", Ether: "以", Lumiflux: "流",
  HonedEdge: "刃", Frost: "霜", AuricInk: "墨",
};

function title(context: Context, y: number, english: string, chinese: string) {
  context.save();
  context.transform(1, 0, -0.14, 1, y * 0.14, 0);
  label(context, english, width / 2, y, 65, { color: "#ffffff20", weight: 800, align: "center" });
  context.restore();
  context.beginPath();
  for (const left of [82, 547]) {
    for (let column = 0; column < 8; column++) {
      const x = left + 26.4 * column;
      context.moveTo(x + 17, y - 16);
      context.lineTo(x + 31, y - 16);
      context.lineTo(x + 14, y + 15);
      context.lineTo(x, y + 15);
      context.closePath();
    }
  }
  context.fillStyle = "#f6ca45";
  context.fill();
  label(context, chinese, width / 2, y, 36, { align: "center" });
}

function tile(context: Context, item: ZzzGameRecordItem, x: number, y: number, picture: Image | undefined,
  badges: ReadonlyMap<string, Image | undefined>, unit: "影" | "命") {
  box(context, rarityColors[item.rarity], x - 5, y + 5, tileWidth, tileHeight);
  box(context, "#e2e2e2", x, y, tileWidth, tileHeight);
  if (picture) {
    context.save();
    context.beginPath();
    context.rect(x, y, tileWidth, tileHeight);
    context.clip();
    context.drawImage(picture, x, y, tileWidth, tileWidth * picture.height / picture.width);
    context.restore();
  }
  else label(context, item.name, x + tileWidth / 2, y + 84, 20, { color: "#353035", align: "center", maxWidth: tileWidth - 14 });

  const rarity = badges.get(item.rarity);
  if (rarity) context.drawImage(rarity, x + 3, y + 4, 36, 36);
  else label(context, item.rarity, x + 13, y + 18, 25, { color: rarityColors[item.rarity], weight: 800 });
  if (item.element) {
    const element = badges.get(item.element);
    context.fillStyle = "#101014";
    context.beginPath();
    context.arc(x + tileWidth - 21, y + 23, 18, 0, Math.PI * 2);
    context.fill();
    if (element) context.drawImage(element, x + tileWidth - 36, y + 8, 30, 30);
    else label(context, elementNames[item.element] ?? "·", x + tileWidth - 21, y + 24, 17, { align: "center" });
  }

  const footer = y + tileHeight - 32;
  box(context, "#08080b", x, footer, tileWidth, 32);
  box(context, rankColors[item.rank] ?? rankColors[0]!, x, footer, 48, 32);
  label(context, `${item.rank}${unit}`, x + 24, footer + 16, 22, { align: "center" });
  label(context, `等级${item.level}`, x + 96, footer + 16, 24, { align: "center" });
}

function drawGrid(context: Context, list: readonly ZzzGameRecordItem[], images: readonly (Image | undefined)[],
  badges: ReadonlyMap<string, Image | undefined>, y: number, unit: "影" | "命") {
  list.forEach((item, index) => tile(context, item, (width - gridWidth) / 2 + index % 4 * (tileWidth + tileGap),
    y + Math.floor(index / 4) * (tileHeight + tileGap), images[index], badges, unit));
  if (!list.length) label(context, unit === "影" ? "暂无代理人" : "暂无邦布", width / 2, y + 24, 23, { align: "center" });
}

function gridHeight(list: readonly unknown[]) {
  return list.length ? Math.ceil(list.length / 4) * (tileHeight + tileGap) : 70;
}

// Skia layout of ZZZure/ZZZ-Plugin 2057599 resources/card/index.html and resources/common/layout.
export async function renderZzzGameRecord(record: ZzzGameRecordSnapshot, role: GameRole, options: ZzzCardOptions = {}) {
  const { signal } = options;
  const local = await openZzzCardTheme(options);

  async function loadPortraits(list: readonly ZzzGameRecordItem[], kind: "character" | "bangboo") {
    const { resolveIcon, loadArtwork } = createZzzRecordPortraits<ZzzGameRecordItem>(kind, signal);
    const result: (Image | undefined)[] = [];
    for (let start = 0; start < list.length && !signal?.aborted; start += 8) {
      const batch = await Promise.all(list.slice(start, start + 8).map(async (item) => {
        const cachedPath = kind === "character" ? `square_avatar/role_square_avatar_${item.itemId}.png`
          : `bangboo_square_avatar/bangboo_rectangle_avatar_${item.itemId}.png`;
        const cached = await local(`images/${cachedPath}`);
        if (cached) return cached;
        const key = resolveIcon(item);
        return key ? artwork(loadArtwork(key)) : undefined;
      }));
      result.push(...batch);
    }
    return result;
  }

  const badgePaths = new Map<string, string>();
  for (const item of [...record.avatars, ...record.buddies]) {
    badgePaths.set(item.rarity, `common/images/RANK_${item.rarity}.png`);
    if (item.element) badgePaths.set(item.element, `common/images/element/${item.element}.png`);
  }
  const [background, status, player, agents, buddies, badges] = await Promise.all([
    local("common/images/bg.jpg"), local("card/images/status.png"),
    loadZzzCardPlayer(local, options, record.avatar), loadPortraits(record.avatars, "character"), loadPortraits(record.buddies, "bangboo"),
    Promise.all([...badgePaths].map(async ([name, path]) => [name, await local(path)] as const)).then((entries) => new Map(entries)),
  ]);
  signal?.throwIfAborted();

  const startGrid = 578.8;
  const nextGrid = startGrid + gridHeight(record.avatars) + 96;
  const height = Math.ceil(nextGrid + gridHeight(record.buddies) + 80);
  const scale = height <= 7_500 ? 2 : 1;
  return renderPng(width * scale, height * scale, (context) => {
    context.scale(scale, scale);
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#20222d");
    gradient.addColorStop(1, "#0c0d12");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    if (background) cover(context, background, 0, 0, width, height);

    drawZzzCardPlayer(context, role, record.worldLevel || role.regionName || record.region, player);

    if (status) {
      context.save();
      context.beginPath();
      context.rect(48, 160, 744, 310);
      context.clip();
      context.drawImage(status, 11, 67, 818, 496);
      context.restore();
    } else {
      context.fillStyle = "#313440";
      context.beginPath();
      context.roundRect(48, 160, 744, 310, 30);
      context.fill();
    }
    const overview = [
      ["活跃天数", record.stats.active_days], ["获得代理人", record.stats.avatar_num],
      ["获得邦布", record.stats.buddy_num], ["式舆防卫战", record.stats.cur_period_zone_layer_count],
    ] as const;
    overview.forEach(([name, value], index) => {
      const x = 189.3 + index * 150;
      label(context, String(value ?? "—"), x, 310, 43, { align: "center", maxWidth: 157 });
      label(context, name, x, 347, 23, { color: "#e2e2e2", align: "center" });
    });

    title(context, startGrid - 48, "AGENT", "代理人信息");
    drawGrid(context, record.avatars, agents, badges, startGrid, "影");
    title(context, nextGrid - 48, "BANGBOO", "邦布信息");
    drawGrid(context, record.buddies, buddies, badges, nextGrid, "命");
    label(context, zzzCardFooter, width / 2, height - 42, 17, { color: "#a09ca3", align: "center" });
  }, "gpu");
}
