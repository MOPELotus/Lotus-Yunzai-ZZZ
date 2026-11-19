import type { ZzzPanelAvatar } from "@lotus-yunzai/hoyo-client";

export function panelObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function panelInteger(value: unknown, minimum: number, maximum: number) {
  const parsed = typeof value === "string" && /^\d{1,6}$/u.test(value) ? Number(value) : value;
  if (typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum) return parsed;
}

function panelName(value: unknown) {
  if (typeof value === "string" && value.isWellFormed() && value.length <= 120 && !/[\p{Cc}\p{Cf}]/u.test(value)) {
    return value.trim() || undefined;
  }
}

function statValue(value: unknown) {
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text === "string" && /^[-+]?\d{1,9}(?:\.\d{1,8})?%?$/u.test(text)) return text;
}

// The old panel places Basic, Dodge, Assist, Special, Chain, Core on the skill strip.
const skillTypes = [0, 2, 6, 1, 3, 5] as const;
const elements: Readonly<Record<number, readonly [string, number]>> = {
  200: ["Physical", 315], 201: ["Fire", 316], 202: ["Ice", 317], 203: ["Electric", 318],
  204: ["Wind", 323], 205: ["Ether", 319], 300: ["Lumiflux", 0],
};
const subElements: Readonly<Record<string, string>> = { "200:4": "HonedEdge", "202:1": "Frost", "205:2": "AuricInk" };

export interface PanelStat {
  readonly id?: number;
  readonly name: string;
  readonly value: string;
  readonly base?: string;
  readonly added?: string;
  readonly enhancements?: number;
}

function equipmentStats(value: unknown, limit: number): readonly PanelStat[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).flatMap(value => {
    const row = panelObject(value);
    const name = panelName(row.property_name);
    const stat = statValue(row.base);
    if (!name || stat === undefined) return [];
    return [{
      id: panelInteger(row.property_id, 1, 999_999), name, value: stat,
      enhancements: panelInteger(row.add, 0, 5),
    }];
  });
}

function equipment(value: unknown) {
  const row = panelObject(value);
  const id = panelInteger(row.id, 1, 999_999);
  const name = panelName(row.name);
  if (!id || !name) return;
  return {
    id, name, level: panelInteger(row.level, 0, 100),
    rarity: row.rarity === "S" || row.rarity === "A" || row.rarity === "B" ? row.rarity : undefined,
    main: equipmentStats(row.main_properties, 2), extra: equipmentStats(row.properties, 4),
  };
}

export function buildZzzPanelDetail(avatar: ZzzPanelAvatar) {
  const profession = panelInteger(avatar.avatar_profession, 1, 99);
  const elementId = panelInteger(avatar.element_type, 1, 99_999) ?? 0;
  const subId = panelInteger(avatar.sub_element_type, 0, 99_999) ?? 0;
  const element = elements[elementId];
  const statNames = [
    "生命值", profession === 7 ? "锐暴伤害" : "攻击力", "防御力", "冲击力",
    "暴击率", "暴击伤害", "异常掌控", "异常精通",
    ...(profession === 6 ? ["贯穿力", "闪能自动累积"] : ["穿透率", profession === 7 ? "锐能自动累积" : "能量自动回复"]),
  ];
  const sourceStats = Array.isArray(avatar.properties) ? avatar.properties.slice(0, 64).map(panelObject) : [];
  const damage = element?.[1] ? sourceStats.find(row => panelInteger(row.property_id, 1, 999_999) === element[1]) : undefined;
  const properties = [...statNames.map(name => sourceStats.find(row => row.property_name === name)), damage]
    .flatMap((row): PanelStat[] => {
      if (!row) return [];
      const name = panelName(row.property_name);
      const value = statValue(row.final);
      if (!name || value === undefined) return [];
      return [{ id: panelInteger(row.property_id, 1, 999_999), name, value,
        base: statValue(row.base), added: statValue(row.add) }];
    });

  const knownSkills = Array.isArray(avatar.skills) ? avatar.skills.slice(0, 16).map(panelObject) : [];
  const skills = skillTypes.map(type => panelInteger(
    knownSkills.find(skill => panelInteger(skill.skill_type, 0, 20) === type)?.level, 0, 30,
  ));
  const rawWeapon = equipment(avatar.weapon);
  const weapon = rawWeapon && { ...rawWeapon, star: panelInteger(panelObject(avatar.weapon).star, 0, 5) };

  const slots = new Map<number, NonNullable<ReturnType<typeof equipment>> & { suitId?: number }>();
  const rawDiscs = Array.isArray(avatar.equip) ? avatar.equip.slice(0, 24) : [avatar.equip];
  for (const value of rawDiscs) {
    const row = panelObject(value);
    const slot = panelInteger(row.equipment_type, 1, 6);
    const item = equipment(value);
    if (slot && item && !slots.has(slot)) {
      const suitId = panelInteger(panelObject(row.equip_suit).suit_id, 1, 999_999) ??
        (item.id >= 10_000 && item.id < 100_000 ? Math.trunc(item.id / 100) * 100 : undefined);
      slots.set(slot, { ...item, suitId });
    }
  }
  const paintingSuffix = typeof avatar.role_vertical_painting_url === "string"
    ? new RegExp(`/role_vertical_painting_${avatar.id}_(\\d{1,6})\\.png$`, "u").exec(avatar.role_vertical_painting_url)?.[1]
    : undefined;
  return {
    name: avatar.full_name_mi18n ?? avatar.name_mi18n,
    element: subElements[`${elementId}:${subId}`] ?? element?.[0],
    skinId: panelInteger(avatar.skin_id, 1, 999_999) ?? panelInteger(paintingSuffix, 1, 999_999),
    properties, skills, weapon, discs: Array.from({ length: 6 }, (_, index) => slots.get(index + 1)),
  };
}
