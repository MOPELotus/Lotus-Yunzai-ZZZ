import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import type { GameRole } from "@lotus-yunzai/account";
import { zzzZenkovPageSize as pageSize, type ZzzShiyuPortrait, type ZzzZenkovItem, type ZzzZenkovRank,
  type ZzzZenkovRun, type ZzzZenkovSnapshot } from "@lotus-yunzai/hoyo-client";
import type { PngRender } from "@lotus-yunzai/skia";
import type { CanvasRenderingContext2D as Context, Image } from "skia-canvas";
import { artwork, box, cover, drawZzzCardPlayer, label, loadZzzCardPlayer, measureZzzCardLabel, openZzzCardTheme, zzzCardFooter,
  type ZzzCardOptions } from "./card-theme.ts";
import { contain, drawPortrait, fillRound, loadChallengePortrait, rankBand, renderZzzBattlePng, ZzzInlineImageLimitError, type ZzzChallengeArt } from "./challenge-card.ts";
import { fetchZzzOfficialArtwork } from "./tuning-artwork.ts";

type Summary = Extract<ZzzZenkovSnapshot, { kind: "summary" }>;
type Collection = NonNullable<Summary["medals"]>;
type Assets = ZzzChallengeArt & { readonly icons: ReadonlyMap<string, Image | undefined> };
type Row = readonly [string, string];

export function zzzZenkovFollowUp(snapshot: ZzzZenkovSnapshot, command: string, renderedPages: number) {
  if (snapshot.kind === "detail" && snapshot.firstPage + renderedPages <= snapshot.pageCount) {
    return $t("zenkov-card.text_05a2a8504c", { "command": command, "value2": snapshot.firstPage + renderedPages });
  }
}

const width = 840;
const gold = "#ffd700";
const gray = "#aaa";
const theme = "zenkov/images/";
const funds = theme + "icon-fund.png";
const coins = theme + "icon-season-coins.png";
const lootPlain = theme + "icon-gain-bg.png";
const lootGold = theme + "icon-gain-bg-yellow.png";
const lootPurple = theme + "icon-gain-bg-purple.png";

function pct(value?: number) {
  if (value === undefined) return "—";
  return `${(value / 100).toFixed(value % 100 === 0 ? 0 : 2)}%`;
}
function rankText(rank?: ZzzZenkovRank) {
  return rank ? rank.percent ? `${Number((rank.value / 100).toFixed(2))}%` : `TOP ${rank.value}` : "—";
}
function amount(value?: string) {
  return value?.replace(/\B(?=(\d{3})+(?!\d))/gu, ",") ?? "—";
}
function progress(data?: { current?: number; total?: number }) {
  return `${data?.current ?? "—"} / ${data?.total ?? "—"}`;
}
function remaining(seconds: number | undefined, weekly: boolean) {
  if (seconds === undefined) return "—";
  const days = Math.floor(seconds / 86400);
  if (!weekly) return $t("zenkov-card.text_63c4ff4f1e", { "days": days });
  return $t("zenkov-card.text_952f1ba039", { "value1": String(days).padStart(2, "0"), "value2": String(Math.floor(seconds / 3600) % 24).padStart(2, "0") });
}
function duration(seconds?: number) {
  if (seconds === undefined) return "—";
  const [hour, minute, second] = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  return (hour ? [hour, minute, second] : [minute, second]).map(v => String(v).padStart(2, "0")).join(":");
}
function outcome(value?: boolean) {
  return value === undefined ? $t("zenkov-card.text_fd0694b6d0") : value ? $t("zenkov-card.text_7fe3cd3e40") : $t("zenkov-card.text_e1c16b94a0");
}
function weekly(snapshot: Summary): readonly Row[] {
  return [[$t("zenkov-card.text_f81ff55de1"), progress(snapshot.duty)], [$t("zenkov-card.text_c8d92ba124"), amount(snapshot.carryValue)],
    [$t("zenkov-card.text_c01e38da06"), String(snapshot.zGrade ?? "—")],
    [$t("zenkov-card.text_ad283677f7"), String(snapshot.millionEvacuations ?? "—")]];
}

export function zzzZenkovText(snapshot: ZzzZenkovSnapshot, command: string) {
  const maps = [$t("zenkov-card.text_964dc6eedf"), ...snapshot.maps.slice(0, 8).map(row => `${row.name ?? $t("zenkov-card.text_41ab2e0ecb")} · ${row.unlocked === false ?
    $t("zenkov-card.text_308d62ba23") : `${pct(row.evacuation)} · ${amount(row.price)} · ${rankText(row.rank)}`}`),
    $t("zenkov-card.text_c11255961c", { "value1": rankText(snapshot.rank) })];
  if (snapshot.maps.length + snapshot.hiddenMaps > 8) maps.push($t("zenkov-card.text_2f718c2d22", { "value1": snapshot.maps.length + snapshot.hiddenMaps - 8 }));
  if (snapshot.kind === "detail") {
    const runs = snapshot.records.slice(0, pageSize).map(row => `${row.map ?? $t("zenkov-card.text_41ab2e0ecb")} · ${row.started ?? "—"} · ${row.difficulty ?? "—"}
` +
      $t("zenkov-card.text_2affa47f29", { "value1": outcome(row.success), "value2": duration(row.seconds), "value3": amount(row.value) }));
    const followUp = zzzZenkovFollowUp(snapshot, command, 1);
    return [$t("zenkov-card.text_39e129ae70"), ...maps, $t("zenkov-card.text_7682e042ee", { "firstPage": snapshot.firstPage, "pageCount": snapshot.pageCount }), ...runs,
      ...(followUp ? [followUp] : [])].join("\n");
  }
  const { season, seasonUnlocked } = snapshot;
  return [$t("zenkov-card.text_0a991a8e6c"), $t("zenkov-card.text_bb174407bd", { "value1": season?.id ?? "—", "value2": season?.level ?? "—", "value3": remaining(season?.remaining, false) }),
    seasonUnlocked === false ? $t("zenkov-card.text_3714bab865") : $t("zenkov-card.text_90ca1f28a7", { "value1": season?.stage ?? "—", "value2": progress(season?.quest), "value3": progress(season?.coin) }),
    $t("zenkov-card.text_df436f2c38", { "value1": remaining(snapshot.weeklyRemaining, true) }), ...weekly(snapshot).map(row => row.join(" ")), ...maps,
    ...(snapshot.medals ? [$t("zenkov-card.text_f63cc5db09", { "value1": progress(snapshot.medals) })] : []), ...(snapshot.goods ? [$t("zenkov-card.text_6013118dbf", { "value1": progress(snapshot.goods) })] : [])].join("\n");
}

function drawIcon(ctx: Context, icon: Image | undefined, x: number, y: number, size: number) {
  if (icon) contain(ctx, icon, x, y, size, size);
}

function section(ctx: Context, top: number, height: number, title: string) {
  fillRound(ctx, "#0009", 29, top, 782, height, 17, "#444");
  label(ctx, title, 58, top + 38, 29, { weight: 700, color: "#e6e6e6" });
}

function drawRank(ctx: Context, art: Assets, rank: ZzzZenkovRank | undefined, x: number, y: number) {
  if (rank?.percent) {
    const badge = art.local.get(`common/images/rank_bg/${rankBand(rank.value)}.png`);
    if (badge) contain(ctx, badge, x - 49, y - 18, 98, 36);
    else fillRound(ctx, gold, x - 38, y - 13, 76, 26, 7);
    label(ctx, rankText(rank), x, y, 18, { align: "center", color: "#171717", weight: 700 });
  } else label(ctx, rankText(rank), x, y, 22, { align: "center", color: rank ? gold : gray });
}

function mapsHeight(snapshot: ZzzZenkovSnapshot) {
  return 156 + 46 * (Math.max(1, snapshot.maps.length) + Number(snapshot.hiddenMaps > 0));
}

function maps(ctx: Context, art: Assets, snapshot: ZzzZenkovSnapshot, y: number) {
  section(ctx, y, mapsHeight(snapshot), $t("zenkov-card.text_964dc6eedf"));
  for (const [i, column] of [$t("zenkov-card.text_41ab2e0ecb"), $t("zenkov-card.text_670575b685"), $t("zenkov-card.text_8d9f2691de"), $t("zenkov-card.text_b9467cfb61")].entries()) {
    const x = [62, 337, 531, 705][i]!;
    label(ctx, column, x, y + 79, 19, { align: i === 0 ? "left" : "center", color: gray });
  }
  box(ctx, "#333", 58, y + 97, 725, 2);
  if (!snapshot.maps.length) label(ctx, $t("zenkov-card.text_69d17d5308"), 420, y + 126, 21, { align: "center", color: gray });
  for (const [i, row] of snapshot.maps.entries()) {
    const top = y + 123 + i * 46;
    label(ctx, row.name ?? "—", 62, top, 22, { color: row.unlocked === false ? "#666" : "#e6e6e6", maxWidth: 242 });
    if (row.unlocked === false) label(ctx, $t("zenkov-card.text_308d62ba23"), 531, top, 21, { color: "#888", align: "center" });
    else {
      label(ctx, pct(row.evacuation), 337, top, 21, { align: "center", color: "#4cd964" });
      label(ctx, amount(row.price), 531, top, 21, { align: "center", color: gold, maxWidth: 165 });
      drawRank(ctx, art, row.rank, 705, top);
    }
    box(ctx, "#303030", 58, top + 22, 725, 1);
  }
  if (snapshot.hiddenMaps) label(ctx, $t("zenkov-card.text_a500b5268a", { "hiddenMaps": snapshot.hiddenMaps }), 62, y + 123 + snapshot.maps.length * 46, 19, { color: gray });
  const bottom = y + mapsHeight(snapshot) - 25;
  label(ctx, $t("zenkov-card.text_29784f10dd"), 62, bottom, 20, { color: gray });
  drawRank(ctx, art, snapshot.rank, 705, bottom);
}

function lootTile(ctx: Context, art: Assets, item: ZzzZenkovItem, x: number, y: number, size: number) {
  ctx.save();
  if (item.unlocked === false) ctx.globalAlpha = 0.4;
  const path = item.rarity === 5 ? lootGold : item.rarity === 4 ? lootPurple :
    item.rarity === 3 ? lootPlain : undefined;
  const tile = path && art.local.get(path);
  if (tile) ctx.drawImage(tile, x, y, size, size);
  const icon = item.icon && art.icons.get(item.icon);
  if (icon) contain(ctx, icon, x + 6, y + 5, size - 12, size - 11);
  else if (item.name) label(ctx, item.name, x + size / 2, y + size / 2, 15, { align: "center", maxWidth: size - 5 });
  ctx.restore();
}

function recordHeight(run: ZzzZenkovRun) {
  return Math.max(217, 160 + Math.ceil(run.loot.length / 9) * 50 + (run.hiddenLoot ? 22 : 0));
}

function drawRun(ctx: Context, art: Assets, run: ZzzZenkovRun, y: number) {
  fillRound(ctx, "#141414b3", 48, y, 744, recordHeight(run), 10, "#3d3d3d");
  label(ctx, run.map ?? "—", 64, y + 28, 24, { weight: 700, maxWidth: 252 });
  label(ctx, run.started ?? "—", 539, y + 28, 18, { align: "right", color: "#888" });
  fillRound(ctx, run.difficulty === "高危" ? "#b42828" : "#282929", 632, y + 11, 136, 32, 6);
  label(ctx, run.difficulty ?? "—", 700, y + 27, 18, { align: "center", maxWidth: 126 });
  box(ctx, "#333", 60, y + 53, 720, 1);
  label(ctx, outcome(run.success), 64, y + 80, 21, { color: run.success ? "#e9d288" : "#aaa", weight: 700 });
  label(ctx, $t("zenkov-card.text_f56dc77490", { "value1": duration(run.seconds) }), 64, y + 110, 18, { color: gray });
  drawIcon(ctx, art.local.get(funds), 502, y + 67, 24);
  label(ctx, amount(run.value), 762, y + 80, 24, { align: "right", color: gold, maxWidth: 229 });
  for (const [i, entry] of run.avatars.entries()) drawPortrait(ctx, art, entry, 65 + i * 82, y + 133, 68);
  fillRound(ctx, "#0006", 320, y + 106, 448, recordHeight(run) - 118, 7, "#383838");
  label(ctx, $t("zenkov-card.text_a4ccc0a299"), 332, y + 127, 19, { color: gray });
  if (!run.loot.length) label(ctx, "—", 333, y + 167, 20, { color: gray });
  for (const [i, item] of run.loot.entries()) lootTile(ctx, art, item, 330 + i % 9 * 47, y + 147 + Math.floor(i / 9) * 50, 43);
  if (run.hiddenLoot) label(ctx, $t("zenkov-card.text_4dc648b440", { "hiddenLoot": run.hiddenLoot }), 332, y + recordHeight(run) - 24, 15, { color: gray });
}

export async function renderZzzZenkov(snapshot: ZzzZenkovSnapshot, role: GameRole, command: string, options: ZzzCardOptions = {}) {
  const local = await openZzzCardTheme(options);
  const paths = ["common/images/bg.jpg", funds, coins, lootPlain, lootGold, lootPurple,
    ...[1, 2, 3, 4, 5].map(i => `common/images/rank_bg/${i}.png`)];
  const [staticImages, player] = await Promise.all([
    Promise.all(paths.map(async path => [path, await local(path)] as const)),
    loadZzzCardPlayer(local, options, role.avatar),
  ]);
  const icons = new Map<string, Image | undefined>();
  const art: Assets = { local: new Map(staticImages), icons, portraits: new Map() };
  const pages = snapshot.kind === "detail" ?
    Array.from({ length: Math.max(1, Math.ceil(snapshot.records.length / pageSize)) },
      (_, index) => snapshot.records.slice(index * pageSize, (index + 1) * pageSize)) : [[]];

  const output: (PngRender | string)[] = [];
  for (const [index, runs] of pages.entries()) {
    options.signal?.throwIfAborted();
    const assets = snapshot.kind === "summary" ? [...(snapshot.medals?.items ?? []), ...(snapshot.goods?.items ?? [])] :
      runs.flatMap(run => [...run.avatars, ...run.loot]);
    const urls = [...new Set(assets.flatMap(item => item.icon ?? []))].filter(url => !icons.has(url));
    for (let start = 0; start < urls.length; start += 8) {
      options.signal?.throwIfAborted();
      await Promise.all(urls.slice(start, start + 8).map(async url => icons.set(url, await artwork(fetchZzzOfficialArtwork(url, options.signal)))));
    }
    const portraits = new Map<ZzzShiyuPortrait, Image | undefined>();
    await Promise.all(runs.flatMap(run => run.avatars.map(entry => loadChallengePortrait(entry, false, local, async url => icons.get(url), portraits))));
    options.signal?.throwIfAborted();
    if (snapshot.kind === "summary") {
      output.push(await renderZenkovSummary(snapshot, role, art, player, options.inlineImageByteLimit));
      continue;
    }
    const followUp = index === pages.length - 1 ? zzzZenkovFollowUp(snapshot, command, pages.length) : undefined;
    const recordsHeight = 108 + runs.reduce((sum, run) => sum + recordHeight(run) + 11, 0) + (followUp ? 29 : 0);
    const height = 280 + mapsHeight(snapshot) + recordsHeight;
    const rendered = await renderZzzBattlePng(width, height, ctx => {
      box(ctx, "#1d1a24", 0, 0, width, height);
      const background = art.local.get("common/images/bg.jpg");
      if (background) cover(ctx, background, 0, 0, width, height);
      drawZzzCardPlayer(ctx, role, snapshot.region, player);
      label(ctx, $t("zenkov-card.text_39e129ae70"), 420, 184, 42, { align: "center", weight: 700 });
      maps(ctx, art, snapshot, 224);
      let y = 244 + mapsHeight(snapshot);
      section(ctx, y, recordsHeight, $t("zenkov-card.text_ed413f2c05", { "totalRecords": snapshot.totalRecords }));
      if (snapshot.pageCount > 1) label(ctx, `${snapshot.firstPage + index} / ${snapshot.pageCount}`, 770, y + 38, 20,
        { align: "right", color: gray });
      y += 70;
      if (!runs.length) label(ctx, $t("zenkov-card.text_83c0de6903"), 420, y, 22, { align: "center", color: gray });
      const renderedArt = { ...art, portraits };
      for (const run of runs) {
        drawRun(ctx, renderedArt, run, y);
        y += recordHeight(run) + 11;
      }
      if (followUp) label(ctx, followUp, 62, y + 17, 22, { color: gold, maxWidth: 700 });
      label(ctx, zzzCardFooter, 420, height - 17, 15, { align: "center", color: "#fff" });
    }, 4, options.inlineImageByteLimit, { allowHalfScale: true }).catch((error: unknown) => {
      if (!(error instanceof ZzzInlineImageLimitError)) throw error;
      const page = { ...snapshot, firstPage: snapshot.firstPage + index, records: runs };
      return `${error.message}\n${zzzZenkovText(page, command)}`;
    });
    output.push(rendered);
  }
  return output;
}

const summaryWidth = 590;
const summaryInset = 33;
const summaryRight = summaryWidth - summaryInset;
const summaryGap = 24;

function overviewFrame(ctx: Context, y: number, height: number) {
  fillRound(ctx, "#0009", 0, y, summaryWidth, height, 24);
  ctx.beginPath();
  ctx.roundRect(4.5, y + 4.5, summaryWidth - 9, height - 9, 19.5);
  ctx.lineWidth = 9;
  ctx.strokeStyle = "#444";
  ctx.stroke();
}

function overviewHeading(ctx: Context, text: string, x: number, y: number, size: number, align: CanvasTextAlign = "left") {
  label(ctx, text, x + 2, y + 3, size, { align, color: "#383434" });
  label(ctx, text, x, y, size, { align, color: "#e6e6e6" });
}

function overviewSeason(ctx: Context, art: Assets, snapshot: Summary, y: number) {
  const { season } = snapshot;
  overviewFrame(ctx, y, 212);
  const badge = `SEASON ${season?.id ?? "—"}`;
  const badgeWidth = measureZzzCardLabel(ctx, badge, 20.4, 700) + 28.6;
  fillRound(ctx, "#282929", 104.5 - badgeWidth / 2, y + 40, badgeWidth, 33, 16.5);
  label(ctx, badge, 104.5, y + 56.5, 20.4, { align: "center", weight: 700 });
  label(ctx, String(season?.level ?? "—"), 104.5, y + 111, 62.4, { align: "center", color: gold, weight: 700, maxWidth: 145 });
  label(ctx, $t("zenkov-card.text_9815726067"), 104.5, y + 159, 20.4, { align: "center", color: gray });
  box(ctx, "#3d3d3d", 200, y + 33, 1, 146);
  if (snapshot.seasonUnlocked === false) {
    fillRound(ctx, "#3a1e1ecc", 225, y + 33, 332, 99, 12, "#ff3b304d");
    label(ctx, $t("zenkov-card.text_308d62ba23"), 391, y + 82, 22.8, { color: "#ff3b30", align: "center" });
  } else {
    label(ctx, $t("zenkov-card.text_873b1e10a9"), 225, y + 46, 20.4, { color: gray });
    const stage = $t("zenkov-card.text_3ccf734617", { "value1": season?.stage ?? "—" });
    const stageWidth = measureZzzCardLabel(ctx, stage, 19.2) + 19.2;
    fillRound(ctx, "#282929", 225, y + 69, stageWidth, 30, 7);
    label(ctx, stage, 234.6, y + 84, 19.2);
    const quest = String(season?.quest?.current ?? "—");
    const questX = 237 + stageWidth;
    const questWidth = measureZzzCardLabel(ctx, quest, 25.2, 700);
    label(ctx, quest, questX, y + 84, 25.2, { color: gold, weight: 700 });
    label(ctx, `/${season?.quest?.total ?? "—"}`, questX + questWidth, y + 84, 25.2,
      { color: "#888", weight: 700 });
    drawIcon(ctx, art.local.get(coins), 225, y + 114, 20.4);
    label(ctx, $t("zenkov-card.text_543f2d3c25"), 251.5, y + 125, 20.4, { color: gray });
    label(ctx, `${season?.coin?.current ?? "—"}/${season?.coin?.total ?? "—"}`, 345, y + 125, 24, { color: gold, weight: 700, maxWidth: 212 });
  }
  label(ctx, $t("zenkov-card.text_4298212e3f", { "value1": season?.id ?? "—" }), 225, y + 166, 20.4, { color: gray });
  label(ctx, remaining(season?.remaining, false), summaryRight, y + 166, 22.8, { align: "right", color: "#e6e6e6", weight: 700 });
}

function overviewWeekly(ctx: Context, art: Assets, snapshot: Summary, y: number) {
  overviewFrame(ctx, y, 315);
  overviewHeading(ctx, $t("zenkov-card.text_adb2e9fbe0"), summaryInset, y + 54, 31.2);
  label(ctx, $t("zenkov-card.text_deff9fcd12", { "value1": remaining(snapshot.weeklyRemaining, true) }), summaryRight, y + 54, 21.6, { align: "right", color: gray });
  for (const [i, [key, value]] of weekly(snapshot).entries()) {
    const top = y + ([117, 183, 225, 266][i] ?? 0);
    label(ctx, key, summaryInset, top, i === 0 ? 24 : 22.8, { color: i === 0 ? gray : "#979797" });
    label(ctx, value, summaryRight, top, i === 0 ? 26.4 : 24, {
      color: i === 0 ? gold : "#e6e6e6", weight: i === 0 ? 700 : 400, align: "right", maxWidth: 265, ellipsis: false,
    });
    if (i === 1) {
      const valueWidth = Math.min(265, measureZzzCardLabel(ctx, value, 24));
      drawIcon(ctx, art.local.get(funds), summaryRight - valueWidth - 26.4, top - 10.8, 21.6);
    }
  }
  box(ctx, "#333", summaryInset, y + 147, summaryRight - summaryInset, 1);
}

function overviewRank(ctx: Context, art: Assets, rank: ZzzZenkovRank | undefined, y: number) {
  if (!rank?.percent) {
    label(ctx, rankText(rank), 485, y, 22.8, { align: "center", color: rank ? gold : gray, weight: rank ? 700 : 400, maxWidth: 141 });
    return;
  }
  const badge = art.local.get(`common/images/rank_bg/${rankBand(rank.value)}.png`);
  if (badge) contain(ctx, badge, 422.6, y - 21.6, 124.8, 43.2);
  else fillRound(ctx, gold, 425, y - 17, 120, 34, 9);
  label(ctx, rankText(rank), 470, y, 20.4, { align: "center", color: "#111", weight: 900 });
}

function overviewMaps(snapshot: Summary) {
  const rows = snapshot.maps.map(row => row.unlocked !== false && row.rank?.percent ? 68.2 : 57);
  if (!rows.length || snapshot.hiddenMaps) rows.push(57);
  const listHeight = rows.reduce((sum, height) => sum + height, 0) - 1;
  const footerHeight = snapshot.rank?.percent ? 56.2 : 44;
  const height = 151 + listHeight + 24 + footerHeight + 33;
  return { rows, listHeight, footerHeight, height };
}

function overviewMapTable(ctx: Context, art: Assets, snapshot: Summary, y: number, metrics: ReturnType<typeof overviewMaps>) {
  overviewFrame(ctx, y, metrics.height);
  overviewHeading(ctx, $t("zenkov-card.text_964dc6eedf"), summaryInset, y + 54, 31.2);
  for (const [i, key] of [$t("zenkov-card.text_41ab2e0ecb"), $t("zenkov-card.text_670575b685"), $t("zenkov-card.text_8d9f2691de"), $t("zenkov-card.text_b9467cfb61")].entries()) {
    label(ctx, key, [summaryInset, 259, 369.1, 492.2][i]!, y + 113, 21.6, { align: i ? "center" : "left", color: "#888" });
  }
  box(ctx, "#333", summaryInset, y + 139, summaryRight - summaryInset, 1);
  let top = y + 151;
  for (const [i, row] of snapshot.maps.entries()) {
    const height = metrics.rows[i]!;
    const mid = top + height / 2;
    label(ctx, row.name ?? "—", summaryInset, mid, 24, { color: row.unlocked === false ? "#666" : "#e6e6e6", maxWidth: row.unlocked === false ? 174 : 135 });
    if (row.unlocked === false) label(ctx, $t("zenkov-card.text_308d62ba23"), summaryRight, mid, 21.6, { color: "#666", align: "right" });
    else {
      label(ctx, pct(row.evacuation), 225.8, mid, 24, { align: "center", color: "#4cd964" });
      label(ctx, amount(row.price), 348.2, mid, 24, { align: "center", color: gold, maxWidth: 130, ellipsis: false });
      overviewRank(ctx, art, row.rank, mid);
    }
    top += height;
    if (i < metrics.rows.length - 1) {
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(summaryInset, top - 0.5);
      ctx.lineTo(summaryRight, top - 0.5);
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }
  if (!snapshot.maps.length) label(ctx, $t("zenkov-card.text_69d17d5308"), 295, top + 28, 24, { align: "center", color: gray });
  else if (snapshot.hiddenMaps) label(ctx, $t("zenkov-card.text_a500b5268a", { "hiddenMaps": snapshot.hiddenMaps }), summaryInset, top + 28, 21.6, { color: gray });
  const rankTop = y + 151 + metrics.listHeight + 24;
  box(ctx, "#333", summaryInset, rankTop, summaryRight - summaryInset, 1);
  const rankMid = rankTop + 13 + (metrics.footerHeight - 13) / 2;
  label(ctx, $t("zenkov-card.text_5cc9dc86ae"), summaryInset, rankMid, 22.8, { color: gray });
  overviewRank(ctx, art, snapshot.rank, rankMid);
}

function collectionLayout(view: Collection, medal: boolean) {
  const size = medal ? 84 : (summaryRight - summaryInset - 5 * 14.4) / 6;
  const gap = medal ? 19.2 : 14.4;
  const rows = Math.ceil(view.items.length / (medal ? 5 : 6));
  const height = 46.4 + (rows ? rows * (size + gap) - gap : 0) + (view.hiddenItems ? 30 : 0);
  return { size, gap, height };
}

function overviewCollection(ctx: Context, art: Assets, view: Collection, y: number, medal: boolean) {
  const { size, gap, height } = collectionLayout(view, medal);
  label(ctx, medal ? $t("zenkov-card.text_133fdb2ff0") : $t("zenkov-card.text_9805f5c158"), summaryInset, y + 16, 24, { color: "#ccc" });
  label(ctx, progress(view), summaryRight, y + 16, 21.6, { align: "right", color: gold });
  const cols = medal ? 5 : 6, step = size + gap;
  for (const [i, item] of view.items.entries()) {
    const x = summaryInset + (i % cols) * step;
    const top = y + 46.4 + Math.floor(i / cols) * step;
    ctx.save();
    if (item.unlocked === false) {
      ctx.globalAlpha = medal ? 0.4 : 0.35;
      ctx.filter = medal ? "grayscale(80%)" : "grayscale(90%)";
    }
    const tile = medal ? undefined : art.local.get(lootPlain);
    if (tile) ctx.drawImage(tile, x, top, size, size);
    else fillRound(ctx, "#222", x + 0.5, top + 0.5, size - 1, size - 1, 12, "#444");
    const icon = item.icon && art.icons.get(item.icon);
    if (icon) contain(ctx, icon, x + size * 0.1, top + size * 0.1, size * 0.8, size * 0.8);
    else if (item.name) label(ctx, item.name, x + size / 2, top + size / 2, 15, { align: "center", maxWidth: size - 8 });
    if (!medal && item.count && item.count > 0) {
      const text = String(item.count), badge = Math.min(size, measureZzzCardLabel(ctx, text, 18) + 12.6);
      fillRound(ctx, "#000a", x + size - badge, top + size - 25.2, badge, 25.2, 5);
      label(ctx, text, x + size - badge / 2, top + size - 12.6, 18, { align: "center", maxWidth: badge });
    }
    ctx.restore();
  }
  if (view.hiddenItems) label(ctx, $t("zenkov-card.text_ca88e64e61", { "hiddenItems": view.hiddenItems }), summaryInset, y + height - 15, 18, { color: gray });
}

async function renderZenkovSummary(snapshot: Summary, role: GameRole, art: Assets,
  player: Awaited<ReturnType<typeof loadZzzCardPlayer>>, inlineImageByteLimit?: number) {
  const mapsTop = 273.8 + 212.4 + summaryGap + 315.4 + summaryGap;
  const mapMetrics = overviewMaps(snapshot);
  const collectionTop = mapsTop + mapMetrics.height + summaryGap;
  const views = [snapshot.medals, snapshot.goods].flatMap((view, index) => view ? [{ view, medal: index === 0 }] : []);
  const collectionHeight = 99 + views.reduce((sum, { view, medal }) => sum + collectionLayout(view, medal).height, 0)
    + summaryGap * Math.max(0, views.length - 1) + summaryInset;
  const contentEnd = views.length ? collectionTop + collectionHeight : mapsTop + mapMetrics.height;
  const height = Math.floor(contentEnd + 103.6);
  return renderZzzBattlePng(summaryWidth, height, ctx => {
    box(ctx, "#1d1a24", 0, 0, summaryWidth, height);
    const background = art.local.get("common/images/bg.jpg");
    if (background) cover(ctx, background, 0, 0, summaryWidth, height);
    ctx.save();
    ctx.translate(-48, 24);
    drawZzzCardPlayer(ctx, role, snapshot.region, player, summaryRight + 48);
    ctx.restore();
    overviewHeading(ctx, $t("zenkov-card.text_0a991a8e6c"), summaryWidth / 2, 217, 48, "center");
    overviewSeason(ctx, art, snapshot, 273.8);
    overviewWeekly(ctx, art, snapshot, 510.2);
    overviewMapTable(ctx, art, snapshot, mapsTop, mapMetrics);
    if (views.length) {
      overviewFrame(ctx, collectionTop, collectionHeight);
      overviewHeading(ctx, $t("zenkov-card.text_008e539a00"), summaryInset, collectionTop + 54, 31.2);
      let top = collectionTop + 99;
      for (const { view, medal } of views) {
        overviewCollection(ctx, art, view, top, medal);
        top += collectionLayout(view, medal).height + summaryGap;
      }
    }
    label(ctx, zzzCardFooter, summaryWidth / 2, height - 45, 16.8, { align: "center", color: "#fff" });
  }, 4, inlineImageByteLimit, { allowHalfScale: true });
}
