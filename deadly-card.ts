import type { ZzzDeadlyRoom, ZzzDeadlySnapshot, ZzzShiyuPortrait } from "@lotus-yunzai/hoyo-client";
import { renderPng } from "@lotus-yunzai/skia";
import type { CanvasRenderingContext2D as Context, Image } from "skia-canvas";
import { artwork, box, cover, label, openZzzCardTheme, zzzCardFooter, type ZzzCardOptions } from "./card-theme.ts";
import { contain, drawPortrait, fillRound, frame, loadChallengePortrait, rankBand, type ZzzChallengeArt } from "./challenge-card.ts";
import { fetchZzzOfficialArtwork } from "./tuning-artwork.ts";

const width = 840;
const trialHeight = 338.03;
const hardHeight = 359.03;
const firstRoom = 347.95;
const dateLabel = (value: string) => value.slice(0, 10).replaceAll("-", ".") + value.slice(10);
type Art = ZzzChallengeArt & { readonly images: ReadonlyMap<string, Image | undefined> };

function theme(art: Art, name: string) {
  return art.local.get(`deadly/images/${name}.png`);
}

function drawPercent(context: Context, art: Art, points: number | undefined, x: number, y: number) {
  if (points === undefined) return;
  const icon = art.local.get(`common/images/rank_bg/${rankBand(points)}.png`);
  if (icon) contain(context, icon, x, y - 30, 132, 60);
  else fillRound(context, "#c67ab2", x, y - 16, 122, 32, 14);
  label(context, `${(points / 100).toFixed(2)}%`, x + 53, y, 21.6, { color: "#222", align: "center" });
}

function drawScore(context: Context, art: Art, score: number | undefined, cap: 195000 | 65000, x: number, y: number) {
  const badge = score === cap && art.local.get(`common/images/max_score/${cap}.png`);
  if (badge) {
    const w = cap === 195000 ? 156 : 132;
    const h = cap === 195000 ? 50.4 : 51;
    contain(context, badge, x, y - h / 2, w, h);
    return w;
  }
  const text = String(score ?? "—");
  label(context, text, x, y, 38.4, { color: "#d9d7da", maxWidth: 202 });
  return Math.min(202, context.measureText(text).width);
}

function star(context: Context, art: Art, x: number, y: number, kind: "lit" | "blank" | "hard", size = 34.5) {
  const image = theme(art, kind === "lit" ? "star-icon-light" : kind === "hard" ? "star-icon-hard.13c9ee51" : "star-icon-dark");
  if (image) contain(context, image, x, y - size / 2, size, size);
  else label(context, kind === "blank" ? "☆" : "★", x + size / 2, y, size * 0.72,
    { color: kind === "blank" ? "#6b696f" : kind === "hard" ? "#ff663f" : "#fbd73b", align: "center" });
}

function drawOverview(context: Context, art: Art, snapshot: ZzzDeadlySnapshot, nickname: string) {
  const panel = theme(art, "block-bg-m");
  if (panel) context.drawImage(panel, 36, 36, 768, 195.2);
  else fillRound(context, "#252032", 36, 36, 768, 195.2, 18, "#493c52");
  const avatar = snapshot.avatar && art.images.get(snapshot.avatar);
  context.save();
  context.beginPath();
  context.arc(103.2, 104.8, 14.4, 0, Math.PI * 2);
  context.clip();
  if (avatar) cover(context, avatar, 88.8, 90.4, 28.8, 28.8);
  else box(context, "#3c313f", 88.8, 90.4, 28.8, 28.8);
  context.restore();
  label(context, snapshot.nickname || nickname || "绳匠", 122.4, 105.3, 24, { maxWidth: 600 });

  const scoreWidth = drawScore(context, art, snapshot.totalScore, 195000, 88.8, 159.5);
  drawPercent(context, art, snapshot.trialRank, 112.8 + scoreWidth, 158);
  if (snapshot.totalStars !== undefined) {
    const x = snapshot.totalStars > 9 ? 665 : 676.9;
    star(context, art, x, 158, "lit", 36);
    label(context, `x${snapshot.totalStars}`, x + 43.2, 158, 24);
  }
}

function drawBoss(context: Context, art: Art, room: ZzzDeadlyRoom, y: number) {
  const x = 64.8, w = 192.4, h = 264;
  fillRound(context, "#202024", x, y, w, h, 13, "#5e5a60");
  context.save();
  context.beginPath();
  context.roundRect(x + 2.4, y + 2.4, w - 4.8, h - 4.8, 10);
  context.clip();
  const background = room.bossBackground && art.images.get(room.bossBackground);
  const boss = room.bossIcon && art.images.get(room.bossIcon);
  if (background) cover(context, background, x, y, w, h);
  if (boss) cover(context, boss, x, y, w, h);
  const race = room.raceIcon && art.images.get(room.raceIcon);
  if (race) contain(context, race, x + w - 79, y + h - 79, 72, 72);
  context.restore();
}

function drawRoom(context: Context, art: Art, room: ZzzDeadlyRoom, y: number, rank: number | undefined, hard: boolean) {
  const h = hard ? hardHeight : trialHeight;
  frame(context, theme(art, "BgFrame01"), 24, y, 792, h);
  if (hard) {
    const accent = theme(art, "hard-module-inner-bg-m.83b7d1a1");
    if (accent) context.drawImage(accent, 31.2, y + 7.2, 777.6, h - 14.4);
    else fillRound(context, "#781e2828", 31.2, y + 7.2, 777.6, h - 14.4, 10);
  }
  if (room.buffIcon || room.buffName) {
    const buffFrame = theme(art, "PetSelectBG");
    if (buffFrame) context.drawImage(buffFrame, 756, y, 60, 60);
    const buff = room.buffIcon && art.images.get(room.buffIcon);
    if (buff) contain(context, buff, 763.2, y + 7.2, 45.6, 45.6);
    else label(context, "增益", 786, y + 30, 15, { align: "center", color: "#d3b8ea" });
  }

  drawBoss(context, art, room, y + 36);
  const left = 286;
  const title = room.name || "首领";
  const titleWidth = hard && rank !== undefined ? 323 : 457;
  label(context, title, left, y + (hard ? 66 : 55.5), 28.8, { color: "#d9d7da", maxWidth: titleWidth });
  if (hard) drawPercent(context, art, rank, left + 12 + Math.min(titleWidth, context.measureText(title).width), y + 66);
  const offset = hard ? 21 : 0;
  const scoreWidth = drawScore(context, art, room.score, 65000, left, y + offset + 106.65);
  const stars = room.stars ?? 0;
  for (let index = 0; index < (room.availableStars ?? stars); index++) {
    star(context, art, left + scoreWidth + 6 + index * 24.9, y + offset + 106.65, index >= stars ? "blank" : hard ? "hard" : "lit");
  }
  label(context, `通关时刻：${room.clearedAt ? dateLabel(room.clearedAt) : "—"}`, left, y + offset + 157.1, 19.2, { color: "#979797" });
  room.avatars.forEach((entry, index) => drawPortrait(context, art, entry, left + index * 134.82, y + offset + 186.4, 110.8));
  drawPortrait(context, art, room.buddy, left + 404.45, y + offset + 219.7, 77.55, true);
}

async function loadDeadlyArt(snapshot: ZzzDeadlySnapshot, local: Awaited<ReturnType<typeof openZzzCardTheme>>, signal?: AbortSignal): Promise<Art> {
  const paths = [
    "common/images/bg.jpg",
    ...["block-bg-m", "BgFrame01", "PetSelectBG", "hard-module-inner-bg-m.83b7d1a1",
      "star-icon-light", "star-icon-dark", "star-icon-hard.13c9ee51"].map(name => `deadly/images/${name}.png`),
    ...["S", "A", "B"].map(name => `common/images/RANK_${name}.png`),
    ...[1, 2, 3, 4, 5].map(index => `common/images/rank_bg/${index}.png`),
    ...[65000, 195000].map(score => `common/images/max_score/${score}.png`),
  ];
  const promises = new Map<string, Promise<Image | undefined>>();
  const images = new Map<string, Image | undefined>();
  const portraits = new Map<ZzzShiyuPortrait, Image | undefined>();
  function official(url: string) {
    let loaded = promises.get(url);
    if (!loaded) {
      loaded = artwork(fetchZzzOfficialArtwork(url, signal));
      promises.set(url, loaded);
    }
    return loaded;
  }
  async function storeImage(url: string | undefined) {
    if (url) images.set(url, await official(url));
  }

  const loadRooms = async () => {
    const rooms = [...snapshot.hard, ...snapshot.trial];
    for (const room of rooms) {
      if (signal?.aborted) return;
      await Promise.all([
        storeImage(room.bossIcon), storeImage(room.bossBackground), storeImage(room.raceIcon), storeImage(room.buffIcon),
        ...room.avatars.map(entry => loadChallengePortrait(entry, false, local, official, portraits)),
        loadChallengePortrait(room.buddy, true, local, official, portraits),
      ]);
    }
  };
  const [loaded] = await Promise.all([Promise.all(paths.map(async path => [path, await local(path)] as const)),
    storeImage(snapshot.avatar), loadRooms()]);
  return { local: new Map(loaded), images, portraits };
}

// Skia adaptation of ZZZure/ZZZ-Plugin 2057599 resources/deadly/index.html and index.css.
export async function renderZzzDeadly(snapshot: ZzzDeadlySnapshot, nickname: string, options: ZzzCardOptions = {}) {
  const themeFiles = await openZzzCardTheme(options);
  const art = await loadDeadlyArt(snapshot, themeFiles, options.signal);
  options.signal?.throwIfAborted();
  const footer = firstRoom + snapshot.hard.length * (hardHeight + 24) + snapshot.trial.length * (trialHeight + 24);
  const height = Math.ceil(footer + 177.6);
  return renderPng(width * 4, height * 4, (context) => {
    context.scale(4, 4);
    box(context, "#1a181c", 0, 0, width, height);
    const background = art.local.get("common/images/bg.jpg");
    if (background) cover(context, background, 0, 0, width, height);
    drawOverview(context, art, snapshot, nickname);
    const period = snapshot.period;
    label(context, `统计周期 ${period ? `${dateLabel(period.start.slice(0, 10))} - ${dateLabel(period.end.slice(0, 10))}` : "暂无记录"}`,
      43.2, 280.2, 19.2, { color: "#979797" });
    label(context, "*总得分与排名先更新，挑战详情约延迟 2 小时", 43.2, 316.2, 19.2, { color: "#979797" });

    let row = firstRoom;
    for (const room of snapshot.hard) {
      drawRoom(context, art, room, row, snapshot.hardRank, true);
      row += hardHeight + 24;
    }
    for (const room of snapshot.trial) {
      drawRoom(context, art, room, row, undefined, false);
      row += trialHeight + 24;
    }
    frame(context, theme(art, "BgFrame01"), 24, footer, 792, 98);
    const caption = options.rankVisibility === undefined ? (snapshot.scheduleType === 2 ? "危局强袭战 · 上期个人战绩" : "危局强袭战 · 本期个人战绩") :
      `本群危局强袭战排名：${options.rankVisibility ? "显示" : "隐藏"}，可用 %显示危局排名 或 %隐藏危局排名 切换`;
    label(context, caption,
      width / 2, footer + 49, 19.2, { align: "center", weight: 700 });
    label(context, zzzCardFooter, width / 2, height - 42, 17, { color: "#a09ca3", align: "center" });
  }, "gpu");
}
