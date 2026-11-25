import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import type { CanvasRenderingContext2D as Context } from "skia-canvas";
import { box, label } from "./card-theme.ts";
import { fillRound } from "./challenge-card.ts";
import type { PanelDamage, PanelDamageCell } from "./panel-damage.ts";
import { zzzCommandProfileSuffix } from "./profile-command.ts";

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
    rows: [[text($t("panel-damage-card.text_ba0abfbf06")), ...data[0].map(cell => change(cell.add, "+"))],
      ...data.map(line => [line.length ? change(line[0]!.del, "−") : text("—"), ...line.map(cell => ({
        text: (cell.difference > 0 ? "+" : "") + cell.difference.toFixed(0),
        background: cell.difference > 0 ? "#522620" : cell.difference < 0 ? "#164121" : "#222",
      }))])],
    notes: [
      $t("panel-damage-card.text_1c1f3545ec"),
      english === "MAINSTAT" ? $t("panel-damage-card.text_4ddc1d7555") : $t("panel-damage-card.text_9e60ca447d"),
    ],
  };
}

// Section order, labels, columns and selected-row highlight follow upstream resources/panel/damage.html.
export function panelDamageSections(model: PanelDamage, name: string, level: number, profileId: number) {
  const { selected, skillIndex } = model;
  const areas = selected.areas;
  const suffix = zzzCommandProfileSuffix(profileId);
  const command = $t("panel-damage-card.text_6dc6a2c598", { "name": name, "value2": skillIndex + 1, "value3": suffix ? $t("panel-damage-card.text_d80d2c5223", { "suffix": suffix }) : "" });
  const sections: Section[] = [{
    english: "DAMAGE", title: $t("panel-damage-card.text_14480a16f5"), columns: [0.28, 2, 1, 1],
    selection: skillIndex + 1,
    rows: [row(["%", $t("panel-damage-card.text_8b6a66bff7"), $t("panel-damage-card.text_15bccc3951"), $t("panel-damage-card.text_d5f4617e07")]),
      ...model.skills.map((item, index) => row([String(index + 1), item.skill.name,
        ...(item.result.critDMG === 0 ? [] : [value(item.result.critDMG, 0)]), value(item.result.expectDMG, 0)]))],
    notes: [$t("panel-damage-card.text_9891f22d71", { "level": level }),
      $t("panel-damage-card.text_14fa51e9e3", { "command": command }), $t("panel-damage-card.text_e109dbfcd1", { "name": selected.skill.name }), $t("panel-damage-card.text_3c348b34e3", { "name": name }),
      ...model.unavailableSkills.map(skill => $t("panel-damage-card.text_0b4e7db6b1", { "skill": skill }))],
  }, {
    english: "AREA", title: $t("panel-damage-card.text_1cef28db5c"), columns: [1, 1, 1, 1, 1, 1],
    rows: [row([$t("panel-damage-card.text_08b716f1d7"), $t("panel-damage-card.text_3d01997a6d"), $t("panel-damage-card.text_77effd41fc"), $t("panel-damage-card.text_d58672bfb1"), $t("panel-damage-card.text_4be7d19a68"), selected.skill.isSheerDMG ? $t("panel-damage-card.text_46679baa0e") : $t("panel-damage-card.text_25ad58433d")]),
      row([value(areas.BasicArea, 0), value(areas.CriticalArea, 2), value(areas.BoostArea, 2),
        value(areas.VulnerabilityArea, 2), value(areas.ResistanceArea, 2),
        selected.skill.isSheerDMG ? value(areas.SheerBoostArea, 2) : value(areas.DefenceArea, 4)]),
      ...(selected.skill.isAnomalyDMG ? [
        row([$t("panel-damage-card.text_0d2d79214e"), $t("panel-damage-card.text_3de322bdde"), $t("panel-damage-card.text_53c0159f78")]),
        row([value(areas.AnomalyProficiencyArea, 2), value(areas.AnomalyBoostArea, 2), value(areas.LevelArea, 2)]),
      ] : [])],
    notes: [$t("panel-damage-card.text_53a94dc16c")],
  }];
  if (selected.usefulBuffs.length) sections.push({
    english: "BUFF", title: $t("panel-damage-card.text_b8526958b1"), columns: [0.7, 5, 1.8, 2.5, 1.8],
    rows: [row(["%", $t("panel-damage-card.text_d44e9b3d3b"), $t("panel-damage-card.text_a488e93d69"), $t("panel-damage-card.text_eb548fd7a1"), $t("panel-damage-card.text_04d6b709de")]),
      ...selected.usefulBuffs.map((buff, index) => {
        const amount = buff.value;
        const display = typeof amount !== "number" ? "—" : amount < 2 ? `${(amount * 100).toFixed(0)}%` :
          Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
        return row([String(index + 1), buff.name, buff.source, buff.type, display]);
      })],
  });
  const sub = differences("SUBSTAT", $t("panel-damage-card.text_3c0f8f4d00"), model.substats);
  const main = differences("MAINSTAT", $t("panel-damage-card.text_a0b905c369"), model.mainstats);
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
