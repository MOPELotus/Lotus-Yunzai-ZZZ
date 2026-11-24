import { fileURLToPath } from "node:url";
import { createAtlasRuntimeCatalog, findTraditionalEntries } from "@lotus-yunzai/atlas/catalog";
import { readAtlasGalleryImage } from "@lotus-yunzai/atlas/gallery";
import { Canvas, loadImage, type CanvasRenderingContext2D as Context, type Image } from "skia-canvas";
import { box, cover, label, openZzzCardTheme, zzzCardFooter } from "./card-theme.ts";
import { renderZzzBattlePng, ZzzInlineImageLimitError } from "./challenge-card.ts";
import { zzzPrefixedCommand } from "./panel-command.ts";
import { readPanelJson } from "./panel-storage.ts";
import { panelObject } from "./panel-detail.ts";
import { readZzzRoleAliases, zzzRoleAlias } from "./role-alias.ts";

const atlasRoot = fileURLToPath(new URL("../../data/atlas/", import.meta.url));
type Catalog = ReturnType<typeof createAtlasRuntimeCatalog>;
type Role = NonNullable<Awaited<ReturnType<Catalog["roleDetails"]>>>;
const width = 840;
const inset = 24;
const columnGap = 16;
const column = (width - 2 * inset - columnGap) / 2;
const effectFont = '20.8px "Noto Sans CJK SC", sans-serif';
const impressionFont = '19.2px "Noto Sans CJK SC", sans-serif';
const effectLineHeight = 31.2;
const impressionLineHeight = 25;

export function zzzCinemaCommand(raw: string) {
  const command = zzzPrefixedCommand(raw);
  const name = command && /^([^\p{Cc}\p{Cf}]{1,80}?)(?:意象影画|意象|影画|命座)$/u.exec(command)?.[1]?.trim();
  if (name && name !== "角色" && !/^\d+$/u.test(name.normalize("NFKC"))) return name;
}

export function zzzCinemaRanks(ranks: Role["ranks"]) {
  if (ranks.length !== 6) return;
  const ordered = ranks.map(rank => ({
    ...rank, description: rank.description?.replace(/<\/?Term\b[^<>]*>/giu, "").trim(),
  })).sort((a, b) => a.rank - b.rank);
  if (ordered.every(({ rank, name, description }, index) => rank === index + 1 && name && description)) return ordered;
}

export function wrapZzzWikiText(context: Context, value: string, limit: number, font: string) {
  context.font = font;
  return value.split("\n").flatMap(paragraph => {
    const lines = [];
    let line = "";
    for (const token of paragraph.match(/[A-Za-z0-9%+.,-]+|./gu) ?? []) {
      if (line && context.measureText(line + token).width > limit) {
        lines.push(line);
        line = token;
      } else {
        line += token;
      }
    }
    return [...lines, line];
  });
}

export function drawZzzWikiLines(context: Context, lines: readonly string[], x: number, y: number, lineHeight: number, font: string) {
  context.font = font;
  context.fillStyle = "white";
  context.textBaseline = "top";
  context.textAlign = "left";
  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
}

async function oldImpressions(resources: string | undefined, id: string) {
  if (!resources) return [];
  const raw = panelObject(await readPanelJson(resources, `data/nanoka/character/${id}.json`, 2 * 1024 * 1024).catch(() => undefined));
  if (String(raw.id) !== id) return [];
  const info = panelObject(raw.partner_info);
  return [info.impression_f, info.impression_m].flatMap(value =>
    typeof value === "string" && value.trim() ? [value.replace(/<[^>]*>/gu, "").trim()] : []);
}

// The original ZZZure template uses a two-column rank grid, the shared background
// and the character's third Mindscape artwork (2057599, resources/cinema/index.html).
async function renderCinema(name: string, fullName: string, ranks: Role["ranks"], source: {
  readonly background?: Image;
  readonly avatar?: Image;
  readonly illustration?: Image;
  readonly impressions: readonly string[];
}, inlineImageByteLimit?: number) {
  const measurement = new Canvas(1, 1).getContext("2d");
  const impressions = source.impressions.flatMap(value => wrapZzzWikiText(measurement, value, 642, impressionFont));
  const header = Math.max(168, 92 + impressions.length * impressionLineHeight);
  const panels = ranks.map(rank => ({ rank, lines: wrapZzzWikiText(measurement, rank.description ?? "", column, effectFont) }));
  const rows = [0, 2, 4].map(index => panels.slice(index, index + 2));
  const rowHeights = rows.map(two => 68 + Math.max(...two.map(({ lines }) => lines.length)) * effectLineHeight);
  const artwork = source.illustration;
  const artWidth = artwork && Math.min(width - 2 * inset, artwork.width);
  const artHeight = artwork && artWidth ? artWidth * artwork.height / artwork.width : 0;
  const height = Math.ceil(header + 108 + rowHeights.reduce((sum, row) => sum + row, 0) + artHeight + 116);
  return renderZzzBattlePng(width, height, context => {
    box(context, "#191722", 0, 0, width, height);
    if (source.background) cover(context, source.background, 0, 0, width, height);
    if (source.avatar) {
      context.save();
      context.beginPath();
      context.arc(84, 84, 60, 0, Math.PI * 2);
      context.clip();
      box(context, "white", inset, inset, 120, 120);
      cover(context, source.avatar, inset, inset, 120, 120);
      context.restore();
    }
    const nameX = source.avatar ? 168 : inset;
    label(context, name, nameX, 50, 36, { maxWidth: 360 });
    if (fullName !== name) {
      const shortNameWidth = Math.min(360, context.measureText(name).width);
      label(context, fullName, nameX + shortNameWidth + 14, 54, 24, { maxWidth: width - nameX - shortNameWidth - 38 });
    }
    drawZzzWikiLines(context, impressions, nameX, 82, impressionLineHeight, impressionFont);
    label(context, "意象影画", inset, header + 41, 32);
    label(context, "CINEMA", inset, header + 71, 24, { color: "#6666ff" });
    let y = header + 104;
    for (const [row, two] of rows.entries()) {
      for (const [index, { rank, lines }] of two.entries()) {
        const x = inset + index * (column + columnGap);
        label(context, `${rank.rank}. ${rank.name}`, x, y + 14, 24, { ellipsis: false, maxWidth: column });
        drawZzzWikiLines(context, lines, x, y + 36, effectLineHeight, effectFont);
      }
      y += rowHeights[row]!;
    }
    if (artwork && artWidth) {
      const x = (width - artWidth) / 2;
      context.save();
      context.beginPath();
      context.roundRect(x, y, artWidth, artHeight, 12);
      context.clip();
      context.drawImage(artwork, x, y, artWidth, artHeight);
      context.restore();
    }
    label(context, "数据来源于 Nanoka", width / 2, height - 71, 20, { color: "#a09ca3", align: "center" });
    label(context, zzzCardFooter, width / 2, height - 28, 18, { color: "#a09ca3", align: "center" });
  }, 4, inlineImageByteLimit, { allowHalfScale: true });
}

export function createZzzCinema(signal: AbortSignal) {
  const catalog = createAtlasRuntimeCatalog(atlasRoot, Bun.env.LOTUS_ATLAS_DATA_DIR);
  return async (query: string, { resources = Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR, inlineImageByteLimit }: {
    readonly resources?: string;
    readonly inlineImageByteLimit?: number;
  } = {}) => {
    try {
      const [snapshot, aliases] = await Promise.all([catalog.read(), readZzzRoleAliases(resources).catch(() => undefined)]);
      const matches = findTraditionalEntries(snapshot, zzzRoleAlias(aliases, query) ?? query, "zzz", "character");
      if (matches.length !== 1) return `未找到${query}的意象影画资料。`;
      const { entry } = matches[0]!;
      if (!/^[1-9]\d{0,5}$/u.test(entry.id)) return;
      const role = await catalog.roleDetails(entry);
      const ranks = role && zzzCinemaRanks(role.ranks);
      if (!role || !ranks) return `${entry.name}的六档意象影画资料不完整。`;
      const root = catalog.assetRoot(entry);
      const local = await openZzzCardTheme({ legacyResources: resources });
      async function gallery(path: string | undefined) {
        const bytes = await readAtlasGalleryImage(root, "zzz", path, 8 * 1024 * 1024).catch(() => undefined);
        if (bytes) return loadImage(Buffer.from(bytes)).catch(() => undefined);
      }
      const portrait = `gallery/zzz/Mindscape_${entry.id}_3.webp`;
      const [background, avatar, illustration, impressions] = await Promise.all([
        local("common/images/bg.jpg"),
        local(`images/square_avatar/role_square_avatar_${entry.id}.png`).then(image => image ?? gallery(role.overview.icon)),
        local(`images/nanoka/ui/Mindscape_${entry.id}_3.webp`).then(image => image ??
          (ranks[2]?.artwork === portrait ? gallery(portrait) : undefined)),
        oldImpressions(resources, entry.id),
      ]);
      if (signal.aborted) return [];
      try {
        const { png } = await renderCinema(entry.name, role.overview.name, ranks,
          { background, avatar, illustration, impressions }, inlineImageByteLimit);
        return signal.aborted ? [] : { type: "image" as const, file: png };
      } catch (error) {
        if (!(error instanceof ZzzInlineImageLimitError)) throw error;
        if (signal.aborted) return [];
        return [`${entry.name}意象影画`, error.message,
          ...ranks.map(rank => `${rank.rank}. ${rank.name}\n${rank.description}`)].join("\n\n");
      }
    } catch {
      return signal.aborted ? [] : "绝区零意象影画暂时无法查看。";
    }
  };
}
