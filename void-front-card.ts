import type { GameRole } from "@lotus-yunzai/account";
import type { ZzzShiyuPortrait, ZzzVoidFrontRound, ZzzVoidFrontSnapshot, ZzzVoidFrontStage } from "@lotus-yunzai/hoyo-client";
import { renderPng } from "@lotus-yunzai/skia";
import type { CanvasRenderingContext2D as Context, Image } from "skia-canvas";
import { artwork, box, cover, drawZzzCardPlayer, label, loadZzzCardPlayer, openZzzCardTheme, zzzCardFooter,
  type ZzzCardOptions } from "./card-theme.ts";
import { contain, drawPortrait, fillRound, frame, loadChallengePortrait, rankBand, type ZzzChallengeArt } from "./challenge-card.ts";
import { fetchZzzOfficialArtwork } from "./tuning-artwork.ts";

const width = 840;
const firstStage = 457;
const stageHeight = 250;
const roundHeight = 127;
const themePath = "voidFrontBattle/images/";
type Art = ZzzChallengeArt & { readonly official: ReadonlyMap<string, Image | undefined> };

function markScore(score: number | undefined, max: number | undefined) {
  if (score !== undefined && score > 0 && score === max) return `common/images/max_score/${score}.png`;
}

async function loadVoidFrontArt(snapshot: ZzzVoidFrontSnapshot, stages: readonly ZzzVoidFrontStage[],
  local: Awaited<ReturnType<typeof openZzzCardTheme>>, signal?: AbortSignal): Promise<Art> {
  const paths = new Set([themePath + "bg.png", themePath + "BgFrame01.png", themePath + "m-deduce-detail-block-mask.png",
    ...["S", "A", "B"].map(rarity => `common/images/RANK_${rarity}.png`),
    ...["A", "B", "S", "SP"].map(rating => `common/images/rating/${rating}.png`),
    ...[1, 2, 3, 4, 5].map(rank => `common/images/rank_bg/${rank}.png`)]);
  const portraits = new Map<ZzzShiyuPortrait, Image | undefined>();
  const artworks = new Map<string, Promise<Image | undefined>>();
  function official(url: string) {
    let result = artworks.get(url);
    if (!result) {
      result = artwork(fetchZzzOfficialArtwork(url, signal));
      artworks.set(url, result);
    }
    return result;
  }

  const loads = [];
  if (snapshot.endingArtwork) loads.push(official(snapshot.endingArtwork));
  for (const [score, maximum] of [[snapshot.totalScore, snapshot.maxScore], ...stages.map(stage => [stage.score, stage.maxScore])] as const) {
    const badge = markScore(score, maximum);
    if (badge) paths.add(badge);
  }
  for (const stage of stages) {
    if (stage.bossIcon) loads.push(official(stage.bossIcon));
    for (const round of [stage, ...stage.rounds]) {
      if (round.buffIcon) loads.push(official(round.buffIcon));
      for (const entry of round.avatars) loads.push(loadChallengePortrait(entry, false, local, official, portraits));
      loads.push(loadChallengePortrait(round.buddy, true, local, official, portraits));
    }
  }
  const [images] = await Promise.all([Promise.all([...paths].map(async path => [path, await local(path)] as const)), Promise.all(loads)]);
  return { portraits, local: new Map(images),
    official: new Map(await Promise.all([...artworks].map(async ([url, result]) => [url, await result] as const))) };
}

function rating(context: Context, art: Art, grade: ZzzVoidFrontRound["rating"], x: number, y: number, size: number) {
  if (!grade) return;
  const image = art.local.get(`common/images/rating/${grade}.png`);
  if (image) contain(context, image, x, y, size, size);
  else label(context, grade, x + size / 2, y + size / 2, size * 0.55, { align: "center", color: "#e6b6ff", weight: 800 });
}

function drawBuff(context: Context, art: Art, buff: ZzzVoidFrontRound, x: number, y: number, size: number) {
  const image = buff.buffIcon && art.official.get(buff.buffIcon);
  if (image) contain(context, image, x, y, size, size);
  else if (buff.buffName) label(context, buff.buffName, x, y + size / 2, 15, { color: "#c9b7d1", maxWidth: 110 });
}

function team(context: Context, art: Art, round: ZzzVoidFrontRound, x: number, y: number, size: number, gap: number) {
  for (let index = 0; index < 3; index++) {
    const entry = round.avatars[index];
    const left = x + index * (size + gap);
    if (entry) drawPortrait(context, art, entry, left, y, size);
    else fillRound(context, "#151517", left, y, size, size, 9, "#343534");
  }
  drawPortrait(context, art, round.buddy, x + 3 * (size + gap), y + size * 0.2, size * 0.8, true);
}

function drawSummary(context: Context, art: Art, snapshot: ZzzVoidFrontSnapshot) {
  const x = 34, y = 189, w = 772, h = 245;
  const ending = snapshot.endingArtwork && art.official.get(snapshot.endingArtwork);
  const mask = art.local.get(themePath + "m-deduce-detail-block-mask.png");
  if (ending) {
    context.save();
    context.beginPath();
    context.roundRect(x + 54, y + 23, w - 108, h - 46, 14);
    context.clip();
    cover(context, ending, x + 54, y + 23, w - 108, h - 46);
    box(context, "#10101766", x + 54, y + 23, w - 108, h - 46);
    context.restore();
  } else fillRound(context, "#201d25", x + 54, y + 23, w - 108, h - 46, 14);
  if (mask) context.drawImage(mask, x, y, w, h);

  const score = markScore(snapshot.totalScore, snapshot.maxScore);
  const badge = score && art.local.get(score);
  if (badge) contain(context, badge, 164, y + 72, 273, 92);
  else label(context, `总分 ${snapshot.totalScore ?? "—"}`, 174, y + 124, 52, { weight: 800, maxWidth: 360 });
  if (snapshot.rank !== undefined) {
    const percent = art.local.get(`common/images/rank_bg/${rankBand(snapshot.rank)}.png`);
    if (percent) contain(context, percent, 549, y + 89, 144, 68);
    else fillRound(context, "#c080bb", 553, y + 105, 133, 37, 12);
    label(context, `${(snapshot.rank / 100).toFixed(2)}%`, 607, y + 123, 23, { align: "center", color: "#222" });
  } else label(context, "排名未知", 557, y + 124, 21, { color: "#cfccd2" });
  if (snapshot.ending) label(context, snapshot.ending, x + w - 73, y + h - 40, 23,
    { align: "right", maxWidth: 570, color: "#dad6dd" });
}

function stageCard(context: Context, art: Art, stage: ZzzVoidFrontStage, y: number, title: string) {
  const h = stageHeight + Math.ceil(stage.rounds.length / 2) * roundHeight;
  fillRound(context, "#141319", 30, y, 780, h - 14, 24, "#444");
  const boss = stage.bossIcon && art.official.get(stage.bossIcon);
  if (boss) contain(context, boss, 530, y + 23, 240, 187);
  rating(context, art, stage.rating, 676, y + 19, 113);
  label(context, stage.name || title, 57, y + 41, 31, { color: "#e0dde3", maxWidth: 398 });
  drawBuff(context, art, stage, 464, y + 22, 36);
  const score = markScore(stage.score, stage.maxScore);
  const badge = score && art.local.get(score);
  if (badge) contain(context, badge, 54, y + 66, 174, 55);
  else label(context, String(stage.score ?? "—"), 57, y + 92, 40, { weight: 800, maxWidth: 174 });
  label(context, `得分倍率 ${stage.ratio ?? "—"}`, 249, y + 93, 20, { color: "#d0cbd3", maxWidth: 210 });
  label(context, `通关时间：${stage.clearedAt ?? "—"}`, 57, y + 137, 19, { color: "#c0bcc4" });
  team(context, art, stage, 57, y + 163, 65, 15);

  for (const [index, round] of stage.rounds.entries()) {
    const x = 41 + (index % 2) * 383;
    const top = y + stageHeight - 9 + Math.floor(index / 2) * roundHeight;
    frame(context, art.local.get(themePath + "BgFrame01.png"), x, top, 373, roundHeight - 10);
    label(context, round.name ?? "子关", x + 22, top + 27, 22, { maxWidth: 190, weight: 700 });
    drawBuff(context, art, round, x + 230, top + 14, 27);
    rating(context, art, round.rating, x + 300, top + 5, 63);
    team(context, art, round, x + 22, top + 52, 47, 12);
  }
  return h;
}

// Skia version of the fixed ZZZure 2057599 voidFrontBattle template and original images.
export async function renderZzzVoidFront(snapshot: ZzzVoidFrontSnapshot, role: GameRole, options: ZzzCardOptions = {}) {
  const local = await openZzzCardTheme(options);
  const stages = snapshot.finalStage ? [snapshot.finalStage, ...snapshot.stages] : snapshot.stages;
  const [art, player] = await Promise.all([loadVoidFrontArt(snapshot, stages, local, options.signal), loadZzzCardPlayer(local, options, role.avatar)]);
  options.signal?.throwIfAborted();
  const height = firstStage + stages.reduce((total, stage) => total + stageHeight + Math.ceil(stage.rounds.length / 2) * roundHeight, 0) + 61;
  return renderPng(width * 2, height * 2, context => {
    context.scale(2, 2);
    box(context, "#191720", 0, 0, width, height);
    const background = art.local.get(themePath + "bg.png");
    if (background) cover(context, background, 0, 0, width, height);
    drawZzzCardPlayer(context, role, snapshot.region, player);
    label(context, `临界推演 · ${snapshot.scheduleType === 2 ? "上期" : "本期"}`, 782, 130, 28, { align: "right", weight: 700 });
    label(context, `统计周期：${snapshot.start ?? "起始未知"} ～ ${snapshot.end ?? "结束未知"}`, 43, 170, 19, { color: "#cfccd2" });
    drawSummary(context, art, snapshot);
    let y = firstStage;
    for (const [i, stage] of stages.entries()) {
      y += stageCard(context, art, stage, y, stage === snapshot.finalStage ? "最终关" : `关卡 ${i + (snapshot.finalStage ? 0 : 1)}`);
    }
    label(context, zzzCardFooter, width / 2, height - 36, 17, { align: "center", color: "#a09ca3" });
  }, "gpu");
}
