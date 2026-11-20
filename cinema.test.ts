import { expect, test } from "bun:test";
import { zzzCinemaCommand, zzzCinemaRanks } from "./cinema.ts";

test("识别旧意象单卡并保留图鉴与其他游戏命座入口", () => {
  for (const raw of ["%星见雅意象", "%星见雅意象影画", "#绝区零星见雅命座", "％星见雅意象", "/ZZZ星见雅命座"]) {
    expect(zzzCinemaCommand(raw)).toBe("星见雅");
  }
  for (const raw of ["%星见雅影画", "%星见雅图鉴", "%星见雅命座2", "#原神钟离命座", "星见雅意象", "%荷花插件星见雅意象"]) {
    expect(zzzCinemaCommand(raw)).toBeUndefined();
  }
});

test("只显示该条目完整的六档实际效果，按影画等级排列", () => {
  const rows = [
    { rank: 6, name: "最高档", description: "<Term=状态>叠加</Term>2层。" },
    ...Array.from({ length: 5 }, (_, index) => ({ rank: index + 1, name: `条目${index + 1}`, description: "持续12秒。" })),
  ];
  expect(zzzCinemaRanks(rows)?.map(({ rank }) => rank)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(zzzCinemaRanks(rows)?.[5]?.description).toBe("叠加2层。");
  expect(zzzCinemaRanks(rows.slice(1))).toBeUndefined();
  expect(zzzCinemaRanks([{ ...rows[0]!, rank: 5 }, ...rows.slice(1)])).toBeUndefined();
  expect(zzzCinemaRanks([{ ...rows[0]!, description: undefined }, ...rows.slice(1)])).toBeUndefined();
});
