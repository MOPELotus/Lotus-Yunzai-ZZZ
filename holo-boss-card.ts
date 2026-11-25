import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import type { GameRole } from "@lotus-yunzai/account";
import type { ZzzHoloBossRoom, ZzzHoloBossSnapshot, ZzzShiyuPortrait } from "@lotus-yunzai/hoyo-client";
import type { CanvasRenderingContext2D as Context, Image } from "skia-canvas";
import { artwork, box, cover, label, measureZzzCardLabel, openZzzCardTheme, zzzCardFooter,
  type ZzzCardOptions } from "./card-theme.ts";
import { contain, drawPortrait, fillRound, frame, loadChallengePortrait, rankBand, renderZzzBattlePng, type ZzzChallengeArt } from "./challenge-card.ts";
import { fetchZzzOfficialArtwork } from "./tuning-artwork.ts";

const width = 840;
const firstRoom = 408;
const roomGap = 24;
const roomContentX = 333.6;
const roomContentWidth = 434.4;
const portraitSize = (roomContentWidth - 48) / 3;
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

function star(context: Context, art: Art, lit: boolean, x: number, y: number, size = 34.56) {
  const image = art.local.get(lit ? litStar : greyStar);
  if (image) contain(context, image, x, y - size / 2, size, size);
  else label(context, lit ? "★" : "☆", x + size / 2, y, size,
    { align: "center", color: lit ? "#fbd73b" : "#6b696f" });
}

function gradientLabel(context: Context, text: string, x: number, y: number, size: number,
  options: { align?: CanvasTextAlign; maxWidth?: number; ellipsis?: boolean; bottomOpacity?: number } = {}) {
  const gradient = context.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  gradient.addColorStop(0, "#fff");
  gradient.addColorStop(1, `rgba(255, 255, 255, ${options.bottomOpacity ?? 0.4})`);
  label(context, text, x, y, size, { ...options, color: gradient, weight: 700 });
}

function roomHeight(room: ZzzHoloBossRoom) {
  const timeRow = room.rank === undefined ? 52 : 76.8;
  const teamRow = room.avatars.some(Boolean) ? portraitSize : 0;
  return 72 + Math.max(240, 39 + 4.8 + timeRow + 4.8 + teamRow + 4.8);
}

function drawRoom(context: Context, art: Art, room: ZzzHoloBossRoom, y: number, height: number) {
  frame(context, art.local.get(themePath + "BgFrame01.png"), 24, y, 792, height);
  const x = 64.8, top = y + 36, size = 240;
  fillRound(context, "#000", x + 4.8, top + 4.8, size, size, 14.4);
  fillRound(context, "#242326", x, top, size, size, 14.4, "#343434");
  const boss = room.bossIcon && art.official.get(room.bossIcon);
  if (boss) {
    context.save();
    context.beginPath();
    context.roundRect(x + 2.4, top + 2.4, size - 4.8, size - 4.8, 12);
    context.clip();
    cover(context, boss, x, top, size, size);
    context.restore();
  }
  context.beginPath();
  context.roundRect(x + 2.4, top + 2.4, size - 4.8, size - 4.8, 12);
  context.lineWidth = 3.6;
  context.strokeStyle = "#ffffff4d";
  context.stroke();

  const medal = room.medalIcon && art.official.get(room.medalIcon);
  if (medal) {
    const background = art.local.get(themePath + "PetSelectBG.png");
    if (background) context.drawImage(background, 756, y, 60, 60);
    contain(context, medal, 763.2, y + 7.2, 45.6, 45.6);
  }

  gradientLabel(context, `${room.name || $t("holo-boss-card.text_58cae7ec87")}${room.undamaged ? " 🏆" : ""}`, roomContentX, y + 55.5, 28.8,
    { maxWidth: medal ? 419 : roomContentWidth });
  const rank = room.rank;
  const center = y + (rank === undefined ? 105.8 : 118.2);
  const duration = holoBossDuration(room.duration);
  gradientLabel(context, duration, roomContentX, center, 38.4, { maxWidth: 120, ellipsis: false });
  const timeWidth = Math.min(120, measureZzzCardLabel(context, duration, 38.4, 700));
  const starsX = roomContentX + timeWidth + 19.2;
  if (room.stars !== undefined) {
    for (let index = 0; index < 4; index++) star(context, art, index < room.stars, starsX + index * 30.72, center);
  }
  if (rank !== undefined) {
    const badge = art.local.get(`common/images/rank_bg/${rankBand(rank)}.png`);
    const badgeX = starsX + 149.76;
    if (badge) contain(context, badge, badgeX, center - 38.4, 153.6, 76.8);
    else fillRound(context, "#c67ab2", badgeX, center - 16, 153.6, 32, 13);
    label(context, `${(rank / 100).toFixed(2)}%`, badgeX + 64.5, center, 19.97,
      { align: "center", color: "#222", weight: 700 });
  }
  const teamBottom = y + height - 40.8;
  for (let column = 0; column < 3; column++) {
    const left = roomContentX + column * (portraitSize + 24);
    const entry = room.avatars[column];
    if (entry) drawPortrait(context, art, entry, left, teamBottom - portraitSize, portraitSize);
    else {
      box(context, "#343534", left - 2.9, teamBottom - 2.9, portraitSize + 5.8, 5.8);
      box(context, "#090909", left - 1.4, teamBottom - 1.4, portraitSize + 2.8, 2.8);
    }
  }
}

function drawOverview(context: Context, art: Art, snapshot: ZzzHoloBossSnapshot) {
  fillRound(context, "#444", 36, 36, 768, 255.2, 20);
  box(context, "#0b0b0b", 56, 56, 728, 215.2);
  gradientLabel(context, $t("holo-boss-card.text_29e80a0630"), width / 2, 131.3, 33.6, { align: "center", bottomOpacity: 0.6 });
  const y = 200.5;
  label(context, "⏳", 108.8, y, 31.2);
  gradientLabel(context, holoBossDuration(snapshot.totalDuration), 147.2, y, 40.8);
  const stars = `x${snapshot.totalStars ?? "—"}`;
  const trophies = `x${snapshot.undamaged}`;
  const trophiesWidth = measureZzzCardLabel(context, trophies, 38.4, 700);
  const trophiesX = 731.2 - trophiesWidth;
  const timeEnd = 147.2 + measureZzzCardLabel(context, holoBossDuration(snapshot.totalDuration), 40.8, 700);
  const starsWidth = 43.2 + measureZzzCardLabel(context, stars, 38.4, 700);
  const starsX = timeEnd + (trophiesX - 38.4 - timeEnd - starsWidth) / 2;
  star(context, art, true, starsX, y, 36);
  label(context, stars, starsX + 43.2, y, 38.4, { weight: 700 });
  label(context, "🏆", trophiesX - 38.4, y, 31.2);
  label(context, trophies, trophiesX, y, 38.4, { weight: 700 });
}

// ZZZure/ZZZ-Plugin 2057599 resources/holoBoss/index.html starts with its own overview.
export async function renderZzzHoloBoss(snapshot: ZzzHoloBossSnapshot, _role: GameRole, options: ZzzCardOptions = {}) {
  const local = await openZzzCardTheme(options);
  const art = await loadRoomArt(snapshot, local, options.signal);
  options.signal?.throwIfAborted();
  const heights = snapshot.bosses.map(roomHeight);
  const notes = firstRoom + heights.reduce((sum, height) => sum + height + roomGap, 0);
  const height = Math.ceil(notes + 177.6);
  return renderZzzBattlePng(width, height, (context) => {
    box(context, "#1a181c", 0, 0, width, height);
    const background = art.local.get("common/images/bg.jpg");
    if (background) cover(context, background, 0, 0, width, height);

    drawOverview(context, art, snapshot);
    const period = snapshot.period;
    const format = (date: string) => date.slice(0, 10).replaceAll("-", ".");
    label(context, $t("holo-boss-card.text_e9438ab79d", { "value1": period ? `${format(period.start)} - ${format(period.end)}` : "—" }),
      43.2, 340.2, 19.2, { color: "#979797" });
    label(context, snapshot.scheduleType === 2 ? $t("holo-boss-card.text_2823616a99") : $t("holo-boss-card.text_474da3018a"), 797, 340.2, 19.2, { color: "#979797", align: "right" });
    label(context, $t("holo-boss-card.text_9d9656981b"), 43.2, 375.8, 19.2,
      { color: "#979797" });

    let y = firstRoom;
    for (const [index, room] of snapshot.bosses.entries()) {
      const roomHeight = heights[index]!;
      drawRoom(context, art, room, y, roomHeight);
      y += roomHeight + roomGap;
    }
    frame(context, art.local.get(themePath + "BgFrame01.png"), 24, notes, 792, 98);
    if (options.rankVisibility === undefined) {
      const instruction = $t("holo-boss-card.text_e7135a7feb");
      const command = $t("holo-boss-card.text_fe92926c65");
      const commandX = 103.2 + measureZzzCardLabel(context, instruction, 19.2) + 5.8;
      const suffixX = commandX + measureZzzCardLabel(context, command, 19.2) + 5.8;
      label(context, "•", 94, notes + 49, 19.2);
      label(context, instruction, 103.2, notes + 49, 19.2);
      label(context, command, commandX, notes + 49, 19.2, { color: "#ffd700" });
      label(context, $t("holo-boss-card.text_513ea8bd82"), suffixX, notes + 49, 19.2);
    } else {
      const status = options.rankVisibility ? $t("holo-boss-card.text_4e1449e7d5") : $t("holo-boss-card.text_145219e726");
      label(context, $t("holo-boss-card.text_d4896d0ba5", { "status": status }), 94, notes + 49, 19.2);
      label(context, $t("holo-boss-card.text_805000a007"), 288, notes + 49, 19.2, { color: "#ffd700" });
    }
    label(context, zzzCardFooter, width / 2, height - 44.5, 16.8, { align: "center", color: "#fff" });
  }, 4, options.inlineImageByteLimit, { allowHalfScale: true });
}
