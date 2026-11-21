import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import type { ZzzPanelAvatar } from "@lotus-yunzai/hoyo-client";
import { BuffManager, elementEnum, runtime, type buff } from "./damage-engine/BuffManager.ts";
import { Calculator, type damage } from "./damage-engine/Calculator.ts";
import { characterRules, setRules, weaponRules } from "./damage-engine/rules.ts";
import type { DamageAvatar, DamageData } from "./damage-engine/types.ts";
import { buildZzzPanelDetail, panelInteger, panelObject } from "./panel-detail.ts";
import { buildZzzPanelWeights } from "./panel-score.ts";
import { readPanelJson } from "./panel-storage.ts";

type Json = Record<string, unknown>;

interface VerifiedCharacter {
  readonly name: string;
  readonly profession: number;
  readonly element: number;
  readonly subElement?: number;
  readonly legacyMissingSkill?: string;
  readonly sha256: string;
}

const supported: Readonly<Partial<Record<number, VerifiedCharacter>>> = {
  // The legacy six-mindscape callback calls an unregistered Burn skill and produces no row.
  1011: { name: "安比", profession: 2, element: 203, sha256: "cffdaa277369cb79d72235b5c2403c58d3562dde94af60b6c5325024efd1d8bc" },
  1021: { name: "猫又", profession: 1, element: 200, sha256: "cfd7e6092b7044b1e104bfa3a8e7cb10f3f8f5c8d46a17c4b44689ee942542d0" },
  1031: { name: "妮可", profession: 4, element: 205, sha256: "4ccfa318856202f7e78465c708a2c0efe94481d93ddf29474aa282169055b12b" },
  1041: { name: "11号", profession: 1, element: 201, sha256: "93ded7504aeb902a68a32daf551711606f039d42b349b488ae1d9590a9ddc311" },
  1061: { name: "可琳", profession: 1, element: 200, sha256: "d13b2de26de840029974b48354158b92b83c505b57a45a168c72ec0b85b9b078" },
  1071: { name: "凯撒", profession: 5, element: 200, sha256: "81b75207d1abb83091ba23804419e3d596b1d5863c9ec9a470b3eca5c05bf1c0" },
  1081: { name: "比利", profession: 1, element: 200, sha256: "06d1ed4ca2515ecae66173ca316b97d12a433d25a6ede28730e553656299abb3" },
  1091: { name: "星见雅", profession: 3, element: 202, subElement: 1, sha256: "bfc43dfb0234160a06137a8b32a477073d5fd7f3eb79a6985a74e1a0cb0584f4" },
  1101: { name: "珂蕾妲", profession: 2, element: 201, sha256: "602dfe10cb42af35d31748fd6f887f0edb9058364edfad25a91dc3958dd5d755" },
  1111: { name: "安东", profession: 1, element: 203, sha256: "d1859f381dad54583995223ac9e49ed1a1b6e40d16fb34e778f86fd49cddb6c9" },
  1121: { name: "本", profession: 5, element: 201, sha256: "5df823bd765bee963f6e5f7d52be4f096a9feea43fd12247311c1ca55179c910" },
  1131: { name: "苍角", profession: 4, element: 202, sha256: "70fda67d406dae16a1437e3299b484fb8338609d13a96a24a4ec101fad6ba69c" },
  1141: { name: "莱卡恩", profession: 2, element: 202, sha256: "cbb4d2c0fcc005ef3d92b39c1d05e0b5d680e16f1550c03ec8111a585c040477" },
  1151: { name: "露西", profession: 4, element: 201, sha256: "0ec5c533da51aafb06d7255809545cc50a08f23d6b75fabd698ac01222c73d06" },
  1161: { name: "莱特", profession: 2, element: 201, sha256: "3eadfc54db9ba73c7dc9eaae427e1fc1f37e0a4f1a4890228222471cb5f1a429" },
  1171: { name: "柏妮思", profession: 3, element: 201, legacyMissingSkill: "Y6灼烧", sha256: "b35c40baccec033c525bf7314b61838715d050adfad174bcd41f452cca9274e8" },
  1181: { name: "格莉丝", profession: 3, element: 203, sha256: "7d93ed13291c0d8810d5c7524aa7d6eefdc7cacf9bf9b5dc0d0ef8d92007d3b1" },
  1191: { name: "艾莲", profession: 1, element: 202, sha256: "75ab8cc43f67ae8fe8757de47aa306f98de71bed1404015ae97f7bbc828e3aa9" },
  1201: { name: "悠真", profession: 1, element: 203, sha256: "31edafe98af2fe7639d60165220483507f82e0e73a093cc441c6a96b1553d307" },
  1211: { name: "丽娜", profession: 4, element: 203, sha256: "9e9729ad852a647443ee0bb58c830a93a2a421e36f225e09b4e17834fd1116dd" },
  1221: { name: "月城柳", profession: 3, element: 203, sha256: "4e3277b0e8ef8e80f2513bf52860b4d22102f305dd5293a05ef257857a6d2900" },
  1241: { name: "朱鸢", profession: 1, element: 205, sha256: "0b76e3486861aed30fc1cbde8b57d57272890b1023031bd1f94fc3778771cee5" },
  1251: { name: "青衣", profession: 2, element: 203, sha256: "e1612aa09c050520b73236d6944b49f607ced7ebe4222595b3cb53ffc1b7d2ad" },
  1261: { name: "简", profession: 3, element: 200, sha256: "8cc18079b1bd74306ec6cb77a95b012df6f939f6cce87c367153d003a695cd7b" },
  1271: { name: "赛斯", profession: 5, element: 203, sha256: "6380d522e7d5be7205e823c54be21a0bb14dcf5896cc73ec6ca50716b39e836b" },
  1281: { name: "派派", profession: 3, element: 200, sha256: "a72db07ab60f133e7057ef19db45e1d934d0ddbd2af9e932a9c57cfd9fe8d29a" },
  1291: { name: "雨果", profession: 1, element: 202, sha256: "29cd4627ef19bda8fa9df789cb7cc227be0f07799ff1686003d7aa62eef426dd" },
  1311: { name: "耀嘉音", profession: 4, element: 205, sha256: "a97f027e2a22ad2323b6e6b64a01ac634151fea384c3f220860882222ce14615" },
  1321: { name: "伊芙琳", profession: 1, element: 201, sha256: "5207fa7d8bd37fd2a442c434febaadf37fdc8c1c0253736f6af228eff7cb6655" },
  1331: { name: "薇薇安", profession: 3, element: 205, sha256: "66620bc682849691eb97147fbb0d9b35b9a45047364a3622b0763ec08e70bb68" },
  1351: { name: "波可娜", profession: 2, element: 200, sha256: "bb4b4e8076322f257f737808ff0193fe73cfba562773714768cb901f220e580d" },
  1361: { name: "「扳机」", profession: 2, element: 203, sha256: "1841ecae9080bfe1c835de27ab7cfb5d53b172f53de8a72a52ab6a1fb880754e" },
  1371: { name: "仪玄", profession: 6, element: 205, subElement: 2, sha256: "a1edd11459ec6b0d3bf3d73cded60539b396001a85e9b33155f40ae8cffd2757" },
  1381: { name: "零号·安比", profession: 1, element: 203, sha256: "68daa4b347c051cddb5b1c4013001585d5cf6f5bb3ae20e486a9b25e16b07cca" },
  1391: { name: "橘福福", profession: 2, element: 201, sha256: "e790a562d08c016ae20fa031dda53d447263b9e79777658654ccd26a0aafcdfb" },
  1401: { name: "爱丽丝", profession: 3, element: 200, sha256: "c0220ba78970491e61c29ddfdf79cc240d2c629fa4528b683115c1c5ec6d5494" },
  1411: { name: "柚叶", profession: 4, element: 200, sha256: "3c3a8333740bd84dfee39960f714be84f39e6f8cb36b3ca85ff86218b916cd6a" },
  1421: { name: "潘引壶", profession: 5, element: 200, sha256: "a0793e76b2146bacc679d4e412d94b68a96a79e10046de8182a7db0bbd1eb9b4" },
  1431: { name: "叶瞬光", profession: 1, element: 200, subElement: 4, sha256: "775582c3509b367d9275a0f14f0372448bad2548378b95373d6a8e9b3c407f48" },
  1441: { name: "狛野真斗", profession: 6, element: 201, sha256: "4c6218d95e5cb447a26364c35cc229d80ae51db30eb583c9a72b5508882f6912" },
  1461: { name: "「席德」", profession: 1, element: 203, sha256: "48dcf286cc281a0927b2381db4d2934c79b4b16f30bc35fae9fecc1e81f80e2c" },
  1471: { name: "般岳", profession: 6, element: 201, sha256: "109209afd043e352a084782437fe004ee22298d906659caf35b4460b31c0ee8a" },
  1491: { name: "千夏", profession: 4, element: 200, sha256: "66a34152431514724d7f2550a348120e91409ff8a113444932ca3d0bf9b7340c" },
  1531: { name: "星徽·比利", profession: 6, element: 200, sha256: "02510ec50f02b5f08806f1f5318758e865a2fa7296d5f7d08b0f22a1ef4e09a3" },
  1631: { name: "赛维里安", profession: 1, element: 204, sha256: "7b210d6c8885ae0b3c3dc7bd42610ca88086d14bfeb76a6f7a485746e7b57d93" },
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
    // Rupture panels replace these fields with Sheer Force and Adrenaline.
    if (!item && row.avatar_profession === 6 && (name === "能量自动回复" || name === "穿透率")) return 0;
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
  if (!expected || avatar.element_type !== expected.element || avatar.avatar_profession !== expected.profession ||
      (avatar.sub_element_type ?? 0) !== (expected.subElement ?? 0) ||
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
    if (!name || official.Name !== name || star === undefined || star < 1) {
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
    element_type: expected.element, sub_element_type: expected.subElement ?? 0, avatar_profession: expected.profession,
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
  readonly unavailableSkills: readonly string[];
}

function panelSkills(avatar: ZzzPanelAvatar, data: DamageData, gear: { suits: Json; weapons: Json }) {
  const active = adapt(avatar, gear);
  const character = supported[avatar.id]!;
  const rules = characterRules[character.name];
  const buffs = new BuffManager(active);
  const calculator = new Calculator(buffs, data);
  applyEquipment(active, buffs);
  if (!rules?.skills) throw new ZzzDamageUnavailable("当前没有该角色的原版伤害计算规则。");
  if (rules.buffs) buffs.new(cloneRule(rules.buffs.filter(rule => eligibleMindscape(rule, active.rank))));
  calculator.new(cloneRule([...rules.skills]));
  const visible = calculator.skills.filter(skill =>
    !skill.isHide && (!skill.check || skill.check({ avatar: active, buffM: buffs, calc: calculator, runtime })),
  );
  const skills = calculator.calc();
  const missing = visible.filter(skill => !skills.some(row => row.skill.name === skill.name && row.skill.type === skill.type));
  if (!skills.length || missing.some(skill => skill.type !== character.legacyMissingSkill) ||
      skills.some(row => !Number.isFinite(row.result.expectDMG) || !Number.isFinite(row.result.critDMG))) {
    throw new ZzzDamageUnavailable("现有角色属性无法完整核验伤害。");
  }
  return { calculator, skills, unavailableSkills: missing.map(skill => skill.name) };
}

export interface PanelDamageSummary {
  readonly skills: readonly damage[];
  readonly buffs: ReturnType<Calculator["calc_showInPanel_buffs"]>;
  readonly unavailableSkills: readonly string[];
}

export function calculatePanelDamage(avatar: ZzzPanelAvatar, data: DamageData, gear: { suits: Json; weapons: Json },
  requestedSkill?: number): PanelDamage {
  const { calculator, skills, unavailableSkills } = panelSkills(avatar, data, gear);
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
  return { skills, skillIndex, selected, substats, mainstats, unavailableSkills };
}

export function createPanelDamageReader() {
  let common: { resources: string; value: Promise<readonly unknown[]> } | undefined;
  async function load(avatar: ZzzPanelAvatar, resources?: string) {
    const character = supported[avatar.id];
    if (!character) throw new ZzzDamageUnavailable("该角色的原版伤害计算规则尚未核验。");
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
    return { data, gear: { suits: panelObject(suits), weapons: panelObject(weapons) } };
  }
  return Object.assign(async (avatar: ZzzPanelAvatar, resources?: string, requestedSkill?: number) => {
    const { data, gear } = await load(avatar, resources);
    return calculatePanelDamage(avatar, data, gear, requestedSkill);
  }, {
    async summary(avatar: ZzzPanelAvatar, resources?: string): Promise<PanelDamageSummary> {
      const { data, gear } = await load(avatar, resources);
      const { calculator, skills, unavailableSkills } = panelSkills(avatar, data, gear);
      return { skills, unavailableSkills, buffs: calculator.calc_showInPanel_buffs() };
    },
  });
}
