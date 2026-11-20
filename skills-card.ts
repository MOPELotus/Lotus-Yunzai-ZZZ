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
const bodyFont = '24px "Noto Sans CJK SC", sans-serif';
const emphasisFont = '24px "LotusZzzRecordHongmeng", "Noto Sans CJK SC", sans-serif';
const tableFont = '19.44px "Noto Sans CJK SC", sans-serif';
const impressionFont = '19.2px "Noto Sans CJK SC", sans-serif';
const lineHeight = 34;
const tableHeight = 37;
const areaHeight = 10_000;
const gold = "#f6ca45";
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

function effectLines(ctx: Context, raw: string, icons: SkillCardSource["icons"]) {
  const source = raw.replace(/<\/?(?:term|unbreak|b|i)\b[^<>]*>/giu, "").replace(/\\n/gu, "\n");
  const tokens = source.match(/<\/?color(?:=#[a-f0-9]{6,8})?>|<IconMap:Icon_\w+>|\n|[A-Za-z0-9%+.,-]+|./giu) ?? [];
  const lines: EffectToken[][] = [[]];
  let color: string | undefined;
  let used = 0;
  for (const token of tokens) {
    if (token === "\n") {
      lines.push([]);
      used = 0;
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
    const width = icon ? 33 : ctx.measureText(text).width;
    if (used && used + width > 682) {
      lines.push([]);
      used = 0;
    }
    lines.at(-1)!.push({ width, text, color, icon });
    used += width;
  }
  return lines;
}

function drawEffects(context: Context, lines: readonly (readonly EffectToken[])[], x: number, y: number) {
  context.textAlign = "left";
  context.textBaseline = "top";
  for (const [index, line] of lines.entries()) {
    let left = x;
    const top = y + index * lineHeight;
    for (const { width, text, color, icon } of line) {
      if (icon) {
        context.drawImage(icon, left + 3, top + 3, 27, 27);
      } else {
        context.font = color ? emphasisFont : bodyFont;
        context.fillStyle = color ?? "white";
        context.fillText(text, left, top);
      }
      left += width;
    }
  }
}

function blockHeight(textLines: readonly (readonly EffectToken[])[]) {
  return 39 + textLines.length * lineHeight;
}

function layout(ctx: Context, section: SkillSection, icons: SkillCardSource["icons"]) {
  const descriptions = section.descriptions.map(({ name, markup }) => ({
    name, lines: effectLines(ctx, markup, icons),
  }));
  const tables = section.tables.map(table => {
    const details = table.rates.flatMap(rate => rate.details ? [rate.details] : []);
    return { ...table, details, height: 56 + (Math.ceil(table.rates.length / 2) + details.length + 1) * tableHeight };
  });
  const contentHeight = descriptions.reduce((sum, row) => sum + blockHeight(row.lines), 0);
  const topHeight = Math.max(101, (section.kind === "core" ? 96 : 62) + contentHeight);
  const height = topHeight + (section.kind === "core" ? 0 : 42 + tables.reduce((sum, table) => sum + table.height, 0)) + 20;
  return { section, descriptions, tables, topHeight, height };
}

function tableRow(context: Context, x: number, y: number, values: readonly string[], widths: readonly number[], shaded: boolean) {
  for (const [index, value] of values.entries()) {
    const size = widths[index]!;
    if (shaded) box(context, "#ffffff19", x, y, size, tableHeight);
    context.strokeStyle = "#ffffff33";
    context.lineWidth = 1;
    context.strokeRect(x, y, size, tableHeight);
    context.font = tableFont;
    context.fillStyle = "white";
    context.textBaseline = "middle";
    context.textAlign = "center";
    context.fillText(value, x + size / 2, y + tableHeight / 2, size - 10);
    x += size;
  }
}

function drawRateGrid(context: Context, rates: readonly SkillRate[], y: number) {
  for (const [index, rate] of rates.entries()) {
    tableRow(context, 47 + (index % 2) * 385, y + Math.floor(index / 2) * tableHeight, [rate.label, rate.value],
      [257, 128], Math.floor(index / 2) % 2 === 1);
  }
  return y + Math.ceil(rates.length / 2) * tableHeight + 9;
}

function drawSection(context: Context, block: ReturnType<typeof layout>, top: number, icon: Image | undefined) {
  const { section, descriptions, tables, height, topHeight } = block;
  fillRound(context, "#000c", xInset, top, skillWidth, height, 24);
  if (icon) cover(context, icon, xInset + padding, top + padding, 96, 96);
  const infoX = xInset + padding + 108;
  label(context, kindTitles[section.kind], infoX, top + 38, 33.6, { color: gold });
  function level(x: number, y: number) {
    label(context, "详细属性", x, y, 26.4, { color: gold });
    fillRound(context, gold, x + 111, y - 13, 69, 26, 5);
    label(context, `Lv.${section.level}`, x + 146, y, 19, { align: "center" });
  }
  if (section.kind === "core") level(infoX, top + 74);
  let current = top + (section.kind === "core" ? 98 : 63);
  for (const row of descriptions) {
    label(context, row.name, infoX, current + 13, 28.8, { maxWidth: 675 });
    drawEffects(context, row.lines, infoX, current + 30);
    current += blockHeight(row.lines);
  }
  if (section.kind === "core") return;
  current = top + topHeight;
  level(xInset + padding, current + 17);
  current += 44;
  const columns = Array<string>(8).fill("").map((_, index) => index === 0 ? "#" : String.fromCharCode(64 + index));
  const widths = Array<number>(8).fill(96.25);
  for (const table of tables) {
    label(context, table.name, xInset + padding, current + 13, 21.6, { maxWidth: skillWidth - 24 });
    const rowsTop = drawRateGrid(context, table.rates, current + 30);
    tableRow(context, 47, rowsTop, columns, widths, true);
    for (const [index, details] of table.details.entries()) {
      tableRow(context, 47, rowsTop + (index + 1) * tableHeight, [String(index + 1), ...details.map(String), ""], widths, index % 2 === 1);
    }
    current += table.height;
  }
}

// Follows the ZZZure 2057599 skills/index.html and index.css card.
export async function renderZzzSkills(sections: readonly SkillSection[], source: SkillCardSource) {
  const measurement = new Canvas(1, 1).getContext("2d");
  const impressions = source.impressions.flatMap(value => wrapZzzWikiText(measurement, value, 642, impressionFont));
  const header = Math.max(180, 105 + impressions.length * 25);
  const blocks = sections.map(section => layout(measurement, section, source.icons));
  const pages: (typeof blocks)[] = [[]];
  let running = header + 104;
  for (const block of blocks) {
    let page = pages.at(-1)!;
    if (page.length && running + block.height > areaHeight) {
      page = [];
      pages.push(page);
      running = header + 104;
    }
    page.push(block);
    running += block.height + 48;
  }
  const result = [];
  for (const page of pages) {
    const height = Math.ceil(header + page.reduce((sum, block) => sum + block.height + 48, 0) + 96);
    const scale = height <= 4000 ? 2 : 1;
    result.push(await renderPng(width * scale, height * scale, context => {
      context.scale(scale, scale);
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
      const nameX = source.avatar ? 168 : 24;
      label(context, source.name, nameX, 50, 36, { maxWidth: 340 });
      if (source.fullName && source.fullName !== source.name) {
        const offset = Math.min(340, context.measureText(source.name).width) + 14;
        label(context, source.fullName, nameX + offset, 54, 24, { maxWidth: width - nameX - offset - 24 });
      }
      drawZzzWikiLines(context, impressions, nameX, 82, 25, impressionFont);
      let y = header;
      for (const block of page) {
        drawSection(context, block, y, source.icons[block.section.kind]);
        y += block.height + 48;
      }
      label(context, "数据来源于 Nanoka", width / 2, height - 68, 24, { color: "#a09ca3", align: "center" });
      label(context, zzzCardFooter, width / 2, height - 24, 18, { color: "#a09ca3", align: "center" });
    }));
  }
  return result;
}
