import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import { panelObject } from "./panel-detail.ts";
import { zzzPrefixedCommand } from "./panel-command.ts";

export const skillKinds = ["basic", "dodge", "assist", "special", "chain", "core"] as const;
type SkillKind = typeof skillKinds[number];
const defaults = [12, 12, 12, 12, 12, 6];
const buttonNames: Readonly<Record<string, string>> = {
  Normal: $t("skills-data.text_d90c73f75a"), Evade: $t("skills-data.text_3b89502eed"), Evaded: $t("skills-data.text_c74ede8277"), Switch: $t("skills-data.text_f3a96442e9"),
  Assist: $t("skills-data.text_f3a96442e9"), Special: $t("skills-data.text_fb6d88911b"), SpecialReady: $t("skills-data.text_85ebf039c1"),
  Ultimate: $t("skills-data.text_c601aa644a"), UltimateReady: $t("skills-data.text_a985bc32b7"), Core: $t("skills-data.text_f1739fc27c"), CoreSkill: $t("skills-data.text_f1739fc27c"),
};

export function zzzSkillCommand(raw: string) {
  const body = zzzPrefixedCommand(raw);
  const matched = body && /^([^\p{Cc}\p{Cf}]{1,80}?)(技能|天赋)(.*)$/u.exec(body);
  if (!matched) return;
  const [, rawName, keyword, tail] = matched;
  const name = rawName!.trim();
  const input = tail!.trim();
  if (!name || name === "角色" || keyword === "天赋" && !input) return;
  const fields = input ? input.split(/\.|\s+/u) : [];
  if (fields.length > defaults.length) return;
  const levels = defaults.map((level, index) => {
    const field = fields[index]?.trim();
    if (field === undefined) return level;
    if (/^[A-L]$/iu.test(field)) return field.toUpperCase().charCodeAt(0) - 64;
    return /^\d{1,2}$/u.test(field) ? Number(field) : NaN;
  });
  if (levels.every((level, index) => index === 5 ? level >= 0 && level <= 6 : level >= 1 && level <= 12)) {
    return { name, levels };
  }
}

export interface SkillRate {
  readonly label: string;
  readonly value: string;
  readonly details?: readonly number[];
}

interface SkillBlock {
  readonly name: string;
  readonly markup: string;
}

interface SkillTable {
  readonly name: string;
  readonly rates: readonly SkillRate[];
}

export interface SkillSection {
  readonly kind: SkillKind;
  readonly level: number;
  readonly descriptions: readonly SkillBlock[];
  readonly tables: readonly SkillTable[];
}

export function zzzSkillText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/<IconMap:Icon_(\w+)>/gu, (_, key: string) => `〔${Object.hasOwn(buttonNames, key) ? buttonNames[key] : key}〕`)
    .replace(/<\/?(?:color|term|unbreak|b|i)\b[^<>]*>/giu, "").replace(/\\n/gu, "\n").trim();
}

function sourceNumber(row: Record<string, unknown>, key: string, alternate: string) {
  const raw = row[key] ?? row[alternate];
  const value = typeof raw === "string" && /^-?\d+(?:\.\d+)?$/u.test(raw) ? Number(raw) : raw;
  return typeof value === "number" && Number.isFinite(value) ? value : NaN;
}

function skillRate(parameter: Record<string, unknown>, level: number): SkillRate | undefined {
  const label = zzzSkillText(parameter.name);
  if (!label) return;
  // The old Nanoka card uses only the first ordered hit record per named parameter.
  const first = Object.values(panelObject(parameter.param))[0];
  if (first === undefined) {
    const value = zzzSkillText(parameter.desc);
    if (value) return { label, value };
    return;
  }
  const data = panelObject(first);
  function atLevel(key: string, alternate: string) {
    return sourceNumber(data, key, alternate) + sourceNumber(data, key + "_growth", alternate + "Growth") * (level - 1);
  }
  const main = sourceNumber(data, "main", "Main") + sourceNumber(data, "growth", "Growth") * (level - 1);
  const details = [
    main / 100,
    atLevel("stun_ratio", "StunRatio") / 100,
    atLevel("sp_recovery", "SpRecovery") / 10_000,
    atLevel("fever_recovery", "FeverRecovery") / 10_000,
    sourceNumber(data, "attribute_infliction", "AttributeInfliction") / 100,
    0,
  ];
  const format = data.format ?? data.Format;
  if (typeof format !== "string" || !details.every(Number.isFinite)) return;
  return { label, value: format === "%" ? `${main / 100}%` : String(main), details };
}

export function buildZzzSkills(raw: unknown, levels: readonly number[]): SkillSection[] | undefined {
  if (levels.length !== 6 || levels.some((level, index) =>
    !Number.isInteger(level) || level < (index === 5 ? 0 : 1) || level > defaults[index]!)) return;
  const data = panelObject(raw);
  const skill = panelObject(data.skill);
  const sections: SkillSection[] = [];
  for (const [index, kind] of skillKinds.entries()) {
    const level = levels[index]!;
    const descriptions: SkillBlock[] = [];
    const tables: SkillTable[] = [];
    if (kind === "core") {
      // The old model stores source level 1 at index 0 and replaces earlier rows of the same level.
      const core = Object.values(panelObject(panelObject(data.passive).level))
        .map(panelObject).findLast(row => row.level === level + 1);
      if (!core || !Array.isArray(core.name) || !Array.isArray(core.desc) || core.name.length !== core.desc.length) return;
      for (const [position, rawName] of core.name.entries()) {
        const name = zzzSkillText(rawName);
        const markup = core.desc[position];
        if (!name || typeof markup !== "string" || !zzzSkillText(markup)) return;
        descriptions.push({ name, markup });
      }
    } else {
      const entries = panelObject(skill[kind]).description;
      if (!Array.isArray(entries) || !entries.length) return;
      for (const entry of entries.map(panelObject)) {
        const name = zzzSkillText(entry.name);
        if (!name && Array.isArray(entry.param) && !entry.param.length) continue;
        if (!name) return;
        if (Array.isArray(entry.param)) {
          const rates = entry.param.map(row => skillRate(panelObject(row), level));
          if (rates.some(rate => rate === undefined)) return;
          tables.push({ name, rates: rates.filter(rate => rate !== undefined) });
        } else {
          if (typeof entry.desc === "string" && zzzSkillText(entry.desc)) descriptions.push({ name, markup: entry.desc });
        }
      }
    }
    if (!descriptions.length && !tables.some(table => table.rates.length)) return;
    sections.push({ kind, level, descriptions, tables });
  }
  return sections;
}
