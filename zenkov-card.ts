import type { GameRole } from "@lotus-yunzai/account";
import { zzzZenkovPageSize as pageSize, type ZzzShiyuPortrait, type ZzzZenkovItem, type ZzzZenkovRank,
  type ZzzZenkovRun, type ZzzZenkovSnapshot } from "@lotus-yunzai/hoyo-client";
import { renderPng } from "@lotus-yunzai/skia";
import type { CanvasRenderingContext2D as Context, Image } from "skia-canvas";
import { artwork, box, cover, drawZzzCardPlayer, label, loadZzzCardPlayer, openZzzCardTheme, zzzCardFooter,
  type ZzzCardOptions } from "./card-theme.ts";
import { contain, drawPortrait, fillRound, loadChallengePortrait, rankBand, type ZzzChallengeArt } from "./challenge-card.ts";
import { fetchZzzOfficialArtwork } from "./tuning-artwork.ts";

type Summary = Extract<ZzzZenkovSnapshot, { kind: "summary" }>;
type Collection = NonNullable<Summary["medals"]>;
type Assets = ZzzChallengeArt & { readonly icons: ReadonlyMap<string, Image | undefined> };
type Row = readonly [string, string];

export function zzzZenkovFollowUp(snapshot: ZzzZenkovSnapshot, command: string, renderedPages: number) {
  if (snapshot.kind === "detail" && snapshot.firstPage + renderedPages <= snapshot.pageCount) {
    return `下一页 ${command} 页 ${snapshot.firstPage + renderedPages}`;
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
  if (!weekly) return `${days}天`;
  return `${String(days).padStart(2, "0")}天${String(Math.floor(seconds / 3600) % 24).padStart(2, "0")}时`;
}
function duration(seconds?: number) {
  if (seconds === undefined) return "—";
  const [hour, minute, second] = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  return (hour ? [hour, minute, second] : [minute, second]).map(v => String(v).padStart(2, "0")).join(":");
}
function outcome(value?: boolean) {
  return value === undefined ? "撤离结果未知" : value ? "撤离成功" : "撤离失败";
}
function weekly(snapshot: Summary): readonly Row[] {
  return [["进度", progress(snapshot.duty)], ["累计带出", amount(snapshot.carryValue)],
    ["Z级贵重物品获取次数", String(snapshot.zGrade ?? "—")],
    ["百万撤离次数", String(snapshot.millionEvacuations ?? "—")]];
}

export function zzzZenkovText(snapshot: ZzzZenkovSnapshot, command: string) {
  const maps = ["地图-高危模式", ...snapshot.maps.slice(0, 8).map(row => `${row.name ?? "地图"} · ${row.unlocked === false ?
    "未解锁" : `${pct(row.evacuation)} · ${amount(row.price)} · ${rankText(row.rank)}`}`),
    `本赛季最高排名 ${rankText(snapshot.rank)}`];
  if (snapshot.maps.length + snapshot.hiddenMaps > 8) maps.push(`另有 ${snapshot.maps.length + snapshot.hiddenMaps - 8} 张地图`);
  if (snapshot.kind === "detail") {
    const runs = snapshot.records.slice(0, pageSize).map(row => `${row.map ?? "地图"} · ${row.started ?? "—"} · ${row.difficulty ?? "—"}\n` +
      `${outcome(row.success)} · ${duration(row.seconds)} · 累计带出 ${amount(row.value)}`);
    const followUp = zzzZenkovFollowUp(snapshot, command, 1);
    return ["迷宫诡域战绩", ...maps, `探索记录 ${snapshot.firstPage} / ${snapshot.pageCount}`, ...runs,
      ...(followUp ? [followUp] : [])].join("\n");
  }
  const { season, seasonUnlocked } = snapshot;
  return ["迷宫诡域", `第 ${season?.id ?? "—"} 赛季 · 等级 ${season?.level ?? "—"} · 剩余 ${remaining(season?.remaining, false)}`,
    seasonUnlocked === false ? "赛季委托未解锁" : `阶段 ${season?.stage ?? "—"} · 委托 ${progress(season?.quest)} · 获取上限 ${progress(season?.coin)}`,
    `周常委托 · 剩余 ${remaining(snapshot.weeklyRemaining, true)}`, ...weekly(snapshot).map(row => row.join(" ")), ...maps,
    ...(snapshot.medals ? [`勋章墙 ${progress(snapshot.medals)}`] : []), ...(snapshot.goods ? [`收藏展示 ${progress(snapshot.goods)}`] : [])].join("\n");
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
  section(ctx, y, mapsHeight(snapshot), "地图-高危模式");
  for (const [i, column] of ["地图", "撤离率", "最高带出", "最高排名"].entries()) {
    const x = [62, 337, 531, 705][i]!;
    label(ctx, column, x, y + 79, 19, { align: i === 0 ? "left" : "center", color: gray });
  }
  box(ctx, "#333", 58, y + 97, 725, 2);
  if (!snapshot.maps.length) label(ctx, "暂无地图记录", 420, y + 126, 21, { align: "center", color: gray });
  for (const [i, row] of snapshot.maps.entries()) {
    const top = y + 123 + i * 46;
    label(ctx, row.name ?? "—", 62, top, 22, { color: row.unlocked === false ? "#666" : "#e6e6e6", maxWidth: 242 });
    if (row.unlocked === false) label(ctx, "未解锁", 531, top, 21, { color: "#888", align: "center" });
    else {
      label(ctx, pct(row.evacuation), 337, top, 21, { align: "center", color: "#4cd964" });
      label(ctx, amount(row.price), 531, top, 21, { align: "center", color: gold, maxWidth: 165 });
      drawRank(ctx, art, row.rank, 705, top);
    }
    box(ctx, "#303030", 58, top + 22, 725, 1);
  }
  if (snapshot.hiddenMaps) label(ctx, `另有 ${snapshot.hiddenMaps} 张地图`, 62, y + 123 + snapshot.maps.length * 46, 19, { color: gray });
  const bottom = y + mapsHeight(snapshot) - 25;
  label(ctx, "本赛季最高排名", 62, bottom, 20, { color: gray });
  drawRank(ctx, art, snapshot.rank, 705, bottom);
}

function lootTile(ctx: Context, art: Assets, item: ZzzZenkovItem, x: number, y: number, size: number, kind: "medal" | "goods" | "loot") {
  ctx.save();
  if (item.unlocked === false) ctx.globalAlpha = 0.4;
  const path = kind === "goods" ? lootPlain : item.rarity === 5 ? lootGold : item.rarity === 4 ? lootPurple :
    item.rarity === 3 ? lootPlain : undefined;
  const tile = path && art.local.get(path);
  if (tile) ctx.drawImage(tile, x, y, size, size);
  else if (kind === "medal") fillRound(ctx, "#222", x, y, size, size, 8, "#444");
  const icon = item.icon && art.icons.get(item.icon);
  if (icon) contain(ctx, icon, x + 6, y + 5, size - 12, size - 11);
  else if (item.name) label(ctx, item.name, x + size / 2, y + size / 2, 15, { align: "center", maxWidth: size - 5 });
  if (kind === "goods" && item.count && item.count > 0) {
    fillRound(ctx, "#000a", x + size - 32, y + size - 24, 29, 21, 5);
    label(ctx, String(item.count), x + size - 16, y + size - 13, 15, { align: "center", maxWidth: 27 });
  }
  ctx.restore();
}

function collectionSize(view: Collection, medal: boolean) {
  return 52 + Math.ceil(view.items.length / (medal ? 8 : 6)) * (medal ? 81 : 114) + (view.hiddenItems ? 26 : 0);
}

function collection(ctx: Context, art: Assets, view: Collection, y: number, medal: boolean) {
  label(ctx, medal ? "勋章墙" : "收藏展示", 62, y + 22, 22, { color: gray });
  label(ctx, progress(view), 771, y + 22, 21, { align: "right", color: gold });
  const cols = medal ? 8 : 6, slot = medal ? 92 : 123, stride = medal ? 81 : 114, size = medal ? 69 : 96;
  for (const [i, item] of view.items.entries()) {
    lootTile(ctx, art, item, 61 + i % cols * slot, y + 47 + Math.floor(i / cols) * stride, size, medal ? "medal" : "goods");
  }
  if (view.hiddenItems) label(ctx, `另有 ${view.hiddenItems} 项`, 62, y + collectionSize(view, medal) - 16, 18, { color: gray });
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
  label(ctx, `探索时长 ${duration(run.seconds)}`, 64, y + 110, 18, { color: gray });
  drawIcon(ctx, art.local.get(funds), 502, y + 67, 24);
  label(ctx, amount(run.value), 762, y + 80, 24, { align: "right", color: gold, maxWidth: 229 });
  for (const [i, entry] of run.avatars.entries()) drawPortrait(ctx, art, entry, 65 + i * 82, y + 133, 68);
  fillRound(ctx, "#0006", 320, y + 106, 448, recordHeight(run) - 118, 7, "#383838");
  label(ctx, "调查收获", 332, y + 127, 19, { color: gray });
  if (!run.loot.length) label(ctx, "—", 333, y + 167, 20, { color: gray });
  for (const [i, item] of run.loot.entries()) lootTile(ctx, art, item, 330 + i % 9 * 47, y + 147 + Math.floor(i / 9) * 50, 43, "loot");
  if (run.hiddenLoot) label(ctx, `另有 ${run.hiddenLoot} 项`, 332, y + recordHeight(run) - 24, 15, { color: gray });
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

  const output = [];
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
    const renderedArt = { ...art, portraits };
    const summaryCollection = snapshot.kind === "summary" && (snapshot.medals || snapshot.goods) ?
      72 + (snapshot.medals ? collectionSize(snapshot.medals, true) : 0) + (snapshot.goods ? collectionSize(snapshot.goods, false) : 0) : 0;
    const followUp = index === pages.length - 1 ? zzzZenkovFollowUp(snapshot, command, pages.length) : undefined;
    const recordsHeight = 108 + runs.reduce((sum, run) => sum + recordHeight(run) + 11, 0) + (followUp ? 29 : 0);
    const height = 280 + mapsHeight(snapshot) + (snapshot.kind === "summary" ? 478 + summaryCollection : recordsHeight);
    output.push(await renderPng(width * 2, height * 2, ctx => {
      ctx.scale(2, 2);
      box(ctx, "#1d1a24", 0, 0, width, height);
      const background = art.local.get("common/images/bg.jpg");
      if (background) cover(ctx, background, 0, 0, width, height);
      drawZzzCardPlayer(ctx, role, snapshot.region, player);
      label(ctx, snapshot.kind === "summary" ? "迷宫诡域" : "迷宫诡域战绩", 420, 184, 42, { align: "center", weight: 700 });
      let y = 224;
      if (snapshot.kind === "summary") {
        drawSummary(ctx, art, snapshot, y);
        y += 457;
      }
      maps(ctx, art, snapshot, y);
      y += mapsHeight(snapshot) + 20;
      if (snapshot.kind === "summary" && summaryCollection) {
        section(ctx, y, summaryCollection, "珍品图鉴");
        y += 57;
        if (snapshot.medals) {
          collection(ctx, art, snapshot.medals, y, true);
          y += collectionSize(snapshot.medals, true);
        }
        if (snapshot.goods) collection(ctx, art, snapshot.goods, y, false);
      } else if (snapshot.kind === "detail") {
        section(ctx, y, recordsHeight, `探索记录 · 共 ${snapshot.totalRecords} 场`);
        if (snapshot.pageCount > 1) label(ctx, `${snapshot.firstPage + index} / ${snapshot.pageCount}`, 770, y + 38, 20,
          { align: "right", color: gray });
        y += 70;
        if (!runs.length) label(ctx, "暂无探索记录", 420, y, 22, { align: "center", color: gray });
        for (const run of runs) {
          drawRun(ctx, renderedArt, run, y);
          y += recordHeight(run) + 11;
        }
        if (followUp) label(ctx, followUp, 62, y + 17, 22, { color: gold, maxWidth: 700 });
      }
      label(ctx, zzzCardFooter, 420, height - 17, 15, { align: "center", color: "#a09ca3" });
    }, "gpu"));
  }
  return output;
}

function drawSummary(ctx: Context, art: Assets, snapshot: Summary, y: number) {
  const { season } = snapshot;
  fillRound(ctx, "#0009", 29, y, 782, 164, 17, "#444");
  fillRound(ctx, "#282929", 60, y + 26, 205, 28, 6);
  label(ctx, `SEASON ${season?.id ?? "—"}`, 163, y + 40, 18, { align: "center" });
  label(ctx, String(season?.level ?? "—"), 163, y + 86, 41, { align: "center", color: gold, weight: 700 });
  label(ctx, "赛季等级", 163, y + 130, 21, { align: "center", color: gray });
  box(ctx, "#3d3d3d", 281, y + 19, 2, 123);
  if (snapshot.seasonUnlocked === false) {
    fillRound(ctx, "#3a1e1ecc", 310, y + 25, 94, 31, 5);
    label(ctx, "未解锁", 356, y + 39, 18, { align: "center", color: "#ff665e" });
  } else {
    label(ctx, `赛季委托 · 阶段 ${season?.stage ?? "—"}`, 310, y + 37, 22, { color: gray });
    label(ctx, progress(season?.quest), 769, y + 37, 23, { align: "right", color: gold });
    drawIcon(ctx, art.local.get(coins), 311, y + 66, 25);
    label(ctx, "获取上限", 345, y + 80, 21, { color: gray });
    label(ctx, progress(season?.coin), 769, y + 80, 23, { align: "right", color: gold });
  }
  box(ctx, "#333", 308, y + 105, 462, 1);
  label(ctx, `第 ${season?.id ?? "—"} 赛季委托`, 310, y + 130, 21, { color: gray });
  label(ctx, remaining(season?.remaining, false), 769, y + 130, 23, { align: "right" });
  y += 184;
  section(ctx, y, 252, "周常委托");
  label(ctx, `本周剩余时间 ${remaining(snapshot.weeklyRemaining, true)}`, 770, y + 38, 20, { align: "right", color: gray });
  for (const [i, [name, value]] of weekly(snapshot).entries()) {
    const top = y + 86 + i * 45;
    label(ctx, name, 63, top, 22, { color: gray });
    if (i === 1) drawIcon(ctx, art.local.get(funds), 495, top - 12, 24);
    label(ctx, value, 772, top, 24, { align: "right", color: i < 2 ? gold : "#e6e6e6", maxWidth: 242 });
    box(ctx, "#303030", 59, top + 23, 720, 1);
  }
}
