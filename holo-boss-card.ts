import type { GameRole } from "@lotus-yunzai/account";
import type { ZzzHoloBossRoom, ZzzHoloBossSnapshot, ZzzShiyuPortrait } from "@lotus-yunzai/hoyo-client";
import { renderPng } from "@lotus-yunzai/skia";
import type { CanvasRenderingContext2D as Context, Image } from "skia-canvas";
import { artwork, box, cover, drawZzzCardPlayer, label, loadZzzCardPlayer, openZzzCardTheme, zzzCardFooter,
  type ZzzCardOptions } from "./card-theme.ts";
import { contain, drawPortrait, fillRound, frame, loadChallengePortrait, rankBand, type ZzzChallengeArt } from "./challenge-card.ts";
import { fetchZzzOfficialArtwork } from "./tuning-artwork.ts";

const width = 840;
const firstRoom = 390;
const roomHeight = 308;
const themePath = "holoBoss/images/";
const litStar = themePath + "star-light.d591d065.png";
const greyStar = themePath + "star-gray.53e3ee51.png";
type Art = ZzzChallengeArt & { readonly official: ReadonlyMap<string, Image | undefined> };

export function holoBossDuration(seconds?: number) {
  if (seconds === undefined) return "—";
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

async function loadRoomArt(snapshot: ZzzHoloBossSnapshot, local: Awaited<ReturnType<typeof openZzzCardTheme>>,
  signal?: AbortSignal): Promise<Art> {
  const paths = ["common/images/bg.jpg", themePath + "BgFrame01.png", themePath + "PetSelectBG.png", litStar, greyStar,
    ...["S", "A", "B"].map(rank => `common/images/RANK_${rank}.png`),
    ...[1, 2, 3, 4, 5].map(rank => `common/images/rank_bg/${rank}.png`)];
  const artworkByUrl = new Map<string, Promise<Image | undefined>>();
  const portraits = new Map<ZzzShiyuPortrait, Image | undefined>();
  function official(url: string) {
    let pending = artworkByUrl.get(url);
    if (!pending) {
      pending = artwork(fetchZzzOfficialArtwork(url, signal));
      artworkByUrl.set(url, pending);
    }
    return pending;
  }
  const loads = [];
  for (const boss of snapshot.bosses) {
    if (boss.bossIcon) loads.push(official(boss.bossIcon));
    if (boss.medalIcon) loads.push(official(boss.medalIcon));
    for (const entry of boss.avatars) loads.push(loadChallengePortrait(entry, false, local, official, portraits));
  }
  const [loaded] = await Promise.all([Promise.all(paths.map(async path => [path, await local(path)] as const)), Promise.all(loads)]);
  return {
    local: new Map(loaded), portraits,
    official: new Map(await Promise.all([...artworkByUrl].map(async ([url, pending]) => [url, await pending] as const))),
  };
}

function star(context: Context, art: Art, lit: boolean, x: number, y: number, size = 25) {
  const image = art.local.get(lit ? litStar : greyStar);
  if (image) contain(context, image, x, y - size / 2, size, size);
  else label(context, lit ? "★" : "☆", x + size / 2, y, size,
    { align: "center", color: lit ? "#fbd73b" : "#6b696f" });
}

function drawRoom(context: Context, art: Art, room: ZzzHoloBossRoom, y: number) {
  frame(context, art.local.get(themePath + "BgFrame01.png"), 24, y, 792, roomHeight);
  const x = 66, top = y + 32, size = 240;
  fillRound(context, "#242326", x, top, size, size, 15, "#615e62");
  const boss = room.bossIcon && art.official.get(room.bossIcon);
  if (boss) {
    context.save();
    context.beginPath();
    context.roundRect(x + 3, top + 3, size - 6, size - 6, 12);
    context.clip();
    cover(context, boss, x, top, size, size);
    context.restore();
  }
  const medal = room.medalIcon && art.official.get(room.medalIcon);
  if (medal) {
    const background = art.local.get(themePath + "PetSelectBG.png");
    if (background) context.drawImage(background, 756, y, 60, 60);
    contain(context, medal, 762, y + 6, 48, 48);
  }

  const left = 337;
  label(context, `${room.name || "首领"}${room.undamaged ? " · 无伤" : ""}`, left, y + 53, 28.8,
    { maxWidth: 405, weight: 700 });
  label(context, holoBossDuration(room.duration), left, y + 108, 38.4, { color: "#dedce0", weight: 800, maxWidth: 130 });
  if (room.stars !== undefined) {
    for (let index = 0; index < 4; index++) star(context, art, index < room.stars, 469 + index * 30, y + 108);
  }
  if (room.rank !== undefined) {
    const badge = art.local.get(`common/images/rank_bg/${rankBand(room.rank)}.png`);
    if (badge) contain(context, badge, 618, y + 82, 133, 53);
    else fillRound(context, "#c67ab2", 618, y + 92, 133, 31, 13);
    label(context, `${(room.rank / 100).toFixed(2)}%`, 672, y + 108, 20, { align: "center", color: "#222" });
  }
  for (let index = 0; index < 3; index++) {
    const x = left + index * 142;
    const entry = room.avatars[index];
    if (entry) drawPortrait(context, art, entry, x, y + 156, 112);
    else fillRound(context, "#151517", x, y + 156, 112, 112, 11, "#343534");
  }
}

// ZZZure/ZZZ-Plugin 2057599 resources/holoBoss/index.html and the common player layout.
export async function renderZzzHoloBoss(snapshot: ZzzHoloBossSnapshot, role: GameRole, options: ZzzCardOptions = {}) {
  const local = await openZzzCardTheme(options);
  const [art, player] = await Promise.all([loadRoomArt(snapshot, local, options.signal), loadZzzCardPlayer(local, options, role.avatar)]);
  options.signal?.throwIfAborted();
  const footer = firstRoom + snapshot.bosses.length * (roomHeight + 24);
  const height = footer + 72;
  return renderPng(width * 2, height * 2, (context) => {
    context.scale(2, 2);
    box(context, "#1a181c", 0, 0, width, height);
    const background = art.local.get("common/images/bg.jpg");
    if (background) cover(context, background, 0, 0, width, height);
    drawZzzCardPlayer(context, role, snapshot.region, player);

    fillRound(context, "#444", 36, 155, 768, 167, 20);
    fillRound(context, "#0b0b0b", 56, 175, 728, 127, 5);
    label(context, `拟境湮灭战 · ${snapshot.scheduleType === 2 ? "上期" : "本期"}`, width / 2, 207, 28,
      { align: "center", weight: 700 });
    label(context, `总用时 ${holoBossDuration(snapshot.totalDuration)}`, 90, 261, 30, { weight: 700 });
    star(context, art, true, 345, 259, 36);
    label(context, `× ${snapshot.totalStars ?? "—"}`, 387, 261, 33, { weight: 700 });
    label(context, `无伤 × ${snapshot.undamaged}`, 613, 261, 30, { weight: 700 });
    const period = snapshot.period;
    const format = (date: string) => date.slice(0, 10).replaceAll("-", ".");
    label(context, `统计周期 ${period ? `${format(period.start)} - ${format(period.end)}` : "—"}`,
      43, 347, 19, { color: "#b8b5bb" });
    label(context, "挑战详情约延迟 2 小时", 43, 374, 19, { color: "#b8b5bb" });
    snapshot.bosses.forEach((room, index) => drawRoom(context, art, room, firstRoom + index * (roomHeight + 24)));
    label(context, zzzCardFooter, width / 2, height - 39, 17, { align: "center", color: "#a09ca3" });
  }, "gpu");
}
