import { expect, test } from "bun:test";
import type { ZzzPanelAvatar } from "@lotus-yunzai/hoyo-client";
import type { DamageData } from "./damage-engine/types.ts";
import { calculatePanelDamage } from "./panel-damage.ts";

const avatar: ZzzPanelAvatar = {
  id: 1431, name_mi18n: "叶瞬光", level: 30, rank: 0, rarity: "S", avatar_profession: 1,
  element_type: 200, sub_element_type: 4,
  skills: [0, 1, 2, 3, 5, 6].map(skill_type => ({ skill_type, level: 1 })),
  properties: [
    ["生命值", "1000"], ["攻击力", "100"], ["防御力", "100"], ["冲击力", "100"], ["暴击率", "5%"],
    ["暴击伤害", "50%"], ["异常掌控", "100"], ["异常精通", "100"], ["能量自动回复", "1.2"], ["穿透率", "0%"],
  ].map(([property_name, final]) => ({ property_name, base: "", final })),
};
const gear = { suits: {}, weapons: {} };

function coefficients(names: readonly string[], name: DamageData["anomaly"][number]["name"], element_type: number): DamageData {
  return {
    character: { skill: Object.fromEntries(names.map(type => [type, [1]])) },
    anomaly: [{ name, element_type, sub_element_type: 0, duration: 1, interval: 1, multiplier: 0.5 }],
    property: { idToName: () => null, nameToShortName3: name => name, nameZHToNameEN: () => "" },
  };
}

test("叶瞬光按原异常表计算同一角色的强击和明心境技能", () => {
  const data = coefficients(["ASF3", "ASZ2", "ASMS", "ASMP", "ASJ", "CF", "LTS", "EQP", "EQSF6", "EQSG", "RLS", "RZP", "RZS"], "强击", 200);
  const normal = calculatePanelDamage(avatar, data, gear, 11);
  expect(normal.selected.skill.type).toBe("EQSG");
  expect(normal.skills[0]?.result.expectDMG).toBeGreaterThan(0);
  expect(() => calculatePanelDamage({ ...avatar, sub_element_type: 0 }, data, gear)).toThrow(/原版伤害/u);
  const fullRank = calculatePanelDamage({ ...avatar, rank: 6 }, data, gear, 11);
  expect(fullRank.selected.result.expectDMG).toBeGreaterThan(normal.selected.result.expectDMG);
  expect(fullRank.skills.map(row => row.skill.type)).toEqual(normal.skills.map(row => row.skill.type));
});

test("零号·安比保留苍光隐藏连段和独立的六影追加攻击", () => {
  const zero = { ...avatar, id: 1381, name_mi18n: "零号·安比", element_type: 203, sub_element_type: 0 };
  const data = coefficients(["AP5", "CF", "EPC0", "EPC", "EPL", "EQ", "RL", "RZ"], "感电", 203);
  const initial = calculatePanelDamage(zero, data, gear, 4);
  expect(initial.selected.skill.type).toBe("EPC");
  expect(initial.skills.some(row => row.skill.type === "EPC0")).toBe(false);
  const fullRank = calculatePanelDamage({ ...zero, rank: 6 }, data, gear, 9);
  expect(fullRank.skills).toHaveLength(initial.skills.length + 1);
  expect(fullRank.selected.skill.name).toBe("6影电磁涡流");
  expect(() => calculatePanelDamage({ ...zero, id: 1011 }, data, gear)).toThrow(/原版伤害/u);
});
