import type { GameRole } from "@lotus-yunzai/account";
import type { ZzzMonthlyRecord } from "@lotus-yunzai/hoyo-client";
import { renderPng } from "@lotus-yunzai/skia";
import type { CanvasRenderingContext2D as Context, Image } from "skia-canvas";
import { box, cover, drawZzzCardPlayer, label, loadZzzCardPlayer, openZzzCardTheme, zzzCardFooter,
  type ZzzCardOptions } from "./card-theme.ts";
import { contain, fillRound } from "./challenge-card.ts";
import { zzzMonthlyDateLabel, zzzMonthlyIncome, zzzMonthlyOverview, zzzMonthlyTotals } from "./monthly-model.ts";

export const zzzMonthlyPageSize = 5;
const width = 840;
const theme = "monthly/images/";
const iconPaths = ["icon-feilin.png", "icon-matser.png", "icon-bangboo.png"];
const assets = ["bg.png", "container.png", "bamboo.png", "itembox.png", "list.png", "icon-title-deco.png", "bottom-deco.gif", ...iconPaths];
const colors = ["#ff0000", "#ff7f00", "#ffea00", "#00ff00", "#00ffea", "#3131ff", "#7f00ff", "#ea00ff"];
const count = (value: number | undefined) => value === undefined ? "—" : String(value);
const percentage = (value?: string) => value === undefined ? "—" : `${value}%`;
const breakdown = (record: ZzzMonthlyRecord) => zzzMonthlyIncome(record);

interface View {
  readonly all: readonly ZzzMonthlyRecord[];
  readonly page: number;
  readonly collect: boolean;
  readonly warning?: string;
  readonly command: string;
}

function selection(view: View) {
  return view.collect ? view.all.slice((view.page - 1) * zzzMonthlyPageSize, view.page * zzzMonthlyPageSize) : view.all;
}

function overview(view: View) {
  return view.collect ? zzzMonthlyTotals(view.all) : zzzMonthlyOverview(view.all[0]!);
}

function dateTitle(view: View) {
  const latest = view.all[0]!.data_month;
  const first = view.all.at(-1)!.data_month;
  return view.collect && first !== latest ? `${zzzMonthlyDateLabel(first)}～${zzzMonthlyDateLabel(latest)}` : zzzMonthlyDateLabel(latest);
}

function nextPage(view: View) {
  if (view.collect && view.page * zzzMonthlyPageSize < view.all.length) return `下一页 ${view.command} 页 ${view.page + 1}`;
}

export function zzzMonthlyText(view: View) {
  const totals = overview(view).map((value, index) => `${["菲林", "母带", "邦布券"][index]} ${count(value)}`).join(" · ");
  const lines = selection(view).flatMap(record => [
    ...(view.collect ? [`${zzzMonthlyDateLabel(record.data_month)} · ${zzzMonthlyOverview(record).map(count).join(" / ")}`] : []),
    ...breakdown(record).slice(0, view.collect ? 16 : 64).map(item => `${item.label} ${count(item.count)} · ${percentage(item.percent)}`),
  ]);
  return [`绝区零月报 · ${dateTitle(view)}`, view.warning, totals, ...lines, nextPage(view)].filter(Boolean).join("\n");
}

function texture(ctx: Context, image: Image | undefined, x: number, y: number, w: number, h: number, cut: number, side: number, top: number) {
  if (!image || image.width <= side * 2 || image.height <= cut + side) {
    fillRound(ctx, "#1e242b", x, y, w, h, 14, "#475060");
    return;
  }
  const sx = [0, side, image.width - side, image.width];
  const sy = [0, cut, image.height - side, image.height];
  const dx = [x, x + 27, x + w - 27, x + w];
  const dy = [y, y + Math.min(top, h - 30), y + h - 22, y + h];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      ctx.drawImage(image, sx[c]!, sy[r]!, sx[c + 1]! - sx[c]!, sy[r + 1]! - sy[r]!,
        dx[c]!, dy[r]!, dx[c + 1]! - dx[c]!, dy[r + 1]! - dy[r]!);
    }
  }
}

function currencyStrip(ctx: Context, images: ReadonlyMap<string, Image | undefined>, values: readonly (number | undefined)[],
  x: number, y: number, w: number, h: number, compact = false) {
  const strip = images.get("itembox.png");
  if (strip) ctx.drawImage(strip, x, y, w, h);
  else fillRound(ctx, "#ccd4df", x, y, w, h, 10);
  for (const [i, iconPath] of iconPaths.entries()) {
    const cx = x + w * (i + 0.5) / 3;
    const icon = images.get(iconPath);
    const size = compact ? 27 : 81;
    if (icon) contain(ctx, icon, cx - size / 2, y + h * 0.23, size, size);
    else label(ctx, ["菲林", "母带", "邦布券"][i]!, cx, y + h * 0.43, compact ? 11 : 23, { align: "center", color: "#12131a" });
    label(ctx, count(values[i]), cx, y + h * 0.79, compact ? 15 : 38,
      { align: "center", color: "#11121a", maxWidth: (compact ? w / 3 - 5 : w / 3 - 20), weight: 700 });
  }
}

function monthHeight(record: ZzzMonthlyRecord) {
  return 47 + Math.max(79, Math.ceil(breakdown(record).length / 4) * 51);
}

function drawCollectMonth(ctx: Context, images: ReadonlyMap<string, Image | undefined>, record: ZzzMonthlyRecord, y: number) {
  const h = monthHeight(record);
  fillRound(ctx, "#ffffff49", 83, y, 674, h, 8);
  label(ctx, zzzMonthlyDateLabel(record.data_month), 99, y + 24, 23, { color: "#ffcf32", weight: 700 });
  currencyStrip(ctx, images, zzzMonthlyOverview(record), 99, y + 42, 175, 72, true);
  for (const [i, item] of breakdown(record).entries()) {
    const x = 288 + i % 4 * 113;
    const top = y + 41 + Math.floor(i / 4) * 51;
    fillRound(ctx, "#0005", x, top, 107, 47, 4);
    label(ctx, item.label, x + 5, top + 13, 13, { maxWidth: 96 });
    label(ctx, percentage(item.percent), x + 5, top + 34, 12, { color: "#cacaca", maxWidth: 49 });
    label(ctx, count(item.count), x + 102, top + 34, 12, { align: "right", maxWidth: 54 });
  }
}

export async function renderZzzMonthly(view: View, role: GameRole, region: string, options: ZzzCardOptions = {}) {
  const local = await openZzzCardTheme(options);
  const [pairs, player] = await Promise.all([
    Promise.all(assets.map(async path => [path, await local(theme + path)] as const)), loadZzzCardPlayer(local, options, role.avatar),
  ]);
  const images = new Map(pairs);
  const records = selection(view);
  const detailsHeight = view.collect ? 79 + records.reduce((sum, record) => sum + monthHeight(record) + 12, 0) :
    85 + Math.max(1, breakdown(records[0]!).length) * 58;
  const follow = nextPage(view);
  const listY = 668;
  const height = listY + detailsHeight + (view.collect ? 209 : 157) + (follow ? 34 : 0);
  options.signal?.throwIfAborted();
  return renderPng(width * 4, height * 4, ctx => {
    ctx.scale(4, 4);
    box(ctx, "#4c625b", 0, 0, width, height);
    const bg = images.get("bg.png");
    if (bg) cover(ctx, bg, 0, 0, width, height);
    fillRound(ctx, "#000", 183, -12, 474, 60, 13);
    label(ctx, dateTitle(view), 420, 25, 27, { align: "center", color: "#d3d3d3", weight: 700 });
    if (view.warning) {
      fillRound(ctx, "#222c", 117, 62, 541, 35, 9);
      label(ctx, view.warning, 384, 80, 19, { align: "center", color: "#ffd970", maxWidth: 520 });
    }
    texture(ctx, images.get("container.png"), 22, 143, 796, listY + detailsHeight - 104, 210, 40, 148);
    ctx.save();
    ctx.translate(0, 167);
    drawZzzCardPlayer(ctx, role, region, player);
    ctx.restore();
    const bangboo = images.get("bamboo.png");
    if (bangboo) contain(ctx, bangboo, 596, 102, 206, 206);
    label(ctx, "收入一览", 68, 342, 33, { weight: 700 });
    const decoration = images.get("icon-title-deco.png");
    if (decoration) contain(ctx, decoration, 215, 319, 63, 42);
    currencyStrip(ctx, images, overview(view), 60, 365, 720, 292);
    texture(ctx, images.get("list.png"), 60, listY, 720, detailsHeight, 550, 30, Math.min(528, detailsHeight - 30));
    label(ctx, view.collect ? "每月细则" : "菲林收入组成", 87, listY + 42, 29, { weight: 700 });
    if (view.collect) {
      const pages = Math.ceil(view.all.length / zzzMonthlyPageSize);
      if (pages > 1) label(ctx, `${view.page} / ${pages}`, 748, listY + 42, 19, { align: "right" });
      let y = listY + 67;
      for (const record of records) {
        drawCollectMonth(ctx, images, record, y);
        y += monthHeight(record) + 12;
      }
    } else {
      const income = breakdown(records[0]!);
      if (!income.length) label(ctx, "暂无细分收入", 92, listY + 103, 21, { color: "#ddd" });
      for (const [i, item] of income.entries()) {
        const y = listY + 88 + i * 58;
        label(ctx, item.label, 91, y, 22, { color: "#e3e3e3" });
        label(ctx, percentage(item.percent), 309, y, 20, { color: "#b0b0b0" });
        label(ctx, count(item.count), 733, y, 22, { align: "right" });
        fillRound(ctx, "#fff2", 91, y + 18, 640, 8, 4);
        if (item.percent && Number(item.percent) > 0) {
          fillRound(ctx, colors[i % colors.length]!, 91, y + 18, Number(item.percent) * 6.4, 8, 4);
        }
      }
    }
    let footer = listY + detailsHeight + 53;
    if (follow) {
      label(ctx, follow, 51, footer, 21, { color: "#ffd970" });
      footer += 34;
    }
    label(ctx, "* 数据统计存在约 2 小时延迟", 51, footer, 18, { color: "#dfdfdf" });
    label(ctx, "* 菲林收入不含充值获得底片后兑换的菲林", 51, footer + 28, 18, { color: "#dfdfdf" });
    if (view.collect) {
      const service = region.endsWith("_cn") ? "米游社" : "HoYoLAB";
      label(ctx, `* ${service} 已不可查且从未存档的月份不会显示`, 51, footer + 56, 18, { color: "#dfdfdf" });
    }
    const bottom = images.get("bottom-deco.gif");
    if (bottom) cover(ctx, bottom, 0, height - 28, width, 28);
    label(ctx, zzzCardFooter, 420, height - 14, 16, { align: "center", color: "#fff" });
  }, "gpu");
}
