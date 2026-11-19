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
    property: {
      idToName: () => null,
      nameToShortName3: name => name,
      nameZHToNameEN: name => name === "冲击力" ? "Impact" : "",
    },
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

test("星徽·比利的六影贯穿附加在原技能，保留普通比利的独立规则", () => {
  const starlight = {
    ...avatar, id: 1531, name_mi18n: "星徽·比利", avatar_profession: 6, sub_element_type: 0,
  };
  const data = coefficients(["APZ", "AP4", "CC", "CFJ", "CFW", "EPD", "EPT", "EQG", "EQZ", "EQY", "LK", "LT", "RL", "RZ"], "强击", 200);
  const initial = calculatePanelDamage(starlight, data, gear, 14);
  const fullRank = calculatePanelDamage({ ...starlight, rank: 6 }, data, gear, 14);
  expect(fullRank.selected.skill.type).toBe("RZ");
  expect(fullRank.selected.skill.isSheerDMG).toBe(true);
  expect(fullRank.skills.map(row => row.skill.type)).toEqual(initial.skills.map(row => row.skill.type));
  expect(fullRank.selected.result.expectDMG).toBeGreaterThan(initial.selected.result.expectDMG);
  expect(() => calculatePanelDamage({ ...starlight, id: 1081 }, data, gear)).toThrow(/原版伤害/u);
});

test("赛维里安沿用风属性，隐藏风刃并计入瞬风裂毁", () => {
  const severian = {
    ...avatar, id: 1631, name_mi18n: "赛维里安", element_type: 204, sub_element_type: 0,
  };
  const data = coefficients(["AX", "APL", "AP4", "CF", "EQ1", "EQ2", "RL", "RZ", "LT", "LS"], "强击", 200);
  const initial = calculatePanelDamage(severian, data, gear, 5);
  const stronger = calculatePanelDamage(severian, {
    ...data, character: { skill: { ...data.character.skill, EQ2: [2] } },
  }, gear, 5);
  expect(initial.selected.skill.type).toBe("EQ1");
  expect(initial.selected.skill.element).toBe("Wind");
  expect(initial.skills.some(row => row.skill.type === "EQ2")).toBe(false);
  expect(stronger.selected.result.expectDMG).toBeGreaterThan(initial.selected.result.expectDMG);
  expect(() => calculatePanelDamage({ ...severian, element_type: 205 }, data, gear)).toThrow(/原版伤害/u);
});

test("两件音擎使用固定资料中的精炼档位与职业，错职业时只保留面板属性", () => {
  const qingyi = {
    ...avatar, id: 1251, name_mi18n: "青衣", avatar_profession: 2, element_type: 203, sub_element_type: 0,
  };
  const banyue = {
    ...avatar, id: 1471, name_mi18n: "般岳", avatar_profession: 6, element_type: 201, sub_element_type: 0,
  };
  const qingyiData = coefficients(["AQ", "CF", "EQ", "RL", "RZ"], "感电", 203);
  const banyueData = coefficients([
    "AA4", "AE4", "AFS", "AQS", "ACY", "CF", "EQAEA", "EQEEA", "EQEAE", "EQAAE", "EQAEAEEA",
    "EQEAEAAE", "LTAX", "LTCX", "RL", "RZ",
  ], "灼烧", 201);
  const engines = [
    { id: 12009, name: "「湍流」-斧型", rarity: "B", profession: 2, type: "冲击力", amounts: [9, 10, 11, 12, 13] },
    { id: 13014, name: "电波漫步", rarity: "A", profession: 6, type: "贯穿力", amounts: [240, 276, 312, 348, 384] },
  ] as const;
  for (const engine of engines) {
    const verified = { suits: {}, weapons: { [engine.id]: { Name: engine.name, Profession: engine.profession } } };
    for (const [index, expected] of engine.amounts.entries()) {
      const weapon = { id: engine.id, name: engine.name, rarity: engine.rarity, star: index + 1, level: 30 };
      const q = calculatePanelDamage({ ...qingyi, weapon }, qingyiData, verified, 2);
      const b = calculatePanelDamage({ ...banyue, weapon }, banyueData, verified, 1);
      const matching = engine.profession === 2 ? q : b;
      const mismatched = matching === q ? b : q;
      const applied = matching.selected.usefulBuffs.find(buff => buff.name === engine.name);
      expect(applied).toMatchObject({ source: "音擎", type: engine.type });
      expect(applied?.value).toBeCloseTo(expected);
      expect(mismatched.selected.usefulBuffs.some(buff => buff.name === engine.name)).toBe(false);
    }
  }
});
