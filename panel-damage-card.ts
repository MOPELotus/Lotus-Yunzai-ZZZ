import type { CanvasRenderingContext2D as Context } from "skia-canvas";
import { box, label } from "./card-theme.ts";
import { fillRound } from "./challenge-card.ts";
import type { PanelDamage, PanelDamageCell } from "./panel-damage.ts";

type Cell = { text: string; detail?: string; background?: string };
interface Section {
  readonly english: string;
  readonly title: string;
  readonly columns: readonly number[];
  readonly rows: readonly (readonly Cell[])[];
  readonly selection?: number;
  readonly notes?: readonly string[];
}
const tableWidth = 782.4;
const muted = "#b6b0bc";
const highlight = "#f8cc62";
const text = (value: string): Cell => ({ text: value });
const row = (values: readonly string[]) => values.map(text);

function value(number: number | undefined, decimals: number) {
  return number === undefined || !Number.isFinite(number) ? "—" : number.toFixed(decimals);
}

function differences(english: string, title: string, data: readonly (readonly PanelDamageCell[])[]): Section | undefined {
  if (data.length <= 1 || !data[0]?.length) return;
  const count = data[0].length;
  const change = (label: PanelDamageCell["add"], sign: string) => ({ text: label.shortName, detail: sign + label.valueBase });
  return {
    english, title, columns: Array<number>(count + 1).fill(1),
    rows: [[text("词条变化"), ...data[0].map(cell => change(cell.add, "+"))],
      ...data.map(line => [line.length ? change(line[0]!.del, "−") : text("—"), ...line.map(cell => ({
        text: (cell.difference > 0 ? "+" : "") + cell.difference.toFixed(0),
        background: cell.difference > 0 ? "#522620" : cell.difference < 0 ? "#164121" : "#222",
      }))])],
    notes: [
      "横轴是增加的词条，纵轴是减少的词条，数值为期望伤害变化。",
      english === "MAINSTAT" ? "部分主词条组合在游戏中无法同时获得。" : "每次计算替换一个单位副词条。",
    ],
  };
}

// Section order, labels, columns and selected-row highlight follow upstream resources/panel/damage.html.
export function panelDamageSections(model: PanelDamage, name: string, level: number, profileId: number) {
  const { selected, skillIndex } = model;
  const areas = selected.areas;
  const command = `%${name}伤害${skillIndex + 1}${profileId === 1 ? "" : ` 档案${profileId}`}`;
  const sections: Section[] = [{
    english: "DAMAGE", title: "伤害统计", columns: [0.28, 2, 1, 1],
    selection: skillIndex + 1,
    rows: [row(["%", "技能类型", "暴击伤害", "期望伤害"]),
      ...model.skills.map((item, index) => row([String(index + 1), item.skill.name,
        ...(item.result.critDMG === 0 ? [] : [value(item.result.critDMG, 0)]), value(item.result.expectDMG, 0)]))],
    notes: [`敌人等级 ${level}，1 级基础防御力 50，有属性弱点。计算不含失衡易伤区。`,
      `当前指令 ${command}`, `词条计算目标 ${selected.skill.name}`, `可通过 %${name}伤害加序号切换技能。`,
      ...model.unavailableSkills.map(skill => `${skill}暂无原版计算结果。`)],
  }, {
    english: "AREA", title: "乘区数据", columns: [1, 1, 1, 1, 1, 1],
    rows: [row(["基础区", "暴击区", "增伤区", "易伤区", "抗性区", selected.skill.isSheerDMG ? "贯穿增伤区" : "防御区"]),
      row([value(areas.BasicArea, 0), value(areas.CriticalArea, 2), value(areas.BoostArea, 2),
        value(areas.VulnerabilityArea, 2), value(areas.ResistanceArea, 2),
        selected.skill.isSheerDMG ? value(areas.SheerBoostArea, 2) : value(areas.DefenceArea, 4)]),
      ...(selected.skill.isAnomalyDMG ? [
        row(["异常精通区", "异常增伤区", "等级区"]),
        row([value(areas.AnomalyProficiencyArea, 2), value(areas.AnomalyBoostArea, 2), value(areas.LevelArea, 2)]),
      ] : [])],
    notes: ["一个技能含多段独立伤害时，这里显示其中一段的乘区。"],
  }];
  if (selected.usefulBuffs.length) sections.push({
    english: "BUFF", title: "Buff 统计", columns: [0.7, 5, 1.8, 2.5, 1.8],
    rows: [row(["%", "名称", "来源", "增益类型", "增益值"]),
      ...selected.usefulBuffs.map((buff, index) => {
        const amount = buff.value;
        const display = typeof amount !== "number" ? "—" : amount < 2 ? `${(amount * 100).toFixed(0)}%` :
          Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
        return row([String(index + 1), buff.name, buff.source, buff.type, display]);
      })],
  });
  const sub = differences("SUBSTAT", "副词条差异计算", model.substats);
  const main = differences("MAINSTAT", "主词条差异计算", model.mainstats);
  if (sub) sections.push(sub);
  if (main) sections.push(main);
  return sections;
}

function tableLayout(section: Section) {
  const matrix = section.english === "SUBSTAT" || section.english === "MAINSTAT";
  const primaryRow = matrix ? (section.english === "MAINSTAT" ? 96 : 83) : 61;
  const row = matrix ? 75 : 54;
  const notes = section.notes?.length ? 12 + section.notes.length * 28 : 0;
  return { matrix, primaryRow, row, notes, table: primaryRow + Math.max(0, section.rows.length - 1) * row + notes };
}

export function panelDamageHeight(sections: readonly Section[]) {
  return sections.reduce((sum, section) => sum + 83 + tableLayout(section).table, 55);
}

export function drawPanelDamage(context: Context, sections: readonly Section[], top: number) {
  for (const section of sections) {
    const x = (840 - tableWidth) / 2, y = top + 61;
    label(context, section.english, 420, top + 31, 53, { align: "center", color: "#ffffff22", weight: 800 });
    for (const side of [68, 603]) for (let index = 0; index < 7; index++) {
      context.save();
      context.transform(1, 0, -0.46, 1, side + index * 24, top + 22);
      box(context, highlight, 0, 0, 15, 25);
      context.restore();
    }
    label(context, section.title, 420, top + 35, 29, { align: "center", weight: 700 });
    const dimensions = tableLayout(section);
    fillRound(context, "#14151b", x, y, tableWidth, dimensions.table, 12, "#555259");
    section.rows.forEach((cells, index) => {
      const selected = section.selection === index;
      const header = index === 0;
      const rowHeight = header ? dimensions.primaryRow : dimensions.row;
      const baseline = header ? y : y + dimensions.primaryRow + (index - 1) * dimensions.row;
      if (selected) box(context, "#786849", x + 2, baseline, tableWidth - 4, rowHeight);
      else if (index % 2 === 1) box(context, "#ffffff1f", x + 2, baseline, tableWidth - 4, rowHeight);
      if (index) box(context, "#ffffff29", x + 2, baseline, tableWidth - 4, 1);
      const columns = cells.length === 3 && section.english === "DAMAGE" ? [0.28, 2, 2] :
        cells.length === 3 && section.english === "AREA" ? [1, 1, 1] : section.columns;
      const totalWeight = columns.reduce((sum, column) => sum + column, 0);
      const widths = columns.map(column => column * tableWidth / totalWeight);
      let left = x;
      cells.forEach(({ text, detail, background }, column) => {
        const width = widths[column];
        if (width === undefined) return;
        if (background) box(context, background, left + 1, baseline + 1, width - 2, rowHeight - 2);
        if (column) box(context, "#ffffff29", left, baseline, 1, rowHeight);
        label(context, text, left + width / 2, baseline + (detail ? rowHeight / 2 - 10 : rowHeight / 2), width < 86 ? 17 : 21, {
          align: "center", color: selected && column === 1 ? highlight : header ? "#cebe95" : "white",
          maxWidth: width - 7, ellipsis: !dimensions.matrix,
        });
        if (detail) label(context, detail, left + width / 2, baseline + rowHeight / 2 + 12, 15, {
          align: "center", color: muted, maxWidth: width - 7, ellipsis: false,
        });
        left += width;
      });
    });
    section.notes?.forEach((note, index) => label(context, note, 420, y + dimensions.table - dimensions.notes + index * 28 + 20,
      18, { align: "center", color: muted, maxWidth: tableWidth - 18 }));
    top += 83 + dimensions.table;
  }
}
