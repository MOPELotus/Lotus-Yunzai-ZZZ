import { fileURLToPath } from "node:url";
import { normalizeZzzPanelAvatar } from "@lotus-yunzai/hoyo-client";
import { panelInteger, panelObject } from "./panel-detail.ts";
import { readPanelJson } from "./panel-storage.ts";

type Json = Record<string, unknown>;
const bundledResources = fileURLToPath(new URL("./enka-data/", import.meta.url));
const statDefinitions: Readonly<Record<number, readonly [string, string]>> = {
  111: ["生命值", "HpMax"], 121: ["攻击力", "Attack"], 122: ["冲击力", "BreakStun"], 131: ["防御力", "Defence"],
  201: ["暴击率", "Crit"], 211: ["暴击伤害", "CritDamage"], 231: ["穿透率", "PenRate"], 232: ["穿透值", "PenDelta"],
  305: ["能量自动回复", "SpRecover"], 312: ["异常精通", "ElementMystery"], 314: ["异常掌控", "ElementAbnormalPower"],
  315: ["物理属性伤害加成", "PhysDmgBonus"], 316: ["火属性伤害加成", "FireDmgBonus"],
  317: ["冰属性伤害加成", "IceDmgBonus"], 318: ["电属性伤害加成", "ThunderDmgBonus"],
  319: ["以太伤害加成", "EtherDmgBonus"], 323: ["风属性伤害加成", "WindDmgBonus"],
};
const percentTotals = new Set([201, 211, 231, 315, 316, 317, 318, 319, 323]);
const percentEquipment = new Set([11102, 12102, 12202, 13102, 30502, 31402]);
const driveRarities: Readonly<Record<string, readonly [string, number]>> = { "2": ["B", 30], "3": ["A", 25], "4": ["S", 20] };
const subElement: Readonly<Record<number, number>> = { 1091: 1, 1371: 2, 1431: 4 };

function numeric(value: unknown) {
  const parsed = typeof value === "string" && /^-?\d{1,10}(?:\.\d{1,6})?$/u.test(value) ? Number(value) : value;
  if (typeof parsed === "number" && Number.isFinite(parsed) && Math.abs(parsed) <= 1e10) return parsed;
}

function stat(id: number, value: number, add?: number, name?: string) {
  const group = Math.trunc(id / 100);
  const known = statDefinitions[group]?.[0];
  if (!known) return;
  const percent = percentTotals.has(group) || percentEquipment.has(id);
  const base = percent ? `${Number((value / 100).toFixed(2))}%` :
    id === 30503 ? (value / 100).toFixed(2) : String(Math.trunc(value + 1e-8));
  return { property_id: id, property_name: name ?? known, base, add };
}

function weapon(input: unknown, catalog: Json) {
  if (input === undefined || input === null) return null;
  const raw = panelObject(input);
  const id = panelInteger(raw.Id, 0, 999_999);
  if (id === 0) return null;
  if (id === undefined) return undefined;
  const data = panelObject(catalog[id]);
  const level = panelInteger(raw.Level, 0, 60);
  const star = panelInteger(raw.UpgradeLevel, 0, 5);
  const limit = panelInteger(raw.BreakLevel, 0, 5);
  if (typeof data.Name !== "string" || level === undefined || star === undefined || limit === undefined) return undefined;
  const levelData = panelObject(panelObject(data.Level)[level]);
  const breakthrough = panelObject(panelObject(data.Stars)[limit]);
  const attackRate = numeric(levelData.Rate), starRate = numeric(breakthrough.StarRate);
  const subRate = numeric(breakthrough.RandRate);
  function from(key: "BaseProperty" | "RandProperty", rate: number | undefined) {
    const property = panelObject(data[key]);
    const keyId = panelInteger(property.Id, 1, 999_999);
    const amount = numeric(property.Value);
    if (rate === undefined || keyId === undefined || amount === undefined) return;
    return stat(keyId, amount * (1 + rate / 10_000), undefined, typeof property.Name === "string" ? property.Name : undefined);
  }
  const main = from("BaseProperty", attackRate !== undefined && starRate !== undefined ? attackRate + starRate : undefined);
  const extra = from("RandProperty", subRate);
  return { id, level, name: data.Name, star, rarity: data.Rarity, profession: panelInteger(data.Profession, 1, 99),
    main_properties: main ? [main] : [], properties: extra ? [extra] : [] };
}

function disc(input: unknown, catalog: Json) {
  const row = panelObject(input);
  const slot = panelInteger(row.Slot, 1, 6);
  const data = panelObject(row.Equipment);
  const id = panelInteger(data.Id, 10_000, 99_999);
  const level = panelInteger(data.Level, 0, 15);
  if (!slot || !id || level === undefined) return;
  const setId = Math.trunc(id / 100) * 100;
  const suit = panelObject(catalog[setId]);
  const rarity = driveRarities[String(id)[3]!];
  if (typeof suit.name !== "string" || !rarity) return;
  function stats(input: unknown, limit: number, main: boolean) {
    if (!main && input === undefined) return [];
    if (!Array.isArray(input) || input.length > limit || (main && !input.length)) return;
    const rows = input.flatMap(input => {
      const row = panelObject(input);
      const id = panelInteger(row.PropertyId, 1, 999_999), value = numeric(row.PropertyValue);
      const rolls = panelInteger(row.PropertyLevel, 1, 6);
      if (!id || value === undefined || (!main && rolls === undefined)) return [];
      const out = stat(id, value * (main ? 1 + level! * rarity![1] / 100 : rolls!), main ? undefined : rolls! - 1);
      return out ? [out] : [];
    });
    if (rows.length === input.length) return rows;
  }
  const main = stats(data.MainPropertyList ?? data.MainStatList, 1, true);
  const subs = stats(data.RandomPropertyList, 4, false);
  if (!main || !subs) return;
  return {
    id, equipment_type: slot, level, name: `${suit.name}[${slot}]`, rarity: rarity[0], equip_suit: { suit_id: setId },
    main_properties: main, properties: subs,
  };
}

// Adapts the source formatter's promotion, W-Engine, set bonus and Drive Disc totals.
function totals(raw: Json, partner: Json, id: number, level: number, profession: number,
  engine: ReturnType<typeof weapon>, discs: readonly NonNullable<ReturnType<typeof disc>>[], suits: Json) {
  const promotion = panelInteger(raw.PromotionLevel, 0, 6);
  const core = panelInteger(raw.CoreSkillEnhancement, 0, 6);
  if (promotion === undefined || core === undefined ||
      engine && (engine.main_properties.length !== 1 || engine.properties.length !== 1) ||
      discs.some(item => item.main_properties.length !== 1)) return [];
  const promotionData = panelObject(panelObject(partner.Level)[Math.max(1, promotion)]);
  const coreStats = panelObject(panelObject(panelObject(partner.ExtraLevel)[core]).Extra);
  const growthNames: Readonly<Record<number, string>> = { 111: "HpGrowth", 121: "AttackGrowth", 131: "DefenceGrowth" };
  const extra: { readonly property_id: number; readonly base: string }[] = [...(engine?.properties ?? []),
    ...discs.flatMap(item => [...item.main_properties, ...item.properties])];
  const setCounts = new Map<number, number>();
  for (const { equip_suit: { suit_id } } of discs) setCounts.set(suit_id, (setCounts.get(suit_id) ?? 0) + 1);
  for (const [setId, count] of setCounts) {
    if (count < 2) continue;
    const setStats = panelObject(suits[setId]).properties;
    if (!Array.isArray(setStats)) continue;
    for (const rawStat of setStats.map(panelObject)) {
      const id = panelInteger(rawStat.property_id, 1, 999_999);
      if (id && typeof rawStat.base === "string" && /^\d{1,6}(?:\.\d{1,3})?%?$/u.test(rawStat.base)) {
        extra.push({ property_id: id, base: rawStat.base });
      }
    }
  }
  const attackCore = numeric(panelObject(coreStats[12102]).Value);
  if (attackCore !== undefined) {
    const addition = stat(12102, attackCore);
    if (addition) extra.push(addition);
  }
  if ([111, 121, 131].some(key => {
    const [, name] = statDefinitions[key]!;
    return numeric(partner[name]) === undefined || numeric(promotionData[name]) === undefined ||
      numeric(partner[growthNames[key]!]) === undefined;
  }) || (core && !Object.keys(coreStats).length)) return [];
  const values = new Map<number, { base: number; add: number }>();
  for (const [key, [_, name]] of Object.entries(statDefinitions)) {
    const group = Number(key);
    const growth = growthNames[group];
    let base = numeric(partner[name]) ?? 0;
    if (growth) base += (numeric(partner[growth]) ?? 0) * (level - 1) / 10_000 + (numeric(promotionData[name]) ?? 0);
    base += numeric(panelObject(coreStats[group * 100 + 1]).Value) ?? 0;
    if (group === 121 && engine) base += Number(engine.main_properties[0]?.base);
    base = Math.trunc(base);
    if (percentTotals.has(group) || group === 305) base /= 100;
    const add = extra.filter(row => Math.trunc(row.property_id / 100) === group).reduce((sum, row) => {
      const amount = Number.parseFloat(row.base);
      return sum + (row.base.endsWith("%") && !percentTotals.has(group) ? base * amount / 100 : amount);
    }, 0);
    values.set(group, { base, add });
  }
  // Ben's Core passive is the source formatter's direct DEF to ATK contribution.
  if (id === 1121) {
    const defence = values.get(131)!, attack = values.get(121)!;
    attack.add += Math.trunc([0.4, 0.46, 0.52, 0.6, 0.66, 0.72, 0.8][core]! * Math.trunc(defence.base + defence.add));
  }
  const properties = [...values].map(([group, { base, add }]) => {
    const ratio = percentTotals.has(group);
    const decimals = ratio ? 1 : group === 305 ? 2 : 0;
    const adjusted = group === 111 ? Math.ceil(add) :
      ratio ? add : Math.trunc(add * 10 ** decimals) / 10 ** decimals;
    const format = (number: number) => number.toFixed(decimals) + (ratio ? "%" : "");
    return { property_id: group, property_name: statDefinitions[group]![0],
      base: format(base), add: format(adjusted), final: format(base + adjusted) };
  });
  if (profession === 6) {
    const hp = Number(properties.find(row => row.property_id === 111)?.final);
    const attack = Number(properties.find(row => row.property_id === 121)?.final);
    const force = String(Math.trunc(hp / 10) + Math.trunc(attack * 0.3));
    properties.push({ property_id: 19, property_name: "贯穿力", base: "0", add: force, final: force });
    properties.push({ property_id: 20, property_name: "闪能自动累积", base: "2", add: "0", final: "2" });
  }
  return properties;
}

const skillTypes = new Set([0, 1, 2, 3, 5, 6]);

export function formatEnkaPanel(raw: Json, { partners, weapons, suits }: { partners: Json; weapons: Json; suits: Json }) {
  const id = panelInteger(raw.Id, 1, 999_999);
  const level = panelInteger(raw.Level, 1, 60);
  const rank = panelInteger(raw.TalentLevel, 0, 6);
  const partner = panelObject(partners[id ?? 0]);
  const profession = panelInteger(partner.WeaponType, 1, 99);
  if (!id || level === undefined || rank === undefined || !profession || typeof partner.name !== "string") return;
  const engine = weapon(raw.Weapon, weapons);
  const equipment = raw.EquippedList ?? [];
  if (engine === undefined || !Array.isArray(equipment) || equipment.length > 6) return;
  const equipped = equipment.filter(input => {
    const row = panelObject(input);
    if (input === null) return false;
    if (panelInteger(row.Slot, 1, 6) === undefined) return true;
    return row.Equipment !== null && row.Equipment !== undefined && panelInteger(panelObject(row.Equipment).Id, 0, 999_999) !== 0;
  });
  const discs = equipped.flatMap(input => {
    const item = disc(input, suits);
    return item ? [item] : [];
  });
  if (equipped.length !== discs.length || new Set(discs.map(item => item.equipment_type)).size !== discs.length) return;
  const skills = (Array.isArray(raw.SkillLevelList) ? raw.SkillLevelList.slice(0, 16) :
    Object.entries(panelObject(raw.SkillLevelList)).slice(0, 16).map(([Index, Level]) => ({ Index, Level }))).flatMap(entry => {
    const row = panelObject(entry);
    const type = panelInteger(row.Index, 0, 6), level = panelInteger(row.Level, 0, 20);
    if (type === undefined || !skillTypes.has(type) || level === undefined) return [];
    return [{ skill_type: type, level: type !== 5 && rank >= 3 ? level + (rank >= 5 ? 4 : 2) : level }];
  });
  return normalizeZzzPanelAvatar({
    id, level, rank, rarity: partner.Rarity, name_mi18n: partner.name, full_name_mi18n: partner.full_name,
    element_type: panelInteger(partner.ElementType, 1, 999), sub_element_type: subElement[id] ?? 0,
    avatar_profession: profession, skin_id: panelInteger(raw.SkinId, 0, 9_999_999),
    equip: discs, weapon: engine, skills, properties: totals(raw, partner, id, level, profession, engine, discs, suits),
  });
}

async function readEnkaPanelTables(resources: string) {
  const names = ["PartnerId2Data", "WeaponId2Data", "SuitData"] as const;
  const [partners, weapons, suits] = await Promise.all(names.map(async name =>
    panelObject(await readPanelJson(resources, `map/${name}.json`).catch(() => undefined))));
  if (partners && weapons && suits && Object.keys(partners).length && Object.keys(weapons).length && Object.keys(suits).length) {
    return { partners, weapons, suits };
  }
}

export async function loadEnkaPanelTables(resources: string | undefined) {
  return (resources ? await readEnkaPanelTables(resources) : undefined) ?? await readEnkaPanelTables(bundledResources);
}
