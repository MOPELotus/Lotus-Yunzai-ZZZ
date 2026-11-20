import { expect, test } from "bun:test";
import { buildZzzSkills, skillKinds, zzzSkillCommand, zzzSkillText } from "./skills-data.ts";
import { wrapZzzSkillEffect } from "./skills-card.ts";

test("旧技能可按顺序选等级，裸天赋保留图鉴分派", () => {
  expect(zzzSkillCommand("%星见雅技能")).toEqual({ name: "星见雅", levels: [12, 12, 12, 12, 12, 6] });
  expect(zzzSkillCommand("%星见雅技能1.2.C.4.5.f")).toEqual({ name: "星见雅", levels: [1, 2, 3, 4, 5, 6] });
  expect(zzzSkillCommand("#绝区零星见雅天赋 1 2 3 4 5 0")).toEqual({ name: "星见雅", levels: [1, 2, 3, 4, 5, 0] });
  expect(zzzSkillCommand("％星见雅技能 A b")).toEqual({ name: "星见雅", levels: [1, 2, 12, 12, 12, 6] });
  for (const message of [
    "%星见雅技能0", "%星见雅技能13", "%星见雅技能1.2.3.4.5.G", "%星见雅技能1 2 3 4 5 6 7", "%星见雅技能1..2",
    "%星见雅天赋", "#原神钟离天赋 1", "%星见雅技能图鉴", "%星见雅伤害 1", "%星见雅面板2",
  ]) expect(zzzSkillCommand(message)).toBeUndefined();
});

test("倍率采用旧首值和各原列，核心同等级后项覆盖，缺字段不估算", () => {
  const parameter = {
    main: 1200, growth: 57, format: "%", stun_ratio: 400, stun_ratio_growth: 25,
    sp_recovery: 7500, sp_recovery_growth: 150, fever_recovery: 1200, fever_recovery_growth: 130,
    attribute_infliction: 275,
  };
  const description = [
    { name: "普通攻击", desc: "造成<color=#ffffff>物理伤害</color>。" },
    { name: "招式", param: [
      { name: "倍率", param: { 1: parameter, 2: { ...parameter, main: 9999 } } },
      { name: "消耗", desc: "40点" },
    ] },
  ];
  const passive = { level: {
    1: { level: 1, name: ["旧项"], desc: ["旧描述"] },
    2: { level: 1, name: ["新项"], desc: ["<Term=Test>同级后项</Term>"] },
  } };
  const raw = { skill: Object.fromEntries(skillKinds.slice(0, 5).map(kind => [kind, { description }])), passive };
  const panels = buildZzzSkills(raw, [3, 4, 5, 6, 7, 0]);
  expect(panels?.map(({ kind }) => kind)).toEqual([...skillKinds]);
  expect(panels?.[0]?.tables[0]?.rates).toEqual([
    { label: "倍率", value: "13.14%", details: [13.14, 4.5, 0.78, 0.146, 2.75, 0] },
    { label: "消耗", value: "40点" },
  ]);
  expect(panels?.[4]?.tables[0]?.rates[0]?.value).toBe("15.42%");
  expect(panels?.[5]?.descriptions.map(({ name, markup }) => [name, zzzSkillText(markup)])).toEqual([["新项", "同级后项"]]);
  expect(buildZzzSkills(raw, [3, 4, 5, 6, 7, 6])).toBeUndefined();
  const incomplete = { ...raw, skill: { ...raw.skill, basic: { description: [
    { name: "无记录的倍率", param: [{ name: "倍率", param: { 1: { ...parameter, growth: undefined } } }] },
  ] } } };
  expect(buildZzzSkills(incomplete, [3, 4, 5, 6, 7, 0])).toBeUndefined();
});

test("技能效果自动折行时让句末标点跟随原字词，并保留强调样式", () => {
  const tokens = ["进", "入", "压", "制", "。", "蓄", "力", "；"].map(text => ({
    text, width: 1, color: text === "制" ? "#F6CA45" : undefined,
  }));
  const lines = wrapZzzSkillEffect(tokens, 4);
  expect(lines.map(line => line.map(({ text }) => text).join(""))).toEqual(["进入压", "制。蓄", "力；"]);
  expect(lines[1]?.[0]).toBe(tokens[3]);
  expect(lines.flat()).toEqual(tokens);
});

test("引号、括号和空格不把禁则标点挤到错误的行边界", () => {
  const tokens = [..."前缀「内容」 后续"].map(text => ({ text, width: 1 }));
  expect(wrapZzzSkillEffect(tokens, 3).map(line => line.map(({ text }) => text).join("")))
    .toEqual(["前缀", "「内", "容」 ", "后续"]);
  const source = [..."前缀 后续 ；结尾"].map(text => ({ text, width: 1 }));
  const lines = wrapZzzSkillEffect(source, 7);
  expect(lines.every(line => line.find(({ text }) => text.trim())?.text !== "；")).toBe(true);
  expect(lines.flat()).toEqual(source);
});
