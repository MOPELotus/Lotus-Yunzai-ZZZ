import { renderPng } from "@lotus-yunzai/skia";
import { Canvas, type CanvasRenderingContext2D as Context, type Image } from "skia-canvas";
import { box, cover, label, zzzCardFooter } from "./card-theme.ts";
import { fillRound } from "./challenge-card.ts";
import { drawZzzWikiLines, wrapZzzWikiText } from "./cinema.ts";
import { zzzSkillText, type SkillSection, type SkillRate } from "./skills-data.ts";

const width = 840;
const xInset = 12;
const skillWidth = width - 2 * xInset;
const padding = 12;
const iconSize = 96;
const infoX = xInset + padding + iconSize + 12;
const infoWidth = width - infoX - xInset - padding;
const skillNameSize = 33.6;
const skillNameLine = 45;
const skillNameMargin = 16.8;
const descriptionTitleSize = 28.8;
const descriptionTitleLine = 39;
const descriptionMargin = 7.2;
const levelTitleSize = 26.4;
const levelTitleLine = 36;
const levelTitleMargin = 13.2;
const tableNameSize = 21.6;
const tableNameLine = 29;
const tableNameMargin = 6.48;
const rateMargin = 10.8;
const detailMargin = 21.6;
const tablePaddingX = 9.72;
const tablePaddingY = 3.888;
const tableInset = xInset + padding + 21.6;
const tableWidth = width - tableInset - xInset - padding;
const outerBorder = 2;
const innerBorder = 1;
const bodyFont = '24px "Noto Sans CJK SC", sans-serif';
const emphasisFont = '24px "LotusZzzRecordHongmeng", "Noto Sans CJK SC", sans-serif';
const tableFont = '19.44px "Noto Sans CJK SC", sans-serif';
const impressionFont = '19.2px "Noto Sans CJK SC", sans-serif';
const tableNameFont = `${tableNameSize}px "LotusZzzRecordHongmeng", "Noto Sans CJK SC", sans-serif`;
const descriptionTitleFont = `${descriptionTitleSize}px "LotusZzzRecordHongmeng", "Noto Sans CJK SC", sans-serif`;
const sectionGap = 48;
const footerHeight = 183.6;
const areaHeight = 10_000;
const gold = "#f6ca45";
const border = "#ffffff33";
const stripe = "#ffffff1a";
const kindTitles = {
  basic: "普通攻击", dodge: "闪避", assist: "支援技", special: "特殊技", chain: "连携技", core: "核心技",
} as const;
const buttonIcons: Readonly<Record<string, SkillSection["kind"]>> = {
  Normal: "basic", Evade: "dodge", Evaded: "dodge", Switch: "assist", Assist: "assist",
  Special: "special", SpecialReady: "special", Ultimate: "chain", UltimateReady: "chain", Core: "core", CoreSkill: "core",
};

interface SkillCardSource {
  readonly name: string;
  readonly fullName: string;
  readonly impressions: readonly string[];
  readonly avatar?: Image;
  readonly background?: Image;
  readonly icons: Readonly<Partial<Record<SkillSection["kind"], Image | undefined>>>;
}

interface EffectToken {
  readonly width: number;
  readonly text: string;
  readonly color?: string;
  readonly icon?: Image;
}

const noLineStart = /^[\p{Pe}\p{Pf}，。．、！？：；…％,.!?:;%]/u;
const noLineEnd = /[\p{Ps}\p{Pi}]$/u;

export function wrapZzzSkillEffect<T extends EffectToken>(paragraph: readonly T[], width: number): T[][] {
  if (!paragraph.length) return [[]];
  const lines: T[][] = [];
  for (let start = 0; start < paragraph.length;) {
    let end = start + 1;
    let used = paragraph[start]!.width;
    while (end < paragraph.length && used + paragraph[end]!.width <= width) {
      used += paragraph[end++]!.width;
    }
    if (end < paragraph.length) {
      let allowed = end;
      while (allowed > start) {
        let before = allowed - 1;
        while (before > start && !paragraph[before]!.icon && !paragraph[before]!.text.trim()) before--;
        let after = allowed;
        while (after < paragraph.length - 1 && !paragraph[after]!.icon && !paragraph[after]!.text.trim()) after++;
        const previous = paragraph[before]!;
        const next = paragraph[after]!;
        if ((previous.icon || !noLineEnd.test(previous.text)) && (next.icon || !noLineStart.test(next.text))) break;
        allowed--;
      }
      // If the paragraph has no legal boundary within the width, still keep it readable.
      if (allowed > start) end = allowed;
    }
    lines.push(paragraph.slice(start, end));
    start = end;
  }
  return lines;
}

function effectLines(ctx: Context, raw: string, icons: SkillCardSource["icons"]) {
  const source = raw.replace(/<\/?(?:term|unbreak|b|i)\b[^<>]*>/giu, "").replace(/\\n/gu, "\n");
  const tokens = source.match(/<\/?color(?:=#[a-f0-9]{6,8})?>|<IconMap:Icon_\w+>|\n|[A-Za-z0-9%+.,-]+|./giu) ?? [];
  const paragraphs: EffectToken[][] = [[]];
  let color: string | undefined;
  for (const token of tokens) {
    if (token === "\n") {
      paragraphs.push([]);
      continue;
    }
    if (/^<\/?color/iu.test(token)) {
      color = /^<color=(#[a-f0-9]{6,8})>$/iu.exec(token)?.[1];
      continue;
    }
    const button = /^<IconMap:Icon_(\w+)>$/u.exec(token)?.[1];
    const kind = button && Object.hasOwn(buttonIcons, button) ? buttonIcons[button] : undefined;
    const icon = kind && icons[kind];
    const text = button ? zzzSkillText(token) : token;
    ctx.font = color ? emphasisFont : bodyFont;
    const width = icon ? 28.8 : ctx.measureText(text).width;
    paragraphs.at(-1)!.push({ width, text, color, icon });
  }
  const lines = paragraphs.flatMap(paragraph => wrapZzzSkillEffect(paragraph, infoWidth));
  return lines.map(tokens => ({
    tokens, height: tokens.length && tokens.every(({ color, text, icon }) => !icon && (color || !text.trim())) ? 32 : 35,
  }));
}

function drawEffects(context: Context, lines: ReturnType<typeof effectLines>, x: number, y: number) {
  context.textAlign = "left";
  context.textBaseline = "top";
  for (const { tokens, height } of lines) {
    let left = x;
    for (const { width, text, color, icon } of tokens) {
      if (icon) {
        context.drawImage(icon, left, y + 4, 28.8, 28.8);
      } else {
        context.font = color ? emphasisFont : bodyFont;
        context.fillStyle = color ?? "white";
        context.fillText(text, left, y);
      }
      left += width;
    }
    y += height;
  }
}

type TableCell = { readonly lines: readonly string[]; readonly lineHeight: number };

function cells(ctx: Context, values: readonly string[], widths: readonly number[]) {
  return values.map((value, index) => ({
    lines: wrapZzzWikiText(ctx, value, widths[index]! - tablePaddingX * 2 - innerBorder, tableFont),
    lineHeight: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value) ? 29 : 23,
  }));
}

function cellHeight(row: readonly TableCell[]) {
  return Math.max(...row.map(cell => cell.lineHeight * cell.lines.length)) + tablePaddingY * 2;
}

function rateWidths(right: boolean) {
  const inner = tableWidth / 2 - outerBorder * (right ? 1 : 2);
  return [inner * 2 / 3, inner / 3];
}

function rateRows(ctx: Context, rates: readonly SkillRate[]) {
  const rows = [];
  for (let index = 0; index < rates.length; index += 2) {
    const pair = rates.slice(index, index + 2).map(({ label, value }, column) => ({
      cells: cells(ctx, [label, value], rateWidths(column === 1)),
      bottom: index + column >= rates.length - 2,
    }));
    const height = Math.max(...pair.map(({ cells, bottom }) => cellHeight(cells) + outerBorder * (bottom ? 2 : 1)));
    rows.push({ pair, height });
  }
  return rows;
}

const detailWidths = Array<number>(8).fill(tableWidth / 8);
const detailHeadings = ["#", "A", "B", "C", "D", "E", "F", "G"];

function detailRows(ctx: Context, rates: readonly SkillRate[]) {
  const amounts = rates.flatMap(row => row.details ? [row.details] : []);
  const rows = [detailHeadings, ...amounts.map((items, index) => [String(index + 1), ...items.map(String), ""])];
  return rows.map((values, index) => {
    const columns = cells(ctx, values, detailWidths);
    return { columns, height: cellHeight(columns) + outerBorder * (index === 0 ? 2 : 1) };
  });
}

function heightOf(rows: readonly { readonly height: number }[]) {
  return rows.reduce((sum, row) => sum + row.height, 0);
}

function layout(ctx: Context, section: SkillSection, icons: SkillCardSource["icons"]) {
  const descriptions = section.descriptions.map(({ name, markup }) => {
    const title = wrapZzzWikiText(ctx, name, infoWidth, descriptionTitleFont);
    const lines = effectLines(ctx, markup, icons);
    return { title, lines, height: title.length * descriptionTitleLine + heightOf(lines) + descriptionMargin };
  });
  const tables = section.tables.map(({ name, rates }) => {
    const title = wrapZzzWikiText(ctx, name, skillWidth - 2 * padding, tableNameFont);
    const rate = rateRows(ctx, rates);
    const details = detailRows(ctx, rates);
    const height = title.length * tableNameLine + tableNameMargin + heightOf(rate) + rateMargin + heightOf(details);
    return { title, rate, details, height };
  });
  const core = section.kind === "core";
  const firstDescription = padding + 2 * skillNameMargin + skillNameLine + (core ? levelTitleLine + 24 : 0);
  const firstDetail = Math.max(padding + iconSize, firstDescription + heightOf(descriptions)) + levelTitleMargin;
  const height = core ? firstDescription + heightOf(descriptions) + padding :
    firstDetail + levelTitleLine + levelTitleMargin + heightOf(tables) + Math.max(0, tables.length - 1) * detailMargin + 24 + padding;
  return { section, descriptions, tables, firstDescription, firstDetail, height };
}

function drawCells(context: Context, x: number, y: number, row: readonly TableCell[], widths: readonly number[], height: number, edge: boolean) {
  context.font = tableFont;
  context.textBaseline = "middle";
  context.textAlign = "center";
  for (const [index, { lines, lineHeight }] of row.entries()) {
    const size = widths[index]!;
    const bordered = edge || index < row.length - 1;
    if (bordered) box(context, border, x + size - innerBorder, y, innerBorder, height);
    context.fillStyle = "white";
    const center = x + (size - (bordered ? innerBorder : 0)) / 2;
    lines.forEach((line, index) => context.fillText(line, center, y + tablePaddingY + (index + 0.5) * lineHeight));
    x += size;
  }
}

function drawRateGrid(context: Context, rows: ReturnType<typeof rateRows>, y: number) {
  const width = tableWidth / 2;
  for (const [index, { pair, height }] of rows.entries()) {
    for (const [column, { cells, bottom }] of pair.entries()) {
      const x = tableInset + column * width;
      const cell = index * 2 + column + 1;
      if (cell % 3 === 0 || cell % 4 === 0) box(context, stripe, x, y, width, height);
      box(context, border, x, y, width, outerBorder);
      box(context, border, x, y + outerBorder, outerBorder, height - outerBorder);
      if (column === 0) box(context, border, x + width - outerBorder, y + outerBorder, outerBorder, height - outerBorder);
      if (bottom) box(context, border, x, y + height - outerBorder, width, outerBorder);
      const innerHeight = height - (bottom ? 2 : 1) * outerBorder;
      drawCells(context, x + outerBorder, y + outerBorder, cells, rateWidths(column === 1), innerHeight, true);
    }
    y += height;
  }
  return y;
}

function drawDetailGrid(context: Context, rows: ReturnType<typeof detailRows>, y: number) {
  for (const [index, { columns, height }] of rows.entries()) {
    if (index % 2 === 0) box(context, stripe, tableInset, y, tableWidth, height);
    if (index === 0) box(context, border, tableInset, y, tableWidth, outerBorder);
    box(context, border, tableInset, y + height - outerBorder, tableWidth, outerBorder);
    const top = index === 0 ? y + outerBorder : y;
    drawCells(context, tableInset, top, columns, detailWidths, y + height - top - outerBorder, false);
    y += height;
  }
  return y;
}

function drawSection(context: Context, block: ReturnType<typeof layout>, top: number, icon: Image | undefined) {
  const { section, descriptions, tables, height, firstDescription, firstDetail } = block;
  fillRound(context, "#000c", xInset, top, skillWidth, height, 24);
  if (icon) cover(context, icon, xInset + padding, top + padding, iconSize, iconSize);
  const nameY = padding + skillNameMargin + skillNameLine / 2;
  label(context, kindTitles[section.kind], infoX, top + nameY, skillNameSize, { color: gold });
  function level(x: number, y: number) {
    label(context, "详细属性", x, y + levelTitleLine / 2, levelTitleSize, { color: gold });
    const left = x + context.measureText("详细属性").width + 10.56;
    const text = `Lv.${section.level}`;
    context.font = '400 21.12px "LotusZzzRecordHongmeng", "Noto Sans CJK SC", sans-serif';
    const width = context.measureText(text).width + 2 * 6.336;
    fillRound(context, gold, left, y + 3.888, width, 32.224, 6.336);
    label(context, text, left + width / 2, y + 20, 21.12, { align: "center" });
  }
  if (section.kind === "core") level(infoX, top + padding + skillNameLine + skillNameMargin * 2);
  let current = top + firstDescription;
  for (const row of descriptions) {
    row.title.forEach((line, index) => label(context, line, infoX, current + (index + 0.5) * descriptionTitleLine, descriptionTitleSize));
    drawEffects(context, row.lines, infoX, current + row.title.length * descriptionTitleLine);
    current += row.height;
  }
  if (section.kind === "core") return;
  current = top + firstDetail;
  level(xInset + padding, current);
  current += levelTitleLine + levelTitleMargin;
  for (const table of tables) {
    table.title.forEach((line, index) => label(context, line, xInset + padding, current + (index + 0.5) * tableNameLine, tableNameSize));
    const rateTop = current + table.title.length * tableNameLine + tableNameMargin;
    const detailsTop = drawRateGrid(context, table.rate, rateTop) + rateMargin;
    current = drawDetailGrid(context, table.details, detailsTop) + detailMargin;
  }
}

// Box sizes follow Chromium's computed layout of ZZZure 2057599 skills/index.html and index.css.
export async function renderZzzSkills(sections: readonly SkillSection[], source: SkillCardSource) {
  const measurement = new Canvas(1, 1).getContext("2d");
  const nameX = source.avatar ? 168 : 24;
  const impressions = source.impressions.flatMap(value => wrapZzzWikiText(measurement, value, width - nameX - 24, impressionFont));
  const header = Math.max(168, 108 + impressions.length * 28) + 12;
  const blocks = sections.map(section => layout(measurement, section, source.icons));
  const pages: (typeof blocks)[] = [[]];
  let running = header + footerHeight;
  for (const block of blocks) {
    let page = pages.at(-1)!;
    if (page.length && running + sectionGap + block.height > areaHeight) {
      page = [];
      pages.push(page);
      running = header + footerHeight;
    }
    running += (page.length ? sectionGap : 0) + block.height;
    page.push(block);
  }
  const result = [];
  for (const page of pages) {
    const end = header + heightOf(page) + Math.max(0, page.length - 1) * sectionGap;
    const height = Math.ceil(end + footerHeight);
    result.push(await renderPng(width * 4, height * 4, context => {
      context.scale(4, 4);
      box(context, "#191722", 0, 0, width, height);
      if (source.background) cover(context, source.background, 0, 0, width, height);
      if (source.avatar) {
        context.save();
        context.beginPath();
        context.arc(84, 84, 60, 0, Math.PI * 2);
        context.clip();
        box(context, "white", 24, 24, 120, 120);
        cover(context, source.avatar, 24, 24, 120, 120);
        context.restore();
      }
      label(context, source.name, nameX, 50, 36, { maxWidth: 340 });
      if (source.fullName && source.fullName !== source.name) {
        const offset = Math.min(340, context.measureText(source.name).width) + 14;
        label(context, source.fullName, nameX + offset, 54, 24, { maxWidth: width - nameX - offset - 24 });
      }
      drawZzzWikiLines(context, impressions, nameX, 84, 28, impressionFont);
      let y = header;
      for (const block of page) {
        drawSection(context, block, y, source.icons[block.section.kind]);
        y += block.height + sectionGap;
      }
      label(context, "数据来源于 Nanoka", width / 2, end + 64, 24, { color: "#a09ca3", align: "center" });
      label(context, zzzCardFooter, width / 2, end + 139, 16.8, { color: "#a09ca3", align: "center" });
    }));
  }
  return result;
}
