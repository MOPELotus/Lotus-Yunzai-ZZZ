import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import { builtinResourceDirectory } from "../../lib/builtin-resources.ts";
import { genshinTemplateFont } from "../../lib/game-template-fonts.ts";
import { realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { FontLibrary, type Image } from "skia-canvas";
import type { ZzzGameRecordItem, ZzzOwnedBuddyRoster } from "@lotus-yunzai/hoyo-client";
import { renderZzzBattlePng } from "./challenge-card.ts";
import { artwork, readZzzCardLocalArtwork } from "./card-theme.ts";
import { createZzzRecordPortraits } from "./tuning-artwork.ts";

const defaultResources = builtinResourceDirectory("templates/daily-note");
const numberFont = '"LotusZzzBuddyNumbers", "Noto Sans CJK SC", sans-serif';
const bodyFont = genshinTemplateFont();

export function zzzOwnedBuddyText(roster: ZzzOwnedBuddyRoster) {
  return [
    `ID: ${roster.uid}`,
    ...roster.buddies.map(({ name, level, rank, rarity }) =>
      `${name} · ${rarity} · Lv.${level}${rank > 1 ? $t("owned-buddy-card.text_142e591ff1", { "rank": rank }) : ""}`),
    ...(roster.buddies.length ? [] : [$t("owned-buddy-card.text_58612629b8")]),
    $t("owned-buddy-card.text_18682e4331"),
  ].join("\n");
}

export async function renderZzzOwnedBuddyCard(roster: ZzzOwnedBuddyRoster, {
  resourceDirectory = Bun.env.LOTUS_DAILY_NOTE_RESOURCES || defaultResources, signal, inlineImageByteLimit,
}: { readonly resourceDirectory?: string; readonly signal?: AbortSignal; readonly inlineImageByteLimit?: number } = {}) {
  const resourceRoot = await realpath(resourceDirectory).catch(() => undefined);
  const fontPath = resourceRoot && await realpath(join(resourceRoot, "font/tttgbnumber.ttf")).catch(() => undefined);
  if (fontPath && fontPath.startsWith(resourceRoot + sep)) {
    try { FontLibrary.use("LotusZzzBuddyNumbers", [fontPath]); } catch { /* Use the system fallback. */ }
  }
  const local = (path: string) => artwork(readZzzCardLocalArtwork(resourceRoot, path));
  const [rankS, rankA, fill] = await Promise.all(["S.png", "A.png", "fill.png"].map(name => local(`ZZZero/img/other/${name}`)));
  const { resolveIcon, loadArtwork } = createZzzRecordPortraits<ZzzGameRecordItem>("bangboo", signal);
  const portraits: (Image | undefined)[] = [];
  for (let start = 0; start < roster.buddies.length; start += 8) {
    signal?.throwIfAborted();
    const batch = await Promise.all(roster.buddies.slice(start, start + 8).map(async buddy => {
      const legacy = /^[\p{L}\p{N}· ]+$/u.test(buddy.name) && await local(`ZZZero/img/buddy/${buddy.name}.png`);
      const key = resolveIcon(buddy);
      return legacy || (key ? artwork(loadArtwork(key)) : undefined);
    }));
    portraits.push(...batch);
  }
  signal?.throwIfAborted();
  const columns = roster.buddies.length <= 8 ? 4 : 7;
  const rows = Math.ceil(roster.buddies.length / columns);
  const width = columns === 7 ? 580 : Math.max(210, Math.min(roster.buddies.length, columns) * 78 + 30);
  const height = 92 + Math.max(1, rows) * 114;
  return renderZzzBattlePng(width, height, context => {
    context.fillStyle = "#ececec";
    context.fillRect(0, 0, width, height);
    context.shadowColor = "#00000026";
    context.shadowBlur = 34;
    context.shadowOffsetY = 18;
    context.fillStyle = "#fff";
    context.beginPath();
    context.roundRect(10, 10, width - 20, height - 20, 15);
    context.fill();
    context.shadowColor = "transparent";

    context.fillStyle = "#d3bc8d";
    context.beginPath();
    context.roundRect(20, 19, 5, 24, 1);
    context.fill();
    context.fillStyle = "#1e1f20";
    context.font = `16px ${numberFont}`;
    context.fillText(`ID: ${roster.uid}`, 37, 35);
    context.textAlign = "center";

    for (const [index, buddy] of roster.buddies.entries()) {
      const x = 22 + index % columns * 78;
      const y = 54 + Math.floor(index / columns) * 114;
      context.save();
      context.shadowColor = "#845d5a4d";
      context.shadowBlur = 19;
      context.shadowOffsetY = 7;
      context.fillStyle = "#e9e5dc";
      context.beginPath();
      context.roundRect(x, y, 66, 80, 5);
      context.fill();
      context.shadowColor = "transparent";
      context.clip();
      const rank = buddy.rarity === "S" ? rankS : buddy.rarity === "A" ? rankA : undefined;
      if (rank) context.drawImage(rank, x, y, 20, 20 * rank.height / rank.width);
      else {
        context.fillStyle = buddy.rarity === "S" ? "#c99342" : "#7777a6";
        context.fillRect(x, y, 20, 61);
        context.fillStyle = "#fff";
        context.font = `13px ${numberFont}`;
        context.fillText(buddy.rarity, x + 9, y + 16);
      }
      const portrait = portraits[index];
      if (portrait) context.drawImage(portrait, x, y, 66, 66 * portrait.height / portrait.width);
      context.fillStyle = "#e9e5dc";
      context.fillRect(x, y + 62, 66, 18);
      context.font = `14px ${numberFont}`;
      context.fillStyle = "#1e1f20";
      context.fillText(`Lv.${buddy.level}`, x + 33, y + 76);
      if (fill) context.drawImage(fill, x + 51, y + 63 - 15 * fill.height / fill.width, 15, 15 * fill.height / fill.width);
      if (buddy.rank > 1) {
        context.fillStyle = buddy.rank >= 4 ? "#ff5722" : "#62a8ea";
        context.beginPath();
        context.roundRect(x + 51, y, buddy.rank > 9 ? 17 : 14, 16, 3);
        context.fill();
        context.fillStyle = "#fff";
        context.font = `12px ${numberFont}`;
        context.fillText(String(buddy.rank), x + 58, y + 12);
      }
      context.restore();
      context.fillStyle = "#1e1f20";
      context.font = `500 14px ${bodyFont}`;
      context.fillText(buddy.name, x + 33, y + 100, 66);
    }
    context.textAlign = "left";
    context.fillStyle = "#7f858a";
    context.font = `12px ${bodyFont}`;
    if (!roster.buddies.length) context.fillText($t("owned-buddy-card.text_58612629b8"), 22, 92);
    context.fillText($t("owned-buddy-card.text_18682e4331"), 22, height - 25);
  }, 4, inlineImageByteLimit, { allowHalfScale: true });
}
