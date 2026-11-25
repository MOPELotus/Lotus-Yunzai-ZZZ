import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import type { CanvasRenderingContext2D as Context, Image } from "skia-canvas";
import { artwork, box, cover, drawTag, label, measureZzzCardLabel, openZzzCardTheme, zzzCardFooter, zzzRegionName,
  type ZzzCardOptions } from "./card-theme.ts";
import { contain, frame, renderZzzBattlePng } from "./challenge-card.ts";
import { rankLabels, towerRanks, type RankRow } from "./challenge-rank-model.ts";
import { fetchZzzOfficialArtwork, fetchZzzQqAvatar } from "./tuning-artwork.ts";

type Season = 1 | 2 | 3 | 4;
const layout = {
  1: { width: 900, result: 540, offsets: [48], medal: 108, order: $t("climbing-tower-rank-card.text_70b43c4dfc") },
  2: { width: 1000, result: 452, offsets: [48, 180], medal: 276, order: $t("climbing-tower-rank-card.text_6a72657a9f") },
  3: { width: 1150, offsets: [108, 300, 486], medal: 600, order: $t("climbing-tower-rank-card.text_088ce2292f") },
  4: { width: 1150, offsets: [108, 300, 486], medal: 600, order: $t("climbing-tower-rank-card.text_088ce2292f") },
} as const;
const rowTop = 96;
const rowHeight = 168;
type PlayerArtwork = Readonly<Record<"avatarFrame" | "uidBg" | "avatar" | "medal", Image | undefined>>;

function heading(context: Context, title: string, season: Season, width: number) {
  context.save();
  context.transform(1, 0, -0.14, 1, 8.4, 0);
  label(context, `CLIMBING TOWER (S${season}) RANK`, width / 2, 51, 65, {
    color: "#ffffff1a", align: "center", maxWidth: width - 56, ellipsis: false,
  });
  context.restore();

  context.beginPath();
  for (const start of [81.6, width - 292.8]) {
    for (let index = 0; index < 8; index++) {
      const x = start + 26.4 * index;
      context.moveTo(x + 16.8, 43.7);
      context.lineTo(x + 31.2, 43.7);
      context.lineTo(x + 14.4, 74.4);
      context.lineTo(x, 74.4);
      context.closePath();
    }
  }
  context.fillStyle = "#f6ca45";
  context.fill();
  label(context, $t("climbing-tower-rank-card.text_567826bb8d", { "title": title }), width / 2, 60, 36, { align: "center", maxWidth: width - 592, ellipsis: false });
}

function playerRow(context: Context, season: Season, row: RankRow, y: number, art: PlayerArtwork) {
  if (!row.tower) return;
  const card = layout[season];
  const uid = `UID ${row.uid}`;
  const uidWidth = measureZzzCardLabel(context, uid, 21.6) + 69.12;
  const result = "result" in card ? card.result : 180 + Math.min(250,
    Math.max(uidWidth, measureZzzCardLabel(context, row.nickname, 28.8, 700) + 12));

  if (art.avatarFrame) context.drawImage(art.avatarFrame, 26.4, y + 26.4, 115.2, 115.2);
  context.save();
  context.beginPath();
  context.arc(84, y + 84, 48, 0, 2 * Math.PI);
  context.clip();
  if (art.avatar) contain(context, art.avatar, 36, y + 36, 96, 96);
  else box(context, "#343035", 36, y + 36, 96, 96);
  context.restore();

  label(context, row.nickname, 168, y + 34.4, 28.8, { maxWidth: result - 198, weight: 700 });
  let x = 168;
  if (row.level !== undefined) {
    const level = `Lv${row.level}`;
    const w = measureZzzCardLabel(context, level, 21.6) + 17.28;
    drawTag(context, "#f3cb45", x, y + 68, w, 29, 4.32);
    label(context, level, x + w / 2, y + 82.5, 21.6, { align: "center", color: "#2b2628" });
    x += w + 12;
  }
  const server = zzzRegionName(row.region, row.regionName);
  const serverWidth = Math.min(result - x - 28, measureZzzCardLabel(context, server, 21.6) + 17.28);
  drawTag(context, "#51b1fd", x, y + 68, serverWidth, 29, 4.32);
  label(context, server, x + serverWidth / 2, y + 82.5, 21.6, { align: "center", color: "#2b2628", maxWidth: serverWidth - 12 });
  if (art.uidBg) context.drawImage(art.uidBg, 156, y + 111.2, uidWidth, 41.9);
  label(context, uid, 156 + uidWidth / 2, y + 132.15, 21.6, { align: "center", color: "#ffffff99" });

  box(context, "#ffffff1a", result, y + 29.5, card.medal + 84, 1);
  const labels = {
    1: [$t("climbing-tower-rank-card.text_6e35682bee")], 2: [$t("climbing-tower-rank-card.text_6e35682bee"), $t("climbing-tower-rank-card.text_7c0ac18ce6")], 3: [$t("climbing-tower-rank-card.text_18c6ed8a22"), $t("climbing-tower-rank-card.text_f5f7a2cf1c"), $t("climbing-tower-rank-card.text_37607cf0b4")], 4: [$t("climbing-tower-rank-card.text_18c6ed8a22"), $t("climbing-tower-rank-card.text_f5f7a2cf1c"), $t("climbing-tower-rank-card.text_37607cf0b4")],
  }[season];
  const values = season === 1 ? [row.tower.layer] : season === 2 ? [row.tower.layer, row.tower.noDamage]
    : [row.score, row.tower.layer, row.tower.noDamage];
  for (const [index, field] of labels.entries()) {
    const center = result + card.offsets[index]!;
    label(context, field, center, y + 66.5, 36, { align: "center", color: "#ddd" });
    label(context, String(values[index] ?? "—"), center, y + 114.5, 36, { align: "center" });
  }
  if (art.medal) contain(context, art.medal, result + card.medal, y + 54.5, 72, 72);
}

function notes(context: Context, title: string, season: Season, top: number, height: number, background?: Image) {
  const { width, order } = layout[season];
  if (background) {
    context.save();
    context.globalAlpha = 0.23;
    frame(context, background, 24, top, width - 48, height);
    context.restore();
  }

  const size = 26.4;
  const intro = $t("climbing-tower-rank-card.text_b9c1bd3569");
  const command = $t("climbing-tower-rank-card.text_b96df69e42");
  let x = 83.8;
  label(context, "•", 57, top + 30.5, size, { color: "#ddd" });
  label(context, intro, x, top + 30.5, size, { color: "#ddd" });
  x += measureZzzCardLabel(context, intro, size);
  label(context, command, x, top + 30.5, size, { color: "#ffc107" });
  x += measureZzzCardLabel(context, command, size);
  const subject = $t("climbing-tower-rank-card.text_911a055379", { "title": title });
  const suffix = $t("climbing-tower-rank-card.text_42f40f9c32", { "season": season });
  const wraps = x + measureZzzCardLabel(context, subject + suffix, size) > width - 50;
  label(context, wraps ? subject : subject + suffix, x, top + 30.5, size,
    { color: "#ddd", maxWidth: width - 50 - x, ellipsis: false });
  if (wraps) label(context, suffix, 83.8, top + 66.5, size, { color: "#ddd" });
  label(context, $t("climbing-tower-rank-card.text_cb2a958115", { "season": season, "value2": season, "order": order }), 83.8,
    top + height - 17, 17, { color: "#f3cb45", maxWidth: width - 131.8 });
}

// ZZZure 2057599, resources/rank/climbingTower/s1–s4. The four source templates use different metric geometry.
export async function renderClimbingTowerRank(season: Season, rows: readonly RankRow[], options: ZzzCardOptions) {
  const { width } = layout[season];
  const title = rankLabels[towerRanks[season - 1]!];
  const theme = await openZzzCardTheme(options);
  const loaded = new Map<string, Promise<Image | undefined>>();
  function cached(key: string, source: () => Promise<Image | undefined>) {
    const existing = loaded.get(key);
    if (existing) return existing;
    const image = source();
    loaded.set(key, image);
    return image;
  }
  const [background, avatarFrame, uidBg, notesBg] = await Promise.all([
    theme("common/images/bg.jpg"), theme("common/images/SuitBg.png"), theme("common/images/UIDBg.png"),
    theme("rank/abyss/images/BgFrame01.png"),
  ]);
  const images: PlayerArtwork[] = [];
  for (let start = 0; start < rows.length; start += 2) {
    options.signal?.throwIfAborted();
    images.push(...await Promise.all(rows.slice(start, start + 2).map(async row => {
      const source = row.tower?.medal;
      const [avatar, medal] = await Promise.all([
        cached(`qq:${row.qq}`, () => artwork(fetchZzzQqAvatar(row.qq, options.signal))),
        source && cached(source, () => artwork(fetchZzzOfficialArtwork(source, options.signal))),
      ]);
      return { avatarFrame, uidBg, avatar, medal: medal || undefined };
    })));
  }

  options.signal?.throwIfAborted();
  const noteTop = rowTop + rows.length * rowHeight;
  const noteHeight = season <= 2 ? 125 : 89;
  const height = noteTop + noteHeight + 80;
  return renderZzzBattlePng(width, height, context => {
    box(context, "#222025", 0, 0, width, height);
    if (background) cover(context, background, 0, 0, width, height);
    heading(context, title, season, width);
    rows.forEach((row, index) => playerRow(context, season, row, rowTop + index * rowHeight, images[index]!));
    notes(context, title, season, noteTop, noteHeight, notesBg);
    label(context, zzzCardFooter, width / 2, height - 44, 16.8, { color: "#fff", align: "center" });
  }, 4, options.inlineImageByteLimit, { allowHalfScale: true });
}
