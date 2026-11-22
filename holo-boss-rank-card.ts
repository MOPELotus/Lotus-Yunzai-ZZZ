import type { ZzzHoloBossRoom } from "@lotus-yunzai/hoyo-client";
import type { CanvasRenderingContext2D as Context, Image } from "skia-canvas";
import { box, drawTag, label, measureZzzCardLabel, zzzCardFooter } from "./card-theme.ts";
import { contain, drawPortrait, fillRound, frame, type ZzzChallengeArt } from "./challenge-card.ts";
import { holoBossDuration } from "./holo-boss-card.ts";
import type { RankRow } from "./challenge-rank-model.ts";

type HoloRankArt = ZzzChallengeArt & {
  readonly memberAvatars: ReadonlyMap<string, Image | undefined>;
  readonly buffIcons: ReadonlyMap<string, Image | undefined>;
};

const theme = "rank/holoBoss/images/";
const rowHeight = 276;
const teamWidth = 448.3;
const teamGap = 24;
const firstTeam = 783.08;
const notesHeight = 110;
export const holoRankWidth = 2200;
export const holoRankHeight = (count: number) => 96 + count * rowHeight + notesHeight + 79;

function paintMember(context: Context, art: HoloRankArt, row: RankRow, y: number) {
  frame(context, art.local.get(theme + "BgFrame01.png"), 24, y + 52, 735.08, 148);
  const avatarFrame = art.local.get("common/images/SuitBg.png");
  if (avatarFrame) context.drawImage(avatarFrame, 26.4, y + 68.4, 115.2, 115.2);
  const avatar = art.memberAvatars.get(row.qq);
  if (avatar) {
    context.save();
    context.beginPath();
    context.arc(84, y + 126, 48, 0, Math.PI * 2);
    context.clip();
    contain(context, avatar, 36, y + 78, 96, 96);
    context.restore();
  }

  label(context, row.nickname, 168, y + 83.5, 28.8, { maxWidth: 220, weight: 700 });
  let serverX = 168;
  const level = row.level === undefined ? undefined : `Lv${row.level}`;
  if (level) {
    const width = measureZzzCardLabel(context, level, 21.6) + 17.28;
    drawTag(context, "#f3cb45", 168, y + 110, width, 29, 4.32);
    label(context, level, 168 + width / 2, y + 124.5, 21.6, { color: "#2b2628", align: "center" });
    serverX += width + 12;
  }
  const server = row.regionName || (row.region === "prod_qd_cn" ? "渠道服" : "国服");
  const serverWidth = Math.min(399 - serverX, measureZzzCardLabel(context, server, 21.6) + 17.28);
  drawTag(context, "#51b1fd", serverX, y + 110, serverWidth, 29, 4.32);
  label(context, server, serverX + serverWidth / 2, y + 124.5, 21.6,
    { color: "#2b2628", align: "center", maxWidth: serverWidth - 12 });
  const uid = `UID ${row.uid}`;
  const uidWidth = measureZzzCardLabel(context, uid, 21.6) + 69.12;
  const uidFrame = art.local.get("common/images/UIDBg.png");
  if (uidFrame) context.drawImage(uidFrame, 156, y + 146, uidWidth, 42);
  else fillRound(context, "#111", 156, y + 146, uidWidth, 42, 12);
  label(context, uid, 156 + uidWidth / 2, y + 167, 21.6, { align: "center", color: "#ffffff99" });

  for (const [x, field, value] of [
    [489, "总用时", holoBossDuration(row.score)], [603, "星级", String(row.bonus)], [699, "无伤", String(row.holo?.undamaged ?? 0)],
  ] as const) {
    label(context, field, x, y + 102, 36, { color: "#ddd", align: "center" });
    label(context, value, x, y + 150, 36, { weight: 700, align: "center", maxWidth: x === 489 ? 108 : undefined, ellipsis: false });
  }
}

function gradientText(context: Context, y: number, size: number) {
  const color = context.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  color.addColorStop(0, "#fff");
  color.addColorStop(1, "#fff6");
  return color;
}

function paintTeam(context: Context, art: HoloRankArt, room: ZzzHoloBossRoom | undefined, x: number, y: number) {
  frame(context, art.local.get(theme + "BgFrame01.png"), x, y, teamWidth, 252);
  if (!room) return;
  const medal = room.medalIcon && art.buffIcons.get(room.medalIcon);
  const medalFrame = art.local.get(theme + "PetSelectBG.png");
  if (medal) {
    const left = x + teamWidth - 60;
    if (medalFrame) context.drawImage(medalFrame, left, y, 60, 60);
    contain(context, medal, left + 7.2, y + 7.2, 45.6, 45.6);
  }

  const contentX = x + 40.8;
  const name = `${room.name || "首领"}${room.undamaged ? " · 无伤" : ""}`;
  label(context, name, contentX, y + 55.5, 28.8, { weight: 700, color: gradientText(context, y + 55.5, 28.8), maxWidth: 323 });
  const time = holoBossDuration(room.duration);
  label(context, time, contentX, y + 105.8, 38.4, { weight: 700, color: gradientText(context, y + 105.8, 38.4), maxWidth: 220, ellipsis: false });
  if (room.stars !== undefined) {
    const firstStar = contentX + Math.min(220, measureZzzCardLabel(context, time, 38.4, 700)) + 3.84;
    for (let i = 0; i < 4; i++) {
      const lit = i < room.stars;
      const icon = art.local.get(theme + (lit ? "star-light.d591d065.png" : "star-gray.53e3ee51.png"));
      const left = firstStar + i * 24.96;
      fillRound(context, "#0008", left, y + 88.5, 34.56, 34.56, 17.28);
      if (icon) contain(context, icon, left, y + 88.5, 34.56, 34.56);
      else label(context, lit ? "★" : "☆", left + 17.28, y + 105.8, 26, { color: lit ? "#ffd700" : "#999", align: "center" });
    }
  }
  const slotBase = room.avatars.some(Boolean) ? 240.44 : 211.2;
  for (let i = 0; i < 3; i++) {
    const avatar = room.avatars[i];
    const left = contentX + i * 127.84;
    if (avatar) drawPortrait(context, art, avatar, left, y + 136.6, 103.84);
    else {
      box(context, "#333534", left - 5.76, y + slotBase - 5.76, 115.36, 5.76);
      box(context, "#000", left - 2.88, y + slotBase - 2.88, 109.6, 2.88);
    }
  }
}

function instruction(context: Context, y: number) {
  let x = 72;
  const parts = [
    ["•  请在群内使用 ", "#979797"], ["%显示拟境排名", "#ffd700"], [" 并查询 ", "#979797"],
    ["%拟境湮灭战", "#ffd700"], [" 登记本期战绩。使用 ", "#979797"], ["%隐藏拟境排名", "#ffd700"],
    [" 可关闭本群展示。", "#979797"],
  ];
  for (const [text, color] of parts) {
    label(context, text!, x, y, 24, { color });
    x += measureZzzCardLabel(context, text!, 24);
  }
}

export function paintHoloRank(context: Context, art: HoloRankArt, rows: readonly RankRow[]) {
  rows.forEach((row, index) => {
    const y = 96 + index * rowHeight;
    paintMember(context, art, row, y);
    for (let i = 0; i < 3; i++) {
      paintTeam(context, art, row.holo?.bosses[i], firstTeam + i * (teamWidth + teamGap), y - 12);
    }
  });
  const notesY = 96 + rows.length * rowHeight;
  frame(context, art.local.get(theme + "BgFrame01.png"), 24, notesY, 2152, notesHeight);
  instruction(context, notesY + 35.2);
  label(context, "•  排名依据：1. 星数（更多优先）  2. 三间用时总和（更少优先）  3. 无伤间数（更多优先）  4. 战绩记录时间（更早优先）",
    72, notesY + 74.4, 24, { color: "#979797", maxWidth: 2050 });
  label(context, zzzCardFooter, holoRankWidth / 2, notesY + 145, 16.8, { color: "#a09ca3", align: "center" });
}
