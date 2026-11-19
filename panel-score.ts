import type { ZzzPanelAvatar } from "@lotus-yunzai/hoyo-client";
import { buildZzzPanelDetail, panelInteger, type PanelStat } from "./panel-detail.ts";
import { characterRules, mainStatsBySlot, statShortNames, substatBase, type CharacterRule, type NamedWeights } from "./panel-score-data.ts";

type Detail = ReturnType<typeof buildZzzPanelDetail>;
type Disc = NonNullable<Detail["discs"][number]>;
type Weights = Readonly<Partial<Record<number, number>>>;
type Build = { attack: number; crit: number; mastery: number; proficiency: number };
type Grade = "C" | "B" | "A" | "S" | "SS" | "SSS" | "ACE" | "MAX";

const critBuild = { 12102: 0.75, 20103: 1, 21103: 1, 23103: 1, 23203: 0.25, element: 1 };
const anomalyBuild = { 12102: 0.75, 23103: 1, 23203: 0.25, 31203: 1, 31402: 1, element: 1 };
const supportCrit = { ...critBuild, 23103: 0.75, 30502: 1 };
const supportAttack = { ...supportCrit, 12102: 1, 21103: 0.75 };
const supportAnomaly = { ...anomalyBuild, 23103: 0.75, 30502: 1 };

const rules: Readonly<Record<string, { weights: NamedWeights; match: (build: Build) => boolean }>> = {
  "主C·双爆": { weights: critBuild, match: ({ attack, crit, mastery, proficiency }) =>
    attack > 2400 && crit >= 2.2 && mastery < 150 && proficiency < 200 },
  "主C·异常": { weights: anomalyBuild, match: ({ attack, crit, mastery, proficiency }) =>
    crit < 2 && attack >= 2400 && (mastery >= 180 && proficiency >= 200 ||
      mastery >= 120 && proficiency >= 300 || mastery >= 150 && proficiency >= 250) },
  "命破·双爆": { weights: { 11102: 0.5, 12102: 0.25, 20103: 1, 21103: 1, element: 1 }, match: () => true },
  "锋御·双爆": { weights: { 13102: 1, 20103: 1, 21103: 0.75, 23103: 1, 23203: 0.25, element: 1 }, match: () => true },
  "辅助·双爆": { weights: supportCrit, match: ({ crit, proficiency }) => crit >= 1.5 && proficiency < 200 },
  "辅助·攻击": { weights: supportAttack, match: ({ crit }) => crit >= 1.5 },
  "辅助·异常": { weights: supportAnomaly, match: ({ crit, proficiency }) => crit < 2 && proficiency >= 200 },
  "冲击·双爆": { weights: { ...supportCrit, 12202: 1 }, match: ({ crit, mastery, proficiency }) =>
    crit >= 1.5 && mastery < 150 && proficiency < 200 },
  "冲击·攻击": { weights: { ...supportAttack, 12202: 1 }, match: ({ attack, crit, mastery, proficiency }) =>
    attack > 2000 && crit >= 1 && mastery < 150 && proficiency < 200 },
  "冲击·异常": { weights: { ...supportAnomaly, 12202: 1 }, match: ({ crit, mastery, proficiency }) =>
    crit < 2 && (mastery >= 150 || proficiency >= 200) },
};

const defaults: Readonly<Partial<Record<number, CharacterRule>>> = {
  1: ["主C·双爆"], 2: ["冲击·双爆", "冲击·攻击", "冲击·异常"], 3: ["主C·异常", "辅助·异常"],
  4: ["辅助·双爆", "辅助·异常"], 5: ["辅助·双爆", "辅助·异常"], 6: ["命破·双爆"], 7: ["锋御·双爆"],
};
const elementDamageId: Readonly<Partial<Record<number, number>>> = {
  200: 31503, 201: 31603, 202: 31703, 203: 31803, 204: 32303, 205: 31903,
};
const legacyPercentSubstats = new Set([11102, 12102, 13102, 20103, 21103]);
const baseGroups = [[11103, 11102, "生命值"], [12103, 12102, "攻击力"], [13103, 13102, "防御力"]] as const;

function propertyValue(value: string | undefined) {
  if (!value) return 0;
  const amount = Number.parseFloat(value);
  return value.endsWith("%") ? amount / 100 : amount;
}

export function buildZzzPanelWeights(avatar: ZzzPanelAvatar, properties: Detail["properties"]) {
  const config = characterRules[avatar.id] ?? defaults[panelInteger(avatar.avatar_profession, 1, 99) ?? 0];
  if (!config) return;
  const overrides = "weights" in config ? config.weights : undefined;
  const candidates = "weights" in config ? config.rules ?? [] : config;
  const find = (name: string) => properties.find(prop => prop.name === name);
  const val = (name: string) => propertyValue(find(name)?.value);
  const build = { attack: val("攻击力"), crit: val("暴击率") * 2 + val("暴击伤害"),
    mastery: val("异常掌控"), proficiency: val("异常精通") };
  const matched = candidates.find(name => rules[name]?.match(build)) ?? candidates.find(name => rules[name]);
  let rule = matched ? matched + (overrides && Object.keys(overrides).length ? "·改" : "") : "默认";
  let selected = { ...(matched ? rules[matched]!.weights : {}), ...overrides };
  // Built-in character hooks from the upstream score.js files for Ben, Alice and Vivian.
  if (avatar.id === 1121 && build.crit >= 2) {
    rule = "你没戴安全帽！";
    selected = { ...selected, ...critBuild, 11102: 0, 13102: 0.5, 12202: 0, 30502: 0, 31203: 0, 31402: 0 };
  } else if (avatar.id === 1401 && build.crit >= 2 && build.proficiency < 300) {
    rule = "直伤流";
    selected = { ...selected, ...critBuild, 11102: 0, 13102: 0, 12202: 0, 30502: 0, 31203: 0.5, 31402: 0 };
  } else if (avatar.id === 1331 && avatar.rank >= 4) {
    rule = "高影画";
    selected[21103] = 0.25;
  }
  const { element, ...weights } = selected;
  const id = elementDamageId[panelInteger(avatar.element_type, 1, 999) ?? 0];
  if (id && element !== undefined) weights[id] = element;
  for (const [flat, percent, name] of baseGroups) {
    const property = find(name);
    const base = propertyValue(property?.base ?? property?.value);
    if (base > 0 && weights[percent] && weights[flat] === undefined) {
      weights[flat] = +(substatBase[flat]! * 100 / (substatBase[percent]! * base) * weights[percent]).toFixed(2);
    }
  }
  return { rule, weights };
}

export function zzzDiscScoreComment(score: number): Grade {
  if (score <= 12) return "C";
  if (score < 20) return "B";
  if (score < 28) return "A";
  if (score < 32) return "S";
  if (score < 36) return "SS";
  if (score < 40) return "SSS";
  return score < 48 ? "ACE" : "MAX";
}

export function zzzPanelScoreComment(score: number): Grade {
  if (score < 80) return "C";
  if (score < 120) return "B";
  if (score < 160) return "A";
  if (score < 180) return "S";
  if (score < 200) return "SS";
  if (score < 220) return "SSS";
  return score < 280 ? "ACE" : "MAX";
}

// A displayed zero still contributes zero rolls. Older snapshots can lack the reported enhancement count.
function rolls(stat: PanelStat) {
  const value = Number.parseFloat(stat.value);
  const base = stat.id === undefined ? undefined : substatBase[stat.id];
  if (!base) return 1;
  return Math.max(0, Math.trunc(value / base - 1) + 1);
}

function scoreDisc(disc: Disc | undefined, slot: number, weights: Weights) {
  if (!disc) return;
  const main = disc.main[0]?.id;
  const mainStats = mainStatsBySlot[slot];
  if (main === undefined || !mainStats || !disc.rarity || disc.level === undefined || disc.level > 15) return;
  const eligible = Object.keys(substatBase).map(Number).filter(id => id !== main && weights[id])
    .sort((left, right) => weights[right]! - weights[left]!).slice(0, 4);
  const top = eligible[0];
  if (top === undefined) return 0;
  const maximum = weights[top]! * 6 + eligible.slice(1).reduce((total, id) => total + weights[id]!, 0);
  const actual = disc.extra.reduce((sum, stat) => sum + (weights[stat.id ?? 0] ?? 0) * rolls(stat), 0);
  const rarityMultiplier = disc.rarity === "S" ? 1 : disc.rarity === "A" ? 2 / 3 : 1 / 3;
  const levelMultiplier = 0.25 + disc.level * 0.05;
  if (slot <= 3) {
    return Math.max(actual / maximum * levelMultiplier * rarityMultiplier * 55, 12 * levelMultiplier * rarityMultiplier);
  }
  const bestMain = Math.max(0, ...mainStats.map(id => weights[id] ?? 0));
  const mainScore = bestMain ? 12 * (weights[main] ?? 0) / bestMain : 12;
  const subScore = actual / maximum * 43;
  return (mainScore + subScore) * levelMultiplier * rarityMultiplier;
}

export function buildZzzPanelScore(avatar: ZzzPanelAvatar, model = buildZzzPanelDetail(avatar)) {
  const weight = buildZzzPanelWeights(avatar, model.properties);
  if (!weight) return;
  const { rule, weights } = weight;
  const discs = model.discs.map((disc, slot) => {
    const score = scoreDisc(disc, slot + 1, weights);
    if (score !== undefined) return { score, grade: zzzDiscScoreComment(score) };
  });
  if (!discs.some(item => item !== undefined)) return;
  const stats = new Map<number, { id: number; name: string; count: number; weight: number }>();
  for (const disc of model.discs) for (const stat of disc?.extra ?? []) {
    if (stat.id === undefined) continue;
    const current = stats.get(stat.id) ?? {
      id: stat.id, name: statShortNames[stat.id] ?? stat.name, count: 0, weight: weights[stat.id] ?? 0,
    };
    current.count += rolls(stat);
    stats.set(stat.id, current);
  }
  const aggregate = [...stats.values()].sort((a, b) => b.count - a.count || b.weight - a.weight || a.id - b.id)
    .slice(0, 9).map(stat => ({
      ...stat,
      value: substatBase[stat.id] ? (substatBase[stat.id]! * stat.count).toFixed(1) +
        (legacyPercentSubstats.has(stat.id) ? "%" : "") : "0",
    }));
  const total = discs.reduce((sum, disc) => sum + (disc?.score ?? 0), 0);
  const useful = aggregate.reduce((sum, row) => sum + (row.weight ? row.count : 0), 0);
  const effective = aggregate.reduce((sum, row) => sum + row.count * row.weight, 0);
  return { discs, rule, weights, aggregate, total, grade: zzzPanelScoreComment(total), useful, effective };
}
