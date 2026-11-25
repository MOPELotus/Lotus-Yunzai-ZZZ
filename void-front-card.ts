import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import type { GameRole } from "@lotus-yunzai/account";
import type { ZzzShiyuPortrait, ZzzVoidFrontRound, ZzzVoidFrontSnapshot, ZzzVoidFrontStage } from "@lotus-yunzai/hoyo-client";
import { Canvas, type CanvasRenderingContext2D as Context, type Image } from "skia-canvas";
import { artwork, box, cover, label, loadZzzCardPlayer, openZzzCardTheme, zzzCardFooter,
  zzzRegionName, type ZzzCardOptions } from "./card-theme.ts";
import { contain, fillRound, frame, loadChallengePortrait, rankBand, renderZzzBattlePng, type ZzzChallengeArt } from "./challenge-card.ts";
import { fetchZzzOfficialArtwork } from "./tuning-artwork.ts";

const width = 840;
const unit = 24;
const contentWidth = width - 2 * unit;
const summaryY = 249.17;
const summaryHeight = contentWidth * 218 / 686;
const mainTeam = { size: (750 * 0.7 - 43.2 * 0.7 - 3 * 28.8) / 3.7, gap: 28.8 };
const subTeam = { size: (310.2 - 3 * unit) / 3.7, gap: unit };
const fallbackFont = '"LotusZzzRecordHongmeng", "Noto Sans CJK SC", sans-serif';
const themePath = "voidFrontBattle/images/";
type Art = ZzzChallengeArt & { readonly official: ReadonlyMap<string, Image | undefined> };

function markScore(score: number | undefined, max: number | undefined) {
  if (score !== undefined && score > 0 && score === max) return `common/images/max_score/${score}.png`;
}

async function loadVoidFrontArt(snapshot: ZzzVoidFrontSnapshot, stages: readonly ZzzVoidFrontStage[],
  local: Awaited<ReturnType<typeof openZzzCardTheme>>, signal?: AbortSignal): Promise<Art> {
  const paths = new Set([themePath + "bg.png", themePath + "BgFrame01.png", themePath + "m-deduce-detail-block-mask.png",
    ...["S", "A", "B"].map(rarity => `common/images/RANK_${rarity}.png`),
    ...["A", "AP", "B", "S", "SP"].map(rating => `common/images/rating/${rating}.png`),
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

function shadowText(context: Context, value: string, x: number, y: number, size: number, color: string, dx: number, dy: number, maxWidth?: number) {
  context.save();
  context.shadowColor = "#383434";
  const pixelScale = context.getTransform().a;
  context.shadowOffsetX = dx * pixelScale;
  context.shadowOffsetY = dy * pixelScale;
  label(context, value, x, y, size, { color, maxWidth });
  context.restore();
}

function measure(context: Context, value: string, size: number, weight = 400) {
  context.font = `${weight} ${size}px ${fallbackFont}`;
  return context.measureText(value).width;
}

function drawPlayer(context: Context, role: GameRole, region: string,
  { frame: portraitFrame, uidBar, avatar }: Awaited<ReturnType<typeof loadZzzCardPlayer>>) {
  if (portraitFrame) context.drawImage(portraitFrame, 38.4, 55.2, 115.2, 115.2);
  context.save();
  context.beginPath();
  context.arc(96, 112.8, 48, 0, Math.PI * 2);
  context.clip();
  if (avatar) contain(context, avatar, 48, 64.8, 96, 96);
  else {
    box(context, "#292a35", 48, 64.8, 96, 96);
    label(context, $t("void-front-card.text_231e8863ee"), 96, 112.8, 36, { weight: 800, align: "center" });
  }
  context.restore();

  const nickname = role.nickname || $t("void-front-card.text_4efe2edb6d");
  label(context, nickname, 180, 89.4, 28.8, { weight: 700, maxWidth: 370 });
  let badgeX = 192 + Math.min(measure(context, nickname, 28.8, 700), 370);
  for (const [value, color] of [[role.level === undefined ? undefined : `Lv${role.level}`, "#f3cb45"], [region, "#51b1fd"]] as const) {
    if (!value) continue;
    const badgeWidth = Math.min(220, measure(context, value, 21.6) + 17.28);
    const upper = 72.08, lower = upper + 34.69, cut = 4.32, right = badgeX + badgeWidth;
    context.beginPath();
    context.moveTo(badgeX + cut, upper);
    context.lineTo(right - cut, upper);
    context.lineTo(right, upper + cut);
    context.lineTo(right, lower - cut);
    context.lineTo(right - cut, lower);
    context.lineTo(badgeX + cut, lower);
    context.lineTo(badgeX, lower - cut);
    context.lineTo(badgeX, upper + cut);
    context.closePath();
    context.fillStyle = color;
    context.fill();
    label(context, value, (badgeX + right) / 2, (upper + lower) / 2, 21.6,
      { align: "center", color: "#2b2628", maxWidth: badgeWidth - 9 });
    badgeX = right + 12;
  }

  const uid = `UID ${role.uid}`;
  const uidWidth = measure(context, uid, 21.6) + 76.8;
  if (uidBar && uidBar.width > 200) {
    const source = [0, 100, uidBar.width - 100, uidBar.width];
    const target = [168, 206.4, 168 + uidWidth - 38.4, 168 + uidWidth];
    for (let i = 0; i < 3; i++) {
      context.drawImage(uidBar, source[i]!, 0, source[i + 1]! - source[i]!, uidBar.height,
        target[i]!, 113.72, target[i + 1]! - target[i]!, 41.94);
    }
  } else box(context, "#1b1b25", 168, 113.72, uidWidth, 41.94);
  label(context, uid, 206.4, 134.69, 21.6, { color: "#ffffff99" });
}

function rating(context: Context, art: Art, grade: ZzzVoidFrontRound["rating"], x: number, y: number, size: number) {
  if (!grade) return;
  const image = art.local.get(`common/images/rating/${grade}.png`);
  context.save();
  context.shadowColor = grade === "B" ? "#0044d1cc" : grade.startsWith("S") ? "#a7c102cc" : "#c900c9cc";
  context.shadowBlur = size * 0.13;
  if (image) contain(context, image, x, y, size, size);
  else label(context, grade, x + size / 2, y + size / 2, size * 0.55, { align: "center", color: "#e6b6ff", weight: 800 });
  context.restore();
}

function buffImage(art: Art, round: ZzzVoidFrontRound) {
  return round.buffIcon ? art.official.get(round.buffIcon) : undefined;
}

function drawBuff(context: Context, art: Art, round: ZzzVoidFrontRound, x: number, y: number, size: number, available: number) {
  if (available < 10) return;
  const image = buffImage(art, round);
  if (image) contain(context, image, x, y - size / 2, Math.min(size, available), size);
  else if (round.buffName) label(context, round.buffName, x, y, unit, { maxWidth: available });
}

function drawPortrait(context: Context, art: Art, entry: ZzzShiyuPortrait | undefined, x: number, y: number, size: number, buddy: boolean) {
  const radius = buddy ? 9.6 : 12;
  if (!entry) {
    box(context, "#333534", x - 5.76, y - 5.76, size + 11.52, 11.52);
    box(context, "#000", x - 2.88, y - 2.88, size + 5.76, 5.76);
    return;
  }
  context.save();
  context.shadowColor = "black";
  context.shadowBlur = 32;
  context.shadowOffsetX = 16;
  context.shadowOffsetY = 24;
  fillRound(context, "#333534", x - 5.76, y - 5.76, size + 11.52, size + 11.52, radius + 5.76);
  context.restore();
  fillRound(context, "#000", x - 2.88, y - 2.88, size + 5.76, size + 5.76, radius + 2.88);
  context.save();
  context.beginPath();
  context.roundRect(x, y, size, size, radius);
  context.clip();
  const image = art.portraits.get(entry);
  if (image && buddy) cover(context, image, x - size * 0.34, y - size * 0.2, size * 2.1, size * 2);
  else if (image) {
    const scale = Math.max(size / image.width, size / image.height);
    const imageWidth = image.width * scale;
    context.drawImage(image, x + (size - imageWidth) / 2, y, imageWidth, image.height * scale);
  } else {
    box(context, "#151517", x, y, size, size);
    if (entry.name) label(context, entry.name, x + size / 2, y + size / 2, 15, { align: "center", maxWidth: size - 8 });
  }
  if (entry.rarity) {
    const chip = buddy ? 23.04 : 28.8;
    const icon = art.local.get(`common/images/RANK_${entry.rarity}.png`);
    fillRound(context, "#000", x, y, chip, chip, 6);
    if (icon) contain(context, icon, x + chip / 12, y + chip / 12, chip * 5 / 6, chip * 5 / 6);
    else label(context, entry.rarity, x + chip / 2, y + chip / 2, 16, { align: "center" });
  }
  if (entry.rank !== undefined) {
    const amount = String(entry.rank);
    const badgeWidth = measure(context, amount, 19.2) + 11.52;
    fillRound(context, "#0008", x + size - badgeWidth, y, badgeWidth, 29.81, 7);
    label(context, amount, x + size - badgeWidth / 2, y + 14.9, 19.2, { align: "center" });
  }
  context.restore();
}

function teamHeight(round: ZzzVoidFrontRound, size: number) {
  return round.avatars.some(Boolean) ? size : round.buddy ? size * 0.7 : 0;
}

function team(context: Context, art: Art, round: ZzzVoidFrontRound, x: number, bottom: number, { size, gap }: typeof mainTeam) {
  for (let i = 0; i < 3; i++) {
    const entry = round.avatars[i];
    drawPortrait(context, art, entry, x + i * (size + gap), bottom - (entry ? size : 0), size, false);
  }
  if (round.buddy) {
    const slot = size * 0.7;
    const inset = slot * 0.075;
    drawPortrait(context, art, round.buddy, x + 3 * (size + gap) + inset, bottom - slot + inset, slot * 0.85, true);
  }
}

function drawSummary(context: Context, art: Art, snapshot: ZzzVoidFrontSnapshot) {
  const ending = snapshot.endingArtwork && art.official.get(snapshot.endingArtwork);
  const mask = art.local.get(themePath + "m-deduce-detail-block-mask.png");
  if (ending) {
    const x = 130.2, y = summaryY + 36.85, w = 579.6, h = 177.97;
    const scale = Math.max(w / ending.width, h / ending.height);
    const sourceW = w / scale, sourceH = h / scale;
    context.save();
    context.beginPath();
    context.roundRect(x, y, w, h, 10.8);
    context.clip();
    context.drawImage(ending, (ending.width - sourceW) / 2, (ending.height - sourceH) * 0.35, sourceW, sourceH, x, y, w, h);
    context.restore();
  } else if (!mask) fillRound(context, "#201d25", 130.2, summaryY + 36.85, 579.6, 177.97, 10.8);
  if (mask) contain(context, mask, unit, summaryY, contentWidth, summaryHeight);

  const score = markScore(snapshot.totalScore, snapshot.maxScore);
  const badge = score && art.local.get(score);
  const text = String(snapshot.totalScore ?? "—");
  const scoreWidth = badge ? 288 : measure(context, text, 72);
  const left = (width - (scoreWidth + 12 + 144)) / 2;
  const center = summaryY + summaryHeight / 2;
  if (badge) contain(context, badge, left, center - 48, scoreWidth, 96);
  else shadowText(context, text, left, center, 72, "#e6e6e6", 3, 4);

  const rankX = left + scoreWidth + 12;
  const percent = art.local.get(`common/images/rank_bg/${snapshot.rank === undefined ? 5 : rankBand(snapshot.rank)}.png`);
  if (percent) contain(context, percent, rankX, center - 36, 144, 72);
  else fillRound(context, "#c080bb", rankX, center - 17, 124, 34, 12);
  label(context, snapshot.rank === undefined ? $t("void-front-card.text_3e191e7585") : `${(snapshot.rank / 100).toFixed(2)}%`,
    rankX + 57.6, center, 24, { align: "center", color: "#222", maxWidth: 103 });
  if (snapshot.ending) {
    context.save();
    context.shadowColor = "#121212";
    const pixelScale = context.getTransform().a;
    context.shadowOffsetX = pixelScale;
    context.shadowOffsetY = 2 * pixelScale;
    label(context, snapshot.ending, 787.2, summaryY + summaryHeight - 35.18, 24,
      { align: "right", maxWidth: 570, color: "#999" });
    context.restore();
  }
}

function drawBoss(context: Context, image: Image, layoutY: number, layoutHeight: number) {
  // The fixed template has four intersected alpha gradients. Keep their isolated source at the output density.
  const w = Math.min(375, layoutHeight * image.width / image.height);
  const pixelScale = context.getTransform().a;
  const layer = new Canvas(Math.ceil(w * pixelScale), Math.ceil(layoutHeight * pixelScale));
  layer.gpu = true;
  const mask = layer.getContext("2d");
  mask.scale(pixelScale, pixelScale);
  contain(mask, image, 0, 0, w, layoutHeight);
  mask.globalCompositeOperation = "destination-in";
  for (const [x0, y0, x1, y1] of [[0, 0, w, 0], [w, 0, 0, 0], [0, 0, 0, layoutHeight], [0, layoutHeight, 0, 0]] as const) {
    const gradient = mask.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, "#0000");
    gradient.addColorStop(0.1, "#0006");
    gradient.addColorStop(0.2, "#000c");
    gradient.addColorStop(0.7, "#000");
    mask.fillStyle = gradient;
    mask.fillRect(0, 0, w, layoutHeight);
  }
  context.drawImage(layer, 795 - w * 1.08, layoutY, w, layoutHeight);
}

function stagesLayout(stages: readonly ZzzVoidFrontStage[], art: Art) {
  let y = summaryY + summaryHeight + unit;
  const rows = stages.map(stage => {
    const nameHeight = buffImage(art, stage) ? 54 : 48;
    const badgePath = markScore(stage.score, stage.maxScore);
    const badge = badgePath ? art.local.get(badgePath) : undefined;
    const scoreHeight = badge ? 64.8 : stage.score === undefined ? 41.94 : 65;
    const mainHeight = 43.2 + nameHeight + scoreHeight + 29 + teamHeight(stage, mainTeam.size) + 36;
    const rounds = [];
    let roundY = y + 21 + mainHeight + 7.2;
    for (let i = 0; i < stage.rounds.length; i += 2) {
      const cells = stage.rounds.slice(i, i + 2);
      // The two columns stretch to the tallest round in each shared row.
      const height = Math.max(...cells.map(round => 48 + (buffImage(art, round) ? 50.19 : 39)
        + 5.76 + 4.8 + teamHeight(round, subTeam.size) + 4.8));
      rounds.push({ cells, y: roundY, height });
      roundY += height;
    }
    const height = mainHeight + 42 + (rounds.length ? roundY - (y + 21 + mainHeight) : 0);
    const layout = { stage, y, height, nameHeight, mainHeight, scoreHeight, badge, rounds };
    y += height + unit;
    return layout;
  });
  return { rows, bottom: y };
}

function drawStage(context: Context, art: Art, layout: ReturnType<typeof stagesLayout>["rows"][number], final: boolean, title: string) {
  const { stage, y, height, nameHeight, mainHeight, scoreHeight, badge, rounds } = layout;
  fillRound(context, final ? "#0009" : "#0005", 28.8, y + 4.8, 782.4, height - 9.6, 19.2);
  context.lineWidth = 9.6;
  context.strokeStyle = "#444";
  context.stroke();

  const boss = stage.bossIcon && art.official.get(stage.bossIcon);
  if (boss) drawBoss(context, boss, y + 21, mainHeight);
  rating(context, art, stage.rating, 651, y + 21, 144);

  const x = 66.6;
  const name = stage.name || title;
  const nameY = y + 42.6 + nameHeight / 2;
  label(context, name, x, nameY, 36, { color: "#aaa", maxWidth: 420 });
  const buffX = x + Math.min(measure(context, name, 36), 420) + 12;
  drawBuff(context, art, stage, buffX, nameY, 48, 646 - buffX);

  const score = String(stage.score ?? "—");
  const scoreFont = stage.score === undefined ? 32 : 48;
  const scoreWidth = badge ? 182.4 : stage.score === undefined ? 0 : measure(context, score, scoreFont);
  const scoreY = y + 42.6 + nameHeight + 12 + scoreHeight / 2;
  if (badge) contain(context, badge, x, scoreY - 32.4, scoreWidth, 64.8);
  else shadowText(context, score, x, scoreY, scoreFont, "#e6e6e6", 2, 3);
  const ratio = $t("void-front-card.text_379b38e2e5", { "value1": stage.ratio ?? "—" });
  const ratioX = x + scoreWidth + 33.6;
  const ratioWidth = measure(context, ratio, 21.6) + 25.92;
  fillRound(context, "#333", ratioX, scoreY - 20.97, ratioWidth, 41.94, 20.97);
  label(context, ratio, ratioX + 12.96, scoreY, 21.6, { color: "#ccc" });
  label(context, $t("void-front-card.text_d23d0c445b", { "value1": stage.clearedAt ?? "—" }), x, scoreY + scoreHeight / 2 + 26.5, 21.6,
    { color: "#979797", maxWidth: 555 });
  team(context, art, stage, x, y + 21 + mainHeight - 21.6, mainTeam);

  for (const row of rounds) {
    for (const [index, round] of row.cells.entries()) {
      const subX = 45 + index * 375;
      frame(context, art.local.get(themePath + "BgFrame01.png"), subX, row.y, 375, row.height);
      rating(context, art, round.rating, subX + 288.6, row.y + 9.6, 72);
      const name = round.name ?? $t("void-front-card.text_089bce08ee");
      const titleHeight = buffImage(art, round) ? 50.19 : 39;
      const titleY = row.y + 24 + titleHeight / 2;
      shadowText(context, name, subX + 28.8, titleY, 28.8, "#ddd", 2, 4, 205);
      const buffX = subX + 28.8 + Math.min(measure(context, name, 28.8), 205) + 5.76;
      drawBuff(context, art, round, buffX, titleY, 43.2, subX + 287 - buffX);
      team(context, art, round, subX + 28.8, row.y + row.height - 28.8, subTeam);
    }
  }
}

function drawRankNotes(context: Context, art: Art, y: number, visibility: boolean | undefined) {
  frame(context, art.local.get(themePath + "BgFrame01.png"), unit, y, contentWidth, 74);
  const segments = visibility === undefined
    ? [$t("void-front-card.text_e7135a7feb"), $t("void-front-card.text_437e8e18d4"), $t("void-front-card.text_ed947dac84")]
    : [$t("void-front-card.text_99534f0824", { "value1": visibility ? $t("void-front-card.text_4e1449e7d5") : $t("void-front-card.text_145219e726") }), $t("void-front-card.text_98f91425aa"), $t("void-front-card.text_eff514b8b8")];
  label(context, "•", 68.4, y + 37, 19.2);
  let x = 91.2;
  for (const [index, part] of segments.entries()) {
    if (index === 1) x += 5.76;
    label(context, part, x, y + 37, 19.2, { color: index === 1 ? "#ffd700" : "#fff" });
    x += measure(context, part, 19.2) + (index === 1 ? 5.76 : 0);
  }
}

// Skia port of the fixed voidFrontBattle template using its original images and 24 px CSS unit.
export async function renderZzzVoidFront(snapshot: ZzzVoidFrontSnapshot, role: GameRole, options: ZzzCardOptions = {}) {
  const local = await openZzzCardTheme(options);
  const stages = snapshot.finalStage ? [snapshot.finalStage, ...snapshot.stages] : snapshot.stages;
  const [art, player] = await Promise.all([loadVoidFrontArt(snapshot, stages, local, options.signal), loadZzzCardPlayer(local, options, role.avatar)]);
  options.signal?.throwIfAborted();
  const layout = stagesLayout(stages, art);
  const showNotes = snapshot.scheduleType === 1;
  const footerY = layout.bottom + (showNotes ? 74 : 0) + unit;
  const height = Math.round(footerY + 55.6);
  return renderZzzBattlePng(width, height, context => {
    box(context, "#191720", 0, 0, width, height);
    const background = art.local.get(themePath + "bg.png");
    if (background) cover(context, background, 0, 0, width, height);
    drawPlayer(context, role, zzzRegionName(snapshot.region, role.regionName), player);
    label(context, $t("void-front-card.text_442c37936d", { "value1": snapshot.start ?? $t("void-front-card.text_d0697ab3cf"), "value2": snapshot.end ?? $t("void-front-card.text_cbdbb0a566") }), 43.2, 216.8, 19.2,
      { color: "#979797" });
    drawSummary(context, art, snapshot);
    for (const [i, row] of layout.rows.entries()) {
      const final = row.stage === snapshot.finalStage;
      drawStage(context, art, row, final, final ? $t("void-front-card.text_f68f7ec0a7") : $t("void-front-card.text_e9a4798f8e", { "value1": i + (snapshot.finalStage ? 0 : 1) }));
    }
    if (showNotes) drawRankNotes(context, art, layout.bottom, options.rankVisibility);
    label(context, zzzCardFooter, width / 2, footerY + 11, 16.8, { align: "center", color: "#fff" });
  }, 4, options.inlineImageByteLimit, { allowHalfScale: true });
}
