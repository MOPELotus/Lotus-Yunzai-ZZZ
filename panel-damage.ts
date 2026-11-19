import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import type { ZzzPanelAvatar } from "@lotus-yunzai/hoyo-client";
import { BuffManager, elementEnum, type buff } from "./damage-engine/BuffManager.ts";
import { Calculator, type damage } from "./damage-engine/Calculator.ts";
import { characterRules, setRules, unsupportedSetRules, unsupportedWeaponRules, weaponRules } from "./damage-engine/rules.ts";
import type { DamageAvatar, DamageData } from "./damage-engine/types.ts";
import { buildZzzPanelDetail, panelInteger, panelObject } from "./panel-detail.ts";
import { buildZzzPanelWeights } from "./panel-score.ts";
import { readPanelJson } from "./panel-storage.ts";

type Json = Record<string, unknown>;

const supported: Readonly<Partial<Record<number, {name: string; profession: number; sha256: string}>>> = {
  1011: { name: "安比", profession: 2, sha256: "cffdaa277369cb79d72235b5c2403c58d3562dde94af60b6c5325024efd1d8bc" },
  1111: { name: "安东", profession: 1, sha256: "d1859f381dad54583995223ac9e49ed1a1b6e40d16fb34e778f86fd49cddb6c9" },
};
const maps = {
  AnomalyData: "3cef28fbf7ab8374423c95322275ed431bf9c2b098e778689732e6d942a6f31a",
  Property2Name: "e64ceb9fa44330cf82dc579e54e97e46cb67c54ed8b6daaf6785e43b5336dd3f",
  WeaponId2Data: "48c194cc8fb519a12e795a72cbd695392d109240fb760362a6b62e39d1826389",
  SuitData: "1f929b2dc0684ea22e95186771ae5d75456d5e7b4376da114c27e67a763129fd",
} as const;
const elements = [31503, 31603, 31703, 31803, 32303, 31903] as const;
const skillTypes = [0, 1, 2, 3, 5, 6];

export class ZzzDamageUnavailable extends Error {}

async function verified(root: string, file: string, sha256: string) {
  const value = await readPanelJson(root, file).catch(() => undefined);
  if (value !== undefined && createHash("sha256").update(JSON.stringify(value)).digest("hex") === sha256) return value;
  throw new ZzzDamageUnavailable("本机缺少与伤害规则版本一致的原始计算资料。");
}

function propertyMap(record: Json): DamageData["property"] {
  const byId = new Map(Object.entries(record) as [string, string[]][]);
  const byName = new Map<string, string[]>();
  for (const row of byId.values()) if (row[1] && !byName.has(row[1])) byName.set(row[1], row);
  return {
    idToName: id => byId.get(String(id))?.[1] ?? null,
    nameToShortName3: name => byName.get(name)?.[3] ?? name,
    nameZHToNameEN: name => byName.get(name)?.[0] ?? "",
  };
}

function originalNumber(value: unknown) {
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string" || !/^[-+]?\d{1,9}(?:\.\d{1,8})?%?$/u.test(text)) return;
  return Number.parseFloat(text) / (text.endsWith("%") ? 100 : 1);
}

function properties(row: ZzzPanelAvatar) {
  const list = Array.isArray(row.properties) ? row.properties.slice(0, 64).map(panelObject) : [];
  function get(name: string, base: boolean) {
    const item = list.find(line => line.property_name === name);
    const value = originalNumber(base ? item?.base || item?.final : item?.final);
    if (value !== undefined) return value;
    throw new ZzzDamageUnavailable(`角色面板缺少${name}，请先刷新面板。`);
  }
  function read(base: boolean) {
    return {
      HP: get("生命值", base), ATK: get("攻击力", base), DEF: get("防御力", base), Impact: get("冲击力", base),
      AnomalyMastery: get("异常掌控", base), AnomalyProficiency: get("异常精通", base),
      EnergyRegen: get("能量自动回复", base), CRITRate: get("暴击率", base), CRITDMG: get("暴击伤害", base),
      Pen: 0, PenRatio: get("穿透率", base),
    };
  }
  return { base: read(true), initial: read(false) };
}

function adapt(avatar: ZzzPanelAvatar, gear: { suits: Json; weapons: Json }): DamageAvatar {
  const model = buildZzzPanelDetail(avatar);
  const expected = supported[avatar.id];
  if (!expected || avatar.element_type !== 203 || avatar.avatar_profession !== expected.profession ||
      (avatar.sub_element_type !== undefined && avatar.sub_element_type !== 0) ||
      avatar.level < 1 || avatar.level > 60) {
    throw new ZzzDamageUnavailable("当前没有该角色配置的原版伤害计算规则。");
  }
  const { initial, base } = properties(avatar);
  const rawSkills = Array.isArray(avatar.skills) ? avatar.skills.map(panelObject) : [];
  const skills = skillTypes.flatMap(type => {
    const row = rawSkills.find(skill => skill.skill_type === type);
    const level = panelInteger(row?.level, 1, type === 5 ? 7 : 16);
    return level === undefined ? [] : [{ skill_type: type, level }];
  });
  if (skills.length !== skillTypes.length) throw new ZzzDamageUnavailable("角色面板的技能等级不完整，请先刷新面板。");

  let weapon: DamageAvatar["weapon"] = null;
  if (avatar.weapon !== undefined && avatar.weapon !== null) {
    const raw = panelObject(avatar.weapon);
    const official = panelObject(gear.weapons[model.weapon?.id ?? 0]);
    const name = model.weapon?.name;
    const star = model.weapon?.star;
    if (!name || official.Name !== name || star === undefined || star < 1 || unsupportedWeaponRules.has(name)) {
      throw new ZzzDamageUnavailable("当前没有该配置音擎的原版伤害计算规则。");
    }
    weapon = { name, star, profession: panelInteger(raw.profession ?? official.Profession, 1, 7) };
  }
  const rawEquips = Array.isArray(avatar.equip) ? avatar.equip : avatar.equip ? [avatar.equip] : [];
  if (rawEquips.length !== model.discs.filter(Boolean).length) {
    throw new ZzzDamageUnavailable("角色面板的驱动盘槽位不完整，请先刷新面板。");
  }
  const equip = model.discs.flatMap((disc, index) => {
    if (!disc) return [];
    const suit = panelObject(gear.suits[disc.suitId ?? 0]);
    const main = disc.main[0];
    const name = suit.name;
    if (typeof name !== "string" || !name || !main?.id) {
      throw new ZzzDamageUnavailable("角色面板的驱动盘主词条或套装缺失，请先刷新面板。");
    }
    initial.Pen += Number.parseFloat(disc.extra.find(stat => stat.id === 23203)?.value ?? "0");
    return [{ equipment_type: index + 1, equip_suit: { name },
      main_properties: [{ property_id: main.id, property_name: main.name, base: main.value }] }];
  });
  return {
    id: avatar.id, level: avatar.level, rank: avatar.rank, name_mi18n: avatar.name_mi18n,
    element_type: 203, sub_element_type: 0, avatar_profession: expected.profession,
    scoreWeight: buildZzzPanelWeights(avatar, model.properties)?.weights ?? {}, weapon, equip, skills,
    get base_properties() { return this._base_properties ?? base; },
    get initial_properties() { return this._initial_properties ?? initial; },
  };
}

function cloneRule<T>(rule: T): T {
  if (Array.isArray(rule)) return rule.map(cloneRule) as T;
  if (!rule || typeof rule !== "object") return rule;
  return Object.fromEntries(Object.entries(rule).map(([key, value]) => [key, cloneRule(value)])) as T;
}

function applyEquipment(avatar: DamageAvatar, buffs: BuffManager) {
  if (avatar.weapon && Object.hasOwn(weaponRules, avatar.weapon.name)) {
    const model = weaponRules[avatar.weapon.name]!;
    buffs.default({ name: avatar.weapon.name, source: "音擎" });
    if (model.buffs) buffs.new(cloneRule([...model.buffs]));
    model.calc?.(buffs, avatar.weapon.star);
    buffs.default({});
  }
  if (!avatar.equip.length) return;
  buffs.default({ name: "", source: "套装" });
  const count: Record<string, number> = Object.create(null);
  for (const disc of avatar.equip) {
    const main = disc.main_properties[0]!;
    const index = elements.indexOf(main.property_id as typeof elements[number]);
    if (index >= 0 && disc.equipment_type === 5) {
      buffs.new({ name: "驱动盘5号位", status: true, source: "套装", type: "增伤", value: Number.parseFloat(main.base) / 100,
        element: elementEnum[index + 200] as keyof typeof elementEnum });
    }
    const name = disc.equip_suit.name;
    count[name] = (count[name] ?? 0) + 1;
  }
  buffs.setCount = count;
  for (const [name, pieces] of Object.entries(count)) {
    if (pieces < 2) continue;
    if (unsupportedSetRules.has(name)) throw new ZzzDamageUnavailable("当前没有该配置套装的原版伤害计算规则。");
    if (!Object.hasOwn(setRules, name)) continue;
    const model = setRules[name]!;
    buffs.default("name", name);
    if (model.buffs) buffs.new(cloneRule(model.buffs.filter(rule =>
      (rule.source && rule.source !== "套装") || typeof rule.check !== "number" || rule.check <= pieces)));
    model.calc?.(buffs, pieces);
  }
  buffs.default({});
}

function eligibleMindscape(rule: buff, rank: number) {
  return rule.source ? rule.source !== "影画" || typeof rule.check !== "number" || rule.check <= rank :
    !/^\d影/u.test(rule.name) || Number(rule.name[0]) <= rank;
}

export interface PanelDamageCell {
  readonly add: { readonly name: string; readonly shortName: string; readonly valueBase: string };
  readonly del: PanelDamageCell["add"];
  readonly difference: number;
}

export interface PanelDamage {
  readonly skillIndex: number;
  readonly skills: readonly damage[];
  readonly selected: damage;
  readonly substats: readonly (readonly PanelDamageCell[])[];
  readonly mainstats: readonly (readonly PanelDamageCell[])[];
}

export function calculatePanelDamage(avatar: ZzzPanelAvatar, data: DamageData, gear: { suits: Json; weapons: Json },
  requestedSkill?: number): PanelDamage {
  const active = adapt(avatar, gear);
  const rules = characterRules[supported[avatar.id]!.name];
  const buffs = new BuffManager(active);
  const calculator = new Calculator(buffs, data);
  applyEquipment(active, buffs);
  if (!rules?.skills) throw new ZzzDamageUnavailable("当前没有该角色的原版伤害计算规则。");
  if (rules.buffs) buffs.new(cloneRule(rules.buffs.filter(rule => eligibleMindscape(rule, active.rank))));
  calculator.new(cloneRule([...rules.skills]));
  const skills = calculator.calc();
  if (skills.length !== rules.skills.length ||
      skills.some(row => !Number.isFinite(row.result.expectDMG) || !Number.isFinite(row.result.critDMG))) {
    throw new ZzzDamageUnavailable("现有角色属性无法完整核验伤害。");
  }
  let skillIndex = requestedSkill === undefined ? undefined : Math.min(skills.length - 1, Math.max(0, requestedSkill - 1));
  const substats = calculator.calc_sub_differences(skillIndex === undefined ? undefined : skills[skillIndex]!.skill);
  if (skillIndex === undefined) {
    const preferred = substats[0]?.[0]?.damage.skill;
    const index = preferred ? skills.findIndex(row => row.skill.name === preferred.name && row.skill.type === preferred.type) : -1;
    skillIndex = index < 0 ? skills.length - 1 : index;
  }
  const selected = skills[skillIndex]!;
  const mainstats = calculator.calc_main_differences(selected.skill);
  if ([...substats, ...mainstats].some(row => row.some(cell => !Number.isFinite(cell.difference)))) {
    throw new ZzzDamageUnavailable("现有角色属性无法完整核验词条变化。");
  }
  return { skills, skillIndex, selected, substats, mainstats };
}

export function createPanelDamageReader() {
  let common: { resources: string; value: Promise<readonly unknown[]> } | undefined;
  return async (avatar: ZzzPanelAvatar, resources: string | undefined, requestedSkill?: number) => {
    const character = supported[avatar.id];
    if (!character) throw new ZzzDamageUnavailable("当前只有安比·德玛拉和安东的原版伤害规则已经核验。");
    if (!resources) throw new ZzzDamageUnavailable("本机未配置旧版伤害计算资料目录。");
    if (!common || common.resources !== resources) {
      const pending = Promise.all(Object.entries(maps).map(([name, hash]) => verified(resources, `map/${name}.json`, hash)));
      common = { resources, value: pending };
      void pending.catch(() => { if (common?.value === pending) common = undefined; });
    }
    const root = Bun.env.LOTUS_ZZZ_DAMAGE_DATA_DIR || join(dirname(resources), "dist", "model", "damage", "character");
    const [[anomalyData, properties, weapons, suits], rankData] = await Promise.all([
      common.value, verified(root, `${character.name}/data.json`, character.sha256),
    ]);
    const data: DamageData = {
      anomaly: anomalyData as DamageData["anomaly"], character: rankData as DamageData["character"],
      property: propertyMap(panelObject(properties)),
    };
    return calculatePanelDamage(avatar, data, { suits: panelObject(suits), weapons: panelObject(weapons) }, requestedSkill);
  };
}
