import type { GameRole } from "@lotus-yunzai/account";
import type { ZzzShiyuPortrait, ZzzShiyuSnapshot, ZzzShiyuTeam } from "@lotus-yunzai/hoyo-client";
import { renderPng } from "@lotus-yunzai/skia";
import type { CanvasRenderingContext2D as Context, Image } from "skia-canvas";
import { artwork, box, cover, drawZzzCardPlayer, label, loadZzzCardPlayer, openZzzCardTheme, zzzCardFooter, type ZzzCardOptions } from "./card-theme.ts";
import { contain, drawPortrait, fillRound, frame, loadChallengePortrait, rankBand, type ZzzChallengeArt } from "./challenge-card.ts";
import { fetchZzzOfficialArtwork } from "./tuning-artwork.ts";

const width = 840;
const names = ["", "一", "二", "三", "四", "五"] as const;
const numberWords = ["一", "二", "三"] as const;
type Layer = ZzzShiyuSnapshot["layers"][number];
type Art = ZzzChallengeArt & { readonly monsters: ReadonlyMap<string, Image | undefined> };

function duration(seconds: number) {
  return [Math.floor(seconds / 60), seconds % 60].map(value => String(value).padStart(2, "0")).join(":");
}

function ratingIcon(context: Context, art: Art, rating: ZzzShiyuTeam["rating"], x: number, y: number, size: number) {
  if (!rating) return;
  const image = art.local.get(`common/images/rating/${rating.replace("+", "P")}.png`);
  if (image) contain(context, image, x, y, size, size);
  else label(context, rating, x + size / 2, y + size / 2, size * 0.52, { color: "#eecc70", align: "center", weight: 800 });
}

function scoreText(context: Context, art: Art, score: number | undefined, cap: 50000 | 150000, x: number, y: number, size: number) {
  const badge = score === cap && art.local.get(`common/images/max_score/${cap}.png`);
  if (badge) {
    const w = cap === 150000 ? 225 : 120;
    const h = cap === 150000 ? 92 : 47;
    contain(context, badge, x, y - h / 2, w, h);
    return w;
  }
  label(context, String(score ?? "—"), x + 2, y + 3, size, { color: "#353237", weight: 700 });
  label(context, String(score ?? "—"), x, y, size, { color: "#e6e6e6", weight: 700 });
  return context.measureText(String(score ?? "—")).width;
}

function teamLabel(context: Context, art: Art, teamIndex: number, x: number, y: number) {
  const heading = art.local.get(`common/images/team/0${teamIndex + 1}.png`);
  if (heading) contain(context, heading, x, y, 91, 36);
  else label(context, `队伍${numberWords[teamIndex]}`, x, y + 18, 22, { color: "#a4a1a5" });
}

function drawTeam(context: Context, art: Art, team: ZzzShiyuTeam, index: number, y: number, featured: boolean, rowHeight: number) {
  const frameTexture = art.local.get("abyss/images/BgFrame01.png");
  if (!featured) {
    const x = 39 + 381 * index;
    frame(context, frameTexture, x, y, 381, 162.2);
    teamLabel(context, art, index, x + 24, y + 24);
    const left = x + 24;
    team.avatars.forEach((entry, slot) => drawPortrait(context, art, entry, left + slot * 88, y + 66, 69));
    drawPortrait(context, art, team.buddy, left + 264, y + 84, 51, true);
    return;
  }
  frame(context, frameTexture, 51, y, 738, rowHeight);
  const bossX = 93, bossY = y + 37, bossW = 189, bossH = 262;
  fillRound(context, "#28272a", bossX, bossY, bossW, bossH, 13, "#656167");
  context.save();
  context.beginPath();
  context.roundRect(bossX + 3, bossY + 3, bossW - 6, bossH - 6, 10);
  context.clip();
  const bossBackground = art.local.get("abyss/images/boss_bg_4.png");
  if (bossBackground) cover(context, bossBackground, bossX, bossY, bossW, bossH);
  const portrait = team.monster && art.monsters.get(team.monster);
  if (portrait) cover(context, portrait, bossX, bossY, bossW, bossH);
  context.restore();

  teamLabel(context, art, index, 313, y + 36);
  ratingIcon(context, art, team.rating, 653, y + 12, 119);
  scoreText(context, art, team.score, 50000, 312, y + 111, 37);
  label(context, `通关时间：${team.challengeTime ?? "—"}`, 312, y + 153, 19, { color: "#979797", maxWidth: 424 });
  const buff = team.buff ? `增益：${team.buff}` : "增益：—";
  label(context, buff, 312, y + 183, 19, { color: "#ccc", maxWidth: 424 });
  team.avatars.forEach((entry, slot) => drawPortrait(context, art, entry, 313 + slot * 120, y + 214, 96));
  drawPortrait(context, art, team.buddy, 673, y + 242, 68, true);
}

function drawLayer(context: Context, art: Art, layer: Layer, snapshot: ZzzShiyuSnapshot, y: number, height: number) {
  const featured = layer.number === 5;
  fillRound(context, featured ? "#0009" : "#0005", 25, y, 790, height, 24, "#39373b");
  label(context, `剧变节点第${names[layer.number]}防线`, featured ? 75 : 63, y + (featured ? 72 : 62), 31, { color: "#aaa" });
  if (featured) {
    const summary = snapshot.overall;
    ratingIcon(context, art, summary?.rating ?? layer.rating, 595, y + 26, 168);
    const usedWidth = scoreText(context, art, summary?.score, 150000, 75, y + 157, 60);
    if (summary?.rankBasisPoints !== undefined) {
      const rankX = 87 + usedWidth;
      const rank = art.local.get(`common/images/rank_bg/${rankBand(summary.rankBasisPoints)}.png`);
      if (rank) contain(context, rank, rankX, y + 122, 144, 72);
      else fillRound(context, "#e777a0", rankX, y + 137, 126, 42, 20);
      label(context, `${(summary.rankBasisPoints / 100).toFixed(2)}%`, rankX + 56, y + 158, 24, { color: "#222", align: "center" });
    }
    const challengeTime = summary?.challengeTime ?? layer.challengeTime;
    if (challengeTime) label(context, `通关时间：${challengeTime}`, 75, y + 234, 21.6, { color: "#979797" });
    if (summary?.battleTime !== undefined) label(context, `总通关时长：${duration(summary.battleTime)}`, 765, y + 234, 21.6, { color: "#979797", align: "right" });
    layer.teams.forEach((team, i) => drawTeam(context, art, team, i, y + 272 + i * 358.4, true, 351.2));
    return;
  }
  ratingIcon(context, art, layer.rating, 675, y + 3, 120);
  if (layer.challengeTime) label(context, `通关时间：${layer.challengeTime}`, 63, y + 112, 21.6, { color: "#979797" });
  layer.teams.forEach((team, i) => drawTeam(context, art, team, i, y + 149.6, false, 162.2));
}

function layerHeight(layer: Layer) {
  return layer.number === 5 ? 272 + layer.teams.length * 358.4 + 19.9 : 326.8;
}

async function loadArt(snapshot: ZzzShiyuSnapshot, local: Awaited<ReturnType<typeof openZzzCardTheme>>, signal?: AbortSignal): Promise<Art> {
  const paths = [
    "abyss/images/bg.png", "abyss/images/boss_bg_4.png", "abyss/images/BgFrame01.png",
    "common/images/max_score/150000.png", "common/images/max_score/50000.png",
    ...["S", "A", "B"].map(name => `common/images/RANK_${name}.png`),
    ...["SP", "S", "A", "B"].map(name => `common/images/rating/${name}.png`),
    ...[1, 2, 3, 4, 5].map(index => `common/images/rank_bg/${index}.png`),
    ...[1, 2, 3].map(index => `common/images/team/0${index}.png`),
  ];
  const imagery = new Map<string, Promise<Image | undefined>>();
  const portraits = new Map<ZzzShiyuPortrait, Image | undefined>();
  const monsters = new Map<string, Image | undefined>();
  function official(url: string) {
    let image = imagery.get(url);
    if (!image) {
      image = artwork(fetchZzzOfficialArtwork(url, signal));
      imagery.set(url, image);
    }
    return image;
  }

  const loadTeams = async () => {
    const teams = snapshot.layers.flatMap(layer => layer.teams);
    for (let index = 0; index < teams.length && !signal?.aborted; index += 2) {
      await Promise.all(teams.slice(index, index + 2).map(async team => {
        const monster = team.monster;
        await Promise.all([
          ...team.avatars.map(entry => loadChallengePortrait(entry, false, local, official, portraits)),
          loadChallengePortrait(team.buddy, true, local, official, portraits),
          monster && official(monster).then(image => monsters.set(monster, image)),
        ]);
      }));
    }
  };
  const [loaded] = await Promise.all([Promise.all(paths.map(async path => [path, await local(path)] as const)), loadTeams()]);
  return { local: new Map(loaded), portraits, monsters };
}

// ZZZure/ZZZ-Plugin 2057599 resources/abyss/index.html and index.css.
export async function renderZzzShiyu(snapshot: ZzzShiyuSnapshot, role: GameRole, options: ZzzCardOptions = {}, scale: 2 | 4 = 4) {
  const local = await openZzzCardTheme(options);
  const [art, player] = await Promise.all([loadArt(snapshot, local, options.signal), loadZzzCardPlayer(local, options, role.avatar)]);
  options.signal?.throwIfAborted();
  const body = snapshot.layers.reduce((height, layer) => height + layerHeight(layer) + 24, 249);
  const height = Math.ceil(body + 154);
  return renderPng(width * scale, height * scale, (context) => {
    context.scale(scale, scale);
    box(context, "#1a0d0b", 0, 0, width, height);
    const background = art.local.get("abyss/images/bg.png");
    if (background) cover(context, background, 0, 0, width, height);
    context.save();
    context.translate(-24, 24);
    drawZzzCardPlayer(context, role, role.regionName || snapshot.region, player);
    context.restore();
    const { period } = snapshot;
    const cycle = period ? `${period.start} - ${period.end}` : "暂无记录";
    label(context, `统计周期 ${cycle}`, 43.2, 218, 19.2, { color: "#979797", maxWidth: 752 });
    let y = 249;
    for (const layer of snapshot.layers) {
      const sectionHeight = layerHeight(layer);
      drawLayer(context, art, layer, snapshot, y, sectionHeight);
      y += sectionHeight + 24;
    }
    frame(context, art.local.get("abyss/images/BgFrame01.png"), 24, y, 792, 98);
    const caption = options.rankVisibility === undefined ? (snapshot.scheduleType === 2 ? "式舆防卫战 · 上期个人战绩" : "式舆防卫战 · 本期个人战绩") :
      `本群式舆防卫战排名：${options.rankVisibility ? "显示" : "隐藏"}，可用 %显示深渊排名 或 %隐藏深渊排名 切换`;
    label(context, caption,
      420, y + 50, 19.2, { align: "center", weight: 700 });
    label(context, zzzCardFooter, 420, height - 35, 17, { color: "#a09ca3", align: "center" });
  }, "gpu");
}
