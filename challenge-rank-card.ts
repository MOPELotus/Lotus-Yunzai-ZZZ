import type { ZzzDeadlyRoom, ZzzHoloBossRoom, ZzzShiyuPortrait, ZzzShiyuTeam } from "@lotus-yunzai/hoyo-client";
import { renderPng } from "@lotus-yunzai/skia";
import type { CanvasRenderingContext2D as Context, Image } from "skia-canvas";
import { artwork, box, cover, label, openZzzCardTheme, zzzCardFooter, type ZzzCardOptions } from "./card-theme.ts";
import { contain, drawPortrait, fillRound, frame, loadChallengePortrait, type ZzzChallengeArt } from "./challenge-card.ts";
import { holoBossDuration } from "./holo-boss-card.ts";
import { rankLabels, type RankMode, type RankRow } from "./challenge-rank-model.ts";
import { fetchZzzOfficialArtwork, fetchZzzQqAvatar } from "./tuning-artwork.ts";

const modeTheme = { ABYSS: "abyss", DEADLY: "deadly", DEADLY_HARD: "deadlyHard", HOLO_BOSS: "holoBoss" } as const;
const englishTitle = { ABYSS: "ABYSS RANK", DEADLY: "DEADLY RANK", DEADLY_HARD: "DEADLY HARD RANK", HOLO_BOSS: "HOLO BOSS RANK" } as const;
type Art = ZzzChallengeArt & {
  readonly memberAvatars: ReadonlyMap<string, Image | undefined>;
  readonly buffIcons: ReadonlyMap<string, Image | undefined>;
};

function theme(art: Art, mode: RankMode, image: string) {
  return art.local.get(`rank/${modeTheme[mode]}/images/${image}.png`);
}

function heading(context: Context, mode: RankMode, width: number) {
  context.save();
  context.transform(1, 0, -0.14, 1, 60 * 0.14, 0);
  label(context, englishTitle[mode], width / 2, 56, 65, { color: "#ffffff20", align: "center", weight: 800 });
  context.restore();
  context.beginPath();
  for (const left of [82, width - 293]) {
    for (let i = 0; i < 8; i++) {
      const x = left + 26.4 * i;
      context.moveTo(x + 17, 50);
      context.lineTo(x + 31, 50);
      context.lineTo(x + 14, 81);
      context.lineTo(x, 81);
      context.closePath();
    }
  }
  context.fillStyle = "#f6ca45";
  context.fill();
  label(context, `${rankLabels[mode]}排名`, width / 2, 61, 36, { align: "center" });
}

function badgeRating(context: Context, art: Art, rating: string | undefined, x: number, y: number) {
  if (!rating) return;
  const asset = art.local.get(`common/images/rating/${rating.replace("+", "P")}.png`);
  if (asset) contain(context, asset, x, y, 90, 60);
  else label(context, rating, x + 45, y + 30, 33, { align: "center", color: "#f9cc56" });
}

function score(context: Context, art: Art, value: number | undefined, cap: number, x: number, y: number, large: boolean) {
  const image = value === cap && art.local.get(`common/images/max_score/${cap}.png`);
  const width = large ? 134 : 129;
  if (image) {
    contain(context, image, x, y - 26, width, 52);
    return width;
  }
  const text = String(value ?? "—");
  label(context, text, x, y, 36, { color: "#ddd", maxWidth: 159 });
  return Math.min(159, context.measureText(text).width);
}

function member(context: Context, art: Art, row: RankRow, mode: RankMode, y: number) {
  const avatar = art.memberAvatars.get(row.qq);
  const avatarFrame = art.local.get("common/images/SuitBg.png");
  if (avatarFrame) context.drawImage(avatarFrame, 26, y + 50, 116, 116);
  context.save();
  context.beginPath();
  context.arc(84, y + 108, 48, 0, Math.PI * 2);
  context.clip();
  if (avatar) cover(context, avatar, 36, y + 60, 96, 96);
  else box(context, "#343035", 36, y + 60, 96, 96);
  context.restore();
  const shiyu = mode === "ABYSS";
  const labelY = y + (shiyu ? 60 : 66);
  label(context, row.nickname, 168, labelY, 29, { maxWidth: 227, weight: 700 });
  const rx = row.level === undefined ? 168 : 251;
  if (row.level !== undefined) {
    fillRound(context, "#f3cb45", 168, labelY + 29, 73, 35, 5);
    label(context, `Lv${row.level}`, 204.5, labelY + 47, 22, { color: "#2b2628", align: "center" });
  }
  const server = row.regionName || (row.region === "prod_qd_cn" ? "渠道服" : "国服");
  const serverWidth = Math.min(392 - rx, Math.max(64, Array.from(server).length * 22 + 16));
  fillRound(context, "#51b1fd", rx, labelY + 29, serverWidth, 35, 5);
  label(context, server, rx + serverWidth / 2, labelY + 47, 22,
    { color: "#2b2628", align: "center", maxWidth: serverWidth - 8 });
  const uid = art.local.get("common/images/UIDBg.png");
  const uidY = y + (shiyu ? 135 : 128);
  if (uid) context.drawImage(uid, 156, uidY, 225, 42);
  else fillRound(context, "#111", 156, uidY, 225, 42, 12);
  label(context, `UID ${row.uid}`, 268.5, uidY + 21, 22, { align: "center", color: "#ffffff99" });

  if (row.holo) {
    for (const [i, [field, value]] of [["总用时", holoBossDuration(row.score)], ["星级", String(row.bonus)],
      ["无伤", String(row.holo.undamaged)]].entries()) {
      const x = 424 + 107 * i;
      label(context, field!, x, y + 88, 27, { color: "#ddd", align: "center" });
      label(context, value!, x, y + 133, 28, { weight: 700, align: "center" });
    }
    return;
  }
  if (mode === "DEADLY_HARD") return;
  label(context, "总得分", 488, y + 91, 36, { color: "#ddd", align: "center" });
  score(context, art, row.score, shiyu ? 150000 : 195000, 423, y + 140, true);
  label(context, shiyu ? "评级" : "星级", 624, y + 91, 36, { color: "#ddd", align: "center" });
  if (shiyu) badgeRating(context, art, row.rating, 579, y + 112);
  else label(context, String(row.bonus), 624, y + 140, 36, { align: "center" });
}

function trialStars(context: Context, art: Art, mode: RankMode, room: ZzzDeadlyRoom, x: number, y: number) {
  const stars = room.stars ?? 0;
  for (let i = 0; i < (room.availableStars ?? stars); i++) {
    const state = i >= stars ? "star-icon-dark" : mode === "DEADLY_HARD" ? "star-icon-hard.13c9ee51" : "star-icon-light";
    const icon = theme(art, mode, state);
    if (icon) contain(context, icon, x + i * 25, y - 17, 34, 34);
    else label(context, i >= stars ? "☆" : "★", x + 17 + i * 25, y, 24, { color: "#f5ce49", align: "center" });
  }
}

function team(context: Context, art: Art, mode: RankMode, entry: ZzzShiyuTeam | ZzzDeadlyRoom | undefined, x: number, y: number) {
  frame(context, theme(art, mode, "BgFrame01"), x, y, 528, 216);
  if (!entry) return;
  if (mode === "DEADLY_HARD") {
    const accent = theme(art, mode, "hard-module-inner-bg-m.83b7d1a1");
    if (accent) context.drawImage(accent, x + 7.2, y + 7.2, 513.6, 201.6);
    else fillRound(context, "#72212d30", x + 7, y + 7, 514, 202, 10);
  }
  const infoX = x + 40.8;
  const isShiyu = mode === "ABYSS";
  if (isShiyu) {
    const record = entry as ZzzShiyuTeam;
    label(context, record.buff || "—", infoX, y + 66, 28.8, { color: "#ddd", maxWidth: 222 });
    score(context, art, record.score, 50000, x + 282, y + 65, false);
    badgeRating(context, art, record.rating, x + 405, y + 36);
  } else {
    const room = entry as ZzzDeadlyRoom;
    const starCount = room.availableStars ?? room.stars ?? 0;
    const name = room.name || "首领";
    const buffer = room.buffIcon && art.buffIcons.get(room.buffIcon);
    const frameIcon = theme(art, mode, "PetSelectBG");
    if (frameIcon && room.buffIcon) context.drawImage(frameIcon, x + 468, y, 60, 60);
    if (buffer) contain(context, buffer, x + 475, y + 7, 46, 46);
    const nameMax = Math.max(85, Math.min(248, 320 - starCount * 23));
    label(context, name, infoX, y + 63, 28.8, { color: "#ddd", maxWidth: nameMax, ellipsis: false });
    const scoreX = infoX + Math.min(nameMax, context.measureText(name).width);
    const scoreWidth = score(context, art, room.score, 65000, scoreX, y + 63, false);
    trialStars(context, art, mode, room, scoreX + scoreWidth + 6, y + 63);
  }
  const top = y + (isShiyu ? 100.8 : 94.6);
  entry.avatars.slice(0, 3).forEach((entry, i) => drawPortrait(context, art, entry, infoX + i * 123.25, top, 99.25));
  drawPortrait(context, art, entry.buddy, infoX + 369.75, top + 29.8, 69.5, true);
}

function holoTeam(context: Context, art: Art, room: ZzzHoloBossRoom | undefined, x: number, y: number) {
  frame(context, theme(art, "HOLO_BOSS", "BgFrame01"), x, y, 454, 217);
  if (!room) return;
  const medal = room.medalIcon && art.buffIcons.get(room.medalIcon);
  const frameIcon = theme(art, "HOLO_BOSS", "PetSelectBG");
  if (medal) {
    if (frameIcon) context.drawImage(frameIcon, x + 403, y, 51, 51);
    contain(context, medal, x + 408, y + 5, 41, 41);
  }
  label(context, `${room.name || "首领"}${room.undamaged ? " · 无伤" : ""}`,
    x + 42, y + 47, 25, { color: "#e6e6e6", maxWidth: 355 });
  label(context, holoBossDuration(room.duration), x + 42, y + 77, 26, { color: "#ddd", maxWidth: 110 });
  if (room.stars !== undefined) {
    for (let i = 0; i < 4; i++) {
      const lit = i < room.stars;
      const asset = theme(art, "HOLO_BOSS", lit ? "star-light.d591d065" : "star-gray.53e3ee51");
      const left = x + 171 + i * 26;
      if (asset) contain(context, asset, left, y + 62, 28, 28);
      else label(context, lit ? "★" : "☆", left + 10, y + 77, 22, { color: lit ? "#ffd700" : "#999" });
    }
  }
  for (let i = 0; i < 3; i++) {
    const entry = room.avatars[i];
    const left = x + 41 + i * 120;
    if (entry) drawPortrait(context, art, entry, left, y + 107, 91);
    else fillRound(context, "#151517", left, y + 107, 91, 91, 8, "#343534");
  }
}

async function loadRankArt(local: Awaited<ReturnType<typeof openZzzCardTheme>>, mode: RankMode, rows: readonly RankRow[], signal?: AbortSignal): Promise<Art> {
  const root = `rank/${modeTheme[mode]}/images/`;
  const paths = [
    "common/images/bg.jpg", "common/images/SuitBg.png", "common/images/UIDBg.png",
    ...["S", "A", "B"].map(name => `common/images/RANK_${name}.png`),
    ...["SP", "S", "A", "B"].map(name => `common/images/rating/${name}.png`),
    ...[50000, 65000, 150000, 195000].map(value => `common/images/max_score/${value}.png`),
    ...["BgFrame01", "PetSelectBG", "star-icon-light", "star-icon-dark", "star-icon-hard.13c9ee51",
      "hard-module-inner-bg-m.83b7d1a1", "star-light.d591d065", "star-gray.53e3ee51"].map(name => root + name + ".png"),
  ];
  const members = new Map<string, Image | undefined>();
  const books = new Map<string, Image | undefined>();
  const portraits = new Map<ZzzShiyuPortrait, Image | undefined>();
  const downloads = new Map<string, Promise<Image | undefined>>();
  function official(url: string) {
    let pending = downloads.get(url);
    if (!pending) {
      pending = artwork(fetchZzzOfficialArtwork(url, signal));
      downloads.set(url, pending);
    }
    return pending;
  }
  async function loadRow(row: RankRow) {
    const teams = row.teams.slice(0, mode === "DEADLY_HARD" ? 1 : 3);
    await Promise.all([
      artwork(fetchZzzQqAvatar(row.qq, signal)).then(avatar => members.set(row.qq, avatar)),
      ...(row.holo?.bosses.slice(0, 3).map(async room => {
        await Promise.all([
          ...room.avatars.slice(0, 3).map(entry => loadChallengePortrait(entry, false, local, official, portraits)),
          room.medalIcon && official(room.medalIcon).then(icon => books.set(room.medalIcon!, icon)),
        ]);
      }) ?? []),
      ...teams.map(async entry => {
        const buff = (entry as ZzzDeadlyRoom).buffIcon;
        await Promise.all([
          ...entry.avatars.slice(0, 3).map(person => loadChallengePortrait(person, false, local, official, portraits)),
          loadChallengePortrait(entry.buddy, true, local, official, portraits),
          buff && official(buff).then(icon => books.set(buff, icon)),
        ]);
      }),
    ]);
  }
  const pathEntries = Promise.all(paths.map(async path => [path, await local(path)] as const));
  for (let start = 0; start < rows.length && !signal?.aborted; start += 2) {
    await Promise.all(rows.slice(start, start + 2).map(loadRow));
  }
  return { local: new Map(await pathEntries), memberAvatars: members, buffIcons: books, portraits };
}

// ZZZure/ZZZ-Plugin 2057599 resources/rank/{abyss,deadly,deadlyHard}, normal screenshot scale 1.
export async function renderChallengeRank(mode: RankMode, rows: readonly RankRow[], options: ZzzCardOptions = {}) {
  const width = mode === "DEADLY_HARD" ? 1000 : mode === "HOLO_BOSS" ? 2200 : 2400;
  const startNotes = 96 + rows.length * 240;
  const notes = mode === "ABYSS" ? 149 : mode === "DEADLY" ? 110 : 142;
  const height = startNotes + notes + 80;
  const art = await loadRankArt(await openZzzCardTheme(options), mode, rows, options.signal);
  options.signal?.throwIfAborted();
  return renderPng(width, height, (context) => {
    box(context, "#222025", 0, 0, width, height);
    const background = art.local.get("common/images/bg.jpg");
    if (background) cover(context, background, 0, 0, width, height);
    heading(context, mode, width);
    rows.forEach((row, index) => {
      const y = 96 + index * 240;
      member(context, art, row, mode, y);
      if (mode === "HOLO_BOSS") {
        for (let idx = 0; idx < 3; idx++) holoTeam(context, art, row.holo?.bosses[idx], 762 + 467 * idx, y - 12);
      } else if (mode === "DEADLY_HARD") team(context, art, mode, row.teams[0], 438, y - 12);
      else for (let idx = 0; idx < 3; idx++) team(context, art, mode, row.teams[idx], 698 + 552 * idx, y - 12);
    });
    frame(context, theme(art, mode, "BgFrame01"), 24, startNotes, width - 48, notes);
    let noteY = startNotes + 36;
    if (mode === "ABYSS") {
      label(context, "• 式舆防卫战排名仅统计第五防线", 74, noteY, 19.2, { color: "#979797" });
      noteY += 40;
    }
    const intro = "• 请在本群查询 ";
    label(context, intro, 74, noteY, 19.2, { color: "#979797" });
    const x = 74 + context.measureText(intro).width;
    const query = `%${rankLabels[mode === "DEADLY_HARD" ? "DEADLY" : mode]}`;
    label(context, query, x, noteY, 19.2, { color: "#ffd700" });
    label(context, " 以登记本期战绩", x + context.measureText(query).width, noteY, 19.2, { color: "#979797" });
    const tie = mode === "ABYSS" ? "同分同评级" : mode === "DEADLY" ? "同星同分" : "同分";
    const order = mode === "HOLO_BOSS" ? "先比较星数、总用时、无伤间数，完全相同时以较早记录排前" :
      `${tie}时，最后通关时间较早者排前`;
    label(context, `• ${order}`, 74, noteY + 39, 19.2, { color: "#979797", maxWidth: width - 145 });
    if (mode === "HOLO_BOSS") label(context, "• 使用 %显示拟境排名 或 %隐藏拟境排名 设置本群可见性",
      74, noteY + 78, 19.2, { color: "#f3cb45" });
    label(context, zzzCardFooter, width / 2, height - 42, 17, { color: "#a09ca3", align: "center" });
  }, "gpu");
}
