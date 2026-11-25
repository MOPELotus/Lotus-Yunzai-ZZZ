import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import type { GameRole } from "@lotus-yunzai/account";
import type { ZzzClimbingTowerSnapshot, ZzzShiyuPortrait, ZzzTowerSeason } from "@lotus-yunzai/hoyo-client";
import type { CanvasRenderingContext2D as Context, Image } from "skia-canvas";
import { artwork, box, cover, label, loadZzzCardPlayer, measureZzzCardLabel, openZzzCardTheme, zzzCardFooter,
  zzzRegionName, type ZzzCardOptions } from "./card-theme.ts";
import { contain, drawPortrait, fillRound, loadChallengePortrait, renderZzzBattlePng } from "./challenge-card.ts";
import { fetchZzzOfficialArtwork } from "./tuning-artwork.ts";

const width = 500;
const top = 184.8;
const sectionInset = 33;
const portraitGap = 28.8;
const portraitSize = (width - 2 * sectionInset - 2 * portraitGap) / 3;
const titles = { 1: $t("climbing-tower-card.text_16a75e0027"), 2: $t("climbing-tower-card.text_98f7195705"), 3: $t("climbing-tower-card.text_7a30bc3a6a"), 4: $t("climbing-tower-card.text_b180896959") } as const;

function percentage(value: number | undefined) {
  return value === undefined ? "—" : `${(value / 100).toFixed(2)}%`;
}

function score(value: number | undefined) {
  return value === undefined ? "—" : String(value);
}

function mainMetrics(season: ZzzTowerSeason): readonly (readonly [string, string])[] {
  const layer = [$t("climbing-tower-card.text_6e35682bee"), score(season.layer)] as const;
  if (season.number === 1) return [layer];
  if (season.number === 2) return [layer, [$t("climbing-tower-card.text_7c0ac18ce6"), score(season.mvp)]];
  return [layer, [$t("climbing-tower-card.text_89e35e662a"), score(season.score)]];
}

function mvpMetrics(season: ZzzTowerSeason): readonly (readonly [string, string])[] {
  return [[$t("climbing-tower-card.text_7c0ac18ce6"), score(season.mvp)], [$t("climbing-tower-card.text_6570a98f28"), percentage(season.percentile)]];
}

export function zzzClimbingTowerText(snapshot: ZzzClimbingTowerSnapshot) {
  return snapshot.seasons.map(season => {
    const metrics = [...mainMetrics(season), ...(season.number >= 3 ? mvpMetrics(season) : [])];
    return [titles[season.number], metrics.map(([name, value]) => `${name} ${value}`).join(" · "),
      ...season.avatars.map(entry => `${entry.name ?? $t("climbing-tower-card.text_5aea7d747f")} · ${score(entry.score)} · ${percentage(entry.percentile)}`)].join("\n");
  }).join("\n\n");
}

function hasMetrics(entries: readonly (readonly [string, string])[]) {
  return entries.some(([, value]) => value !== "—");
}

function metricHeight(entries: readonly (readonly [string, string])[]) {
  return hasMetrics(entries) ? 75.2 : 36.2;
}

function blockLayout(season: ZzzTowerSeason) {
  const main = mainMetrics(season);
  const mvp = season.number >= 3 ? mvpMetrics(season) : [];
  const divider = 129 + metricHeight(main) + 24;
  const afterMetrics = mvp.length ? divider + 26 + metricHeight(mvp) : divider - 24;
  const portraits = afterMetrics + 24;
  return { main, mvp, divider, portraits,
    height: 33 + (season.avatars.length ? portraits + portraitSize : afterMetrics) };
}

function metrics(context: Context, entries: readonly (readonly [string, string])[], top: number) {
  const widths = entries.map(([name, value]) => Math.max(measureZzzCardLabel(context, name, 21.6),
    value === "—" ? 0 : measureZzzCardLabel(context, value, 28.8)));
  const fullHeight = hasMetrics(entries);
  let x = (width - widths.reduce((sum, value) => sum + value, 0) - (entries.length - 1) * 48) / 2;
  for (const [index, [name, value]] of entries.entries()) {
    const w = widths[index]!;
    const center = x + w / 2;
    label(context, name, center, top + (fullHeight && value === "—" ? 33.7 : 14.5), 21.6,
      { align: "center", color: "#979797" });
    if (value !== "—") {
      label(context, value, center + 2, top + 58.7, 28.8, { align: "center", color: "#383434" });
      label(context, value, center, top + 55.7, 28.8, { align: "center", color: "#e6e6e6" });
    } else {
      label(context, value, center, top + (fullHeight ? 61 : 33), 15, { align: "center", color: "#979797" });
    }
    x += w + 48;
  }
}

function drawTowerPlayer(context: Context, role: GameRole, region: string,
  { frame, uidBar, avatar }: Awaited<ReturnType<typeof loadZzzCardPlayer>>) {
  const x = 24, centerY = 112.8, size = 96;
  const nickname = role.nickname || $t("climbing-tower-card.text_4efe2edb6d");
  const level = role.level === undefined ? undefined : `Lv${role.level}`;
  const nicknameWidth = measureZzzCardLabel(context, nickname, 28.8, 700);
  const levelWidth = level ? measureZzzCardLabel(context, level, 21.6) + 19.2 : 0;
  const regionWidth = Math.min(166, measureZzzCardLabel(context, region, 21.6) + 19.2);
  const tagsWidth = regionWidth + (level ? levelWidth + 12 : 0);
  const diameter = Math.min(size, Math.max(37, width - x - 24 - 12 - 12 - tagsWidth - Math.min(nicknameWidth, 120) - 18));
  const radius = diameter / 2;
  const y = centerY - radius;
  if (frame) {
    const inset = diameter / 10;
    const frameSize = diameter + 2 * inset;
    context.drawImage(frame, x - inset, y - inset, frameSize, frameSize);
  }
  context.save();
  context.beginPath();
  context.arc(x + radius, centerY, radius, 0, 2 * Math.PI);
  context.clip();
  if (avatar) cover(context, avatar, x, y, diameter, diameter);
  else label(context, $t("climbing-tower-card.text_231e8863ee"), x + radius, centerY, Math.min(25, diameter / 2), { align: "center", weight: 700 });
  context.restore();

  const info = x + diameter + 24;
  const available = width - 18 - info - 12 - 12 - tagsWidth;
  label(context, nickname, info + 12, 89.4, 28.8, { weight: 700, maxWidth: available, ellipsis: false });
  let tagX = info + 24 + Math.min(available, nicknameWidth);
  if (level) {
    fillRound(context, "#f3cb45", tagX, 72.1, levelWidth, 34.7, 4.3);
    label(context, level, tagX + levelWidth / 2, 89.4, 21.6, { align: "center", color: "#2b2628" });
    tagX += levelWidth + 12;
  }
  fillRound(context, "#51b1fd", tagX, 72.1, regionWidth, 34.7, 4.3);
  label(context, region, tagX + regionWidth / 2, 89.4, 21.6,
    { align: "center", color: "#2b2628", maxWidth: regionWidth - 8 });
  const uid = `UID ${role.uid}`;
  const uidWidth = measureZzzCardLabel(context, uid, 21.6) + 69.1;
  if (uidBar) context.drawImage(uidBar, info, 113.7, uidWidth, 41.9);
  else fillRound(context, "#1b1b25", info, 113.7, uidWidth, 41.9, 12);
  label(context, uid, info + uidWidth / 2, 134.65, 21.6, { align: "center", color: "#ffffff99" });
}

// Fixed 2057599 personal tower template uses the same page background and player header as the record cards.
export async function renderZzzClimbingTower(snapshot: ZzzClimbingTowerSnapshot, role: GameRole, options: ZzzCardOptions & { readonly towerVisibility?: readonly (boolean | undefined)[] } = {}) {
  const local = await openZzzCardTheme(options);
  const fetched = new Map<string, Promise<Image | undefined>>();
  function official(url: string) {
    let image = fetched.get(url);
    if (!image) {
      image = artwork(fetchZzzOfficialArtwork(url, options.signal));
      fetched.set(url, image);
    }
    return image;
  }
  const portraits = new Map<ZzzShiyuPortrait, Image | undefined>();
  const badges = ["S", "A", "B"].map(rarity => `common/images/RANK_${rarity}.png`);
  const [background, player, ranks, medals] = await Promise.all([
    local("common/images/bg.jpg"), loadZzzCardPlayer(local, options, role.avatar),
    Promise.all(badges.map(async path => [path, await local(path)] as const)),
    Promise.all(snapshot.seasons.map(season => season.medal ? official(season.medal) : undefined)),
    Promise.all(snapshot.seasons.flatMap(season => season.avatars.map(entry =>
      loadChallengePortrait(entry, false, local, official, portraits)))),
  ]);
  const art = { local: new Map(ranks), portraits };
  options.signal?.throwIfAborted();
  const visibility = options.towerVisibility;
  const showVisibility = visibility?.some(value => value !== undefined);
  const layouts = snapshot.seasons.map(blockLayout);
  const noteY = top + layouts.reduce((sum, layout) => sum + layout.height + 24, 0);
  const height = Math.ceil(noteY + 179.6);
  return renderZzzBattlePng(width, height, context => {
    box(context, "#1d1a24", 0, 0, width, height);
    if (background) cover(context, background, 0, 0, width, height);
    drawTowerPlayer(context, role, zzzRegionName(snapshot.region, role.regionName), player);
    let y = top;
    for (const [index, season] of snapshot.seasons.entries()) {
      const layout = layouts[index]!;
      fillRound(context, "#0009", 4.5, y + 4.5, width - 9, layout.height - 9, 19.5);
      context.lineWidth = 9;
      context.strokeStyle = "#444";
      context.stroke();
      label(context, titles[season.number], sectionInset + 2, y + 72, 36, { color: "#383434", weight: 700 });
      label(context, titles[season.number], sectionInset, y + 69, 36, { color: "#e6e6e6", weight: 700 });
      const medal = medals[index];
      if (medal) contain(context, medal, width - sectionInset - 72, y + 33, 72, 72);
      metrics(context, layout.main, y + 129);
      if (layout.mvp.length) {
        box(context, "#444", sectionInset, y + layout.divider, width - 2 * sectionInset, 2);
        metrics(context, layout.mvp, y + layout.divider + 26);
      }
      for (const [column, entry] of season.avatars.entries()) {
        const x = sectionInset + column * (portraitSize + portraitGap);
        const row = y + layout.portraits;
        drawPortrait(context, art, entry, x, row, portraitSize);
        fillRound(context, "#0008", x + 1.5, row + portraitSize - 25, portraitSize - 3, 23.5, 8);
        label(context, score(entry.score), x + 3, row + portraitSize - 11.5, 14.4, { maxWidth: portraitSize / 2 - 6 });
        label(context, percentage(entry.percentile), x + portraitSize - 3, row + portraitSize - 11.5, 14.4,
          { align: "right", maxWidth: portraitSize / 2 - 3 });
      }
      y += layout.height + 24;
    }
    if (showVisibility && visibility) {
      const state = (value: boolean | undefined) => value === undefined ? $t("climbing-tower-card.text_0db3db4421") : value ? $t("climbing-tower-card.text_4e1449e7d5") : $t("climbing-tower-card.text_145219e726");
      label(context, $t("climbing-tower-card.text_ab6a049061", { "value1": visibility.map((value, index) => `S${index + 1} ${state(value)}`).join(" · ") }),
        57, noteY + 37, 19.2, { maxWidth: 386, ellipsis: false });
      label(context, $t("climbing-tower-card.text_a37017e9f7"), 67.2, noteY + 63, 19.2, { color: "#ffd700" });
    } else {
      const instruction = $t("climbing-tower-card.text_e7135a7feb");
      const command = $t("climbing-tower-card.text_b96df69e42");
      const commandX = 67.2 + measureZzzCardLabel(context, instruction, 19.2) + 5.8;
      const suffixX = commandX + measureZzzCardLabel(context, command, 19.2) + 5.8;
      label(context, "•", 57, noteY + 37, 19.2);
      label(context, instruction, 67.2, noteY + 37, 19.2);
      label(context, command, commandX, noteY + 37, 19.2, { color: "#ffd700" });
      label(context, $t("climbing-tower-card.text_365a333c94"), suffixX, noteY + 37, 19.2);
      label(context, $t("climbing-tower-card.text_6fb4ff4797"), 67.2, noteY + 63, 19.2);
    }
    label(context, zzzCardFooter, width / 2, height - 44.5, 16.8, { align: "center", color: "#fff" });
  }, 4, options.inlineImageByteLimit, { allowHalfScale: true });
}
