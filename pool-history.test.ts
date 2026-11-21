import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createZzzPoolHistory, decodeZzzPoolHistory, zzzPoolHistoryCommand, zzzPoolHistoryUrl } from "./pool-history.ts";

const rows = [
  { type: "角色", version: "1.1上半", timer: "1.1版本更新后 ~ 2024/09/04 11:59:59", s: "艾莲", a: ["妮可"] },
  { type: "武器", version: "1.1上半", timer: "1.1版本更新后 ~ 2024/09/04 11:59:59", s: "深海访客", a: ["聚宝箱"] },
  { type: "角色", version: "1.0下半", timer: "2024/07/24 12:00:00 ~ 2024/08/13 14:59:59", s: "朱鸢", a: ["妮可"] },
];

test("历史查询识别旧前缀、名称和 S/A 分类", () => {
  expect(zzzPoolHistoryCommand("%鲨鱼卡池历史")).toBe("鲨鱼");
  expect(zzzPoolHistoryCommand("/ZZZ深海访客复刻记录")).toBe("深海访客");
  expect(zzzPoolHistoryCommand("#绝区零妮可复刻统计")).toBe("妮可");
  expect(zzzPoolHistoryCommand("%角色卡池历史")).toEqual({ type: "角色", rank: "S" });
  expect(zzzPoolHistoryCommand("#zzz四星代理人复刻记录")).toEqual({ type: "角色", rank: "A" });
  expect(zzzPoolHistoryCommand("％S音擎复刻统计")).toEqual({ type: "武器", rank: "S" });
  expect(zzzPoolHistoryCommand("#zzzA级音擎复刻统计")).toEqual({ type: "武器", rank: "A" });
  expect(zzzPoolHistoryCommand("%2.7下半卡池")).toEqual({ version: "2.7", phase: "下半" });
  expect(zzzPoolHistoryCommand("#zzzv2.7卡池")).toEqual({ version: "2.7", phase: undefined });
  for (const command of ["%卡池历史", "%复刻历史", "%卡池统计", "%复刻统计", "%卡池记录", "%复刻记录"]) {
    expect(zzzPoolHistoryCommand(command)).toEqual({ kind: "all" });
  }
  expect(zzzPoolHistoryCommand("%艾莲卡池")).toEqual({ kind: "legacy", query: "艾莲" });
  expect(zzzPoolHistoryCommand("#绝区零艾莲复刻")).toEqual({ kind: "legacy", query: "艾莲" });
  for (const command of ["艾莲卡池历史", "%音擎卡池历史", "%卡池", "%本期卡池", "%当期卡池", "%当前卡池", "%抽卡记录", "%武器卡池", "#芙宁娜复刻", "%1.2.3卡池"]) {
    expect(zzzPoolHistoryCommand(command)).toBeUndefined();
  }
});

test("旧裸角色和武器复刻恢复同池，公开数据截止后不声称目前卡池", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-zzz-legacy-reprint-"));
  const resources = join(root, "resources");
  try {
    await mkdir(join(root, "config"), { recursive: true });
    await Bun.write(join(root, "config", "alias.yaml"), "艾莲: [鲨鱼]\n莱卡恩: [狼哥]\n");
    const sample = rows.map((row, i) => ({ ...row, title: i === 0 ? "「慵懒逐浪」" : undefined }));
    const query = createZzzPoolHistory(new AbortController().signal, async () => Response.json(sample),
      () => Date.parse("2026-11-21T00:00:00+08:00"));
    const role = await query({ kind: "legacy", query: "鲨鱼" }, resources);
    expect(role).toEqual({ type: "forward", nodes: [
      "艾莲卡池详情", "截至 2024/09/04，0天未复刻",
      "所属版本：1.1上半\n卡池名称：「慵懒逐浪」\nS级UP：艾莲\nA级UP：妮可\n开始时间：2024/08/14 11:00:00\n结束时间：2024/09/04 11:59:59",
      "所属版本：1.0上半\nS级UP：艾莲\nA级UP：安东，苍角\n开始时间：2024/07/04 10:00:00\n结束时间：2024/07/24 11:59:59",
    ] });
    expect(await query({ kind: "legacy", query: "深海访客" }, resources)).toMatchObject({ nodes: [
      "深海访客卡池详情", expect.anything(), expect.stringContaining("S级UP：深海访客\nA级UP：聚宝箱"), expect.anything(),
    ] });
    expect(await query({ kind: "legacy", query: "狼哥" }, resources)).toBe("常驻角色不支持查询");
    expect(await query({ kind: "legacy", query: "不存在角色" }, resources)).toBeUndefined();
    expect(await query("艾莲", resources)).toContain("艾莲(S级代理人)");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("全版本按新到旧保留每版前后期和原图 URL，失联继续同源缓存", async () => {
  const img = "https://patchwiki.biligame.com/images/zzz/thumb/7/7f/8pesvtvchbs3t2jhqjhckd9k08pe7ui.png/900px-%E7%8B%AC%E5%AE%B6.png";
  const full = "https://patchwiki.biligame.com/images/zzz/8/83/5zoyir79mdypvtko450rtlz3e6qjt41.png";
  let now = 0, requests = 0;
  const query = createZzzPoolHistory(new AbortController().signal, async () => ++requests === 1
    ? Response.json(rows.map((row, index) => ({ ...row, img: [img, full, "https://invalid.example/fake.png"][index] })))
    : new Response(null, { status: 503 }), () => now);
  const all = await query({ kind: "all" }, undefined);
  expect(all).toMatchObject({ type: "forward", nodes: [
    "绝区零全版本卡池记录", "来源所载频段截至 2024/09/04。",
    ["【 绝区零 v1.1上半 卡池 】\n", "⏱️ 2024/08/14 ~ 2024/09/04\n", "◈ 角色：S-艾莲 | A-妮可\n",
      { type: "image", file: img }, "◈ 音擎：S-深海访客 | A-聚宝箱\n", { type: "image", file: full }],
    expect.arrayContaining(["【 绝区零 v1.0 卡池 】\n", "【 1.0上半 】\n", "【 1.0下半 】\n"]),
  ] });
  expect(JSON.stringify(all)).not.toContain("invalid.example");
  now += 86_400_001;
  expect(await query({ kind: "all" }, undefined)).toEqual(all);
  expect(requests).toBe(2);
});

test("分版本精确区分期次和资料范围，采用官方证实的唯一版本修正", async () => {
  const correction = {
    type: "武器", version: "2.6下半", timer: "2026/04/15 12:00:00 ~ 2026/05/05 14:59:59", s: "机巧心种", a: ["比格气缸", "裁纸刀"],
  };
  const query = createZzzPoolHistory(new AbortController().signal, async () => Response.json([
    ...rows, correction,
    { ...correction, version: "1.10", s: "其他版本", timer: "2024/10/01 00:00:00 ~ 2024/10/10 00:00:00" },
  ]));
  const old = await query({ version: "1.0" }, undefined);
  expect(old).toContain("【 1.0上半 】");
  expect(old).toContain("【 1.0下半 】");
  expect(await query({ version: "1.1" }, undefined)).not.toContain("其他版本");
  expect(await query({ version: "1.0", phase: "上半" }, undefined)).not.toContain("朱鸢");
  expect(await query({ version: "2.7", phase: "下半" }, undefined)).toBe(
    "【 绝区零 v2.7下半 卡池 】\n⏱️ 2026/04/15 ~ 2026/05/05\n◈ 音擎：S-机巧心种 | A-比格气缸，裁纸刀\n来源所载频段截至 2026/05/05。",
  );
  expect(await query({ version: "2.6", phase: "下半" }, undefined)).toContain("未查询到绝区零2.6下半版本");
  expect(await query("机巧心种", undefined)).toContain("1. 2.7下半");
});

test("分类复刻只统计到资料末期并排除当时还在调频的对象", async () => {
  const now = Date.parse("2026-11-20T05:00:00+08:00");
  const query = createZzzPoolHistory(new AbortController().signal, async () => Response.json(rows), () => now);
  const roles = await query({ type: "角色", rank: "S" }, undefined);
  expect(roles).toBe("【 S级代理人复刻统计 】\n朱鸢:  21天未复刻\n按 2024/09/04 统计。来源所载频段截至 2024/09/04。");
  const engines = await query({ type: "武器", rank: "A" }, undefined);
  expect(engines).toBe("【 A级音擎复刻统计 】\n含羞恶面:  42天未复刻\n旋钻机-赤轴:  42天未复刻\n按 2024/09/04 统计。来源所载频段截至 2024/09/04。");
});

test("国服日期按原开始修正和上期结束排序，拒绝非法日期", () => {
  const result = decodeZzzPoolHistory(rows);
  expect(result.map(row => row.dateRange)).toEqual([
    "2024/07/04 ~ 2024/07/24", "2024/07/04 ~ 2024/07/24", "2024/07/24 ~ 2024/08/13",
    "2024/08/14 ~ 2024/09/04", "2024/08/14 ~ 2024/09/04",
  ]);
  expect(() => decodeZzzPoolHistory([{ ...rows[0], timer: "2024/02/30 00:00:00 ~ 2024/09/04 11:59:59" }])).toThrow();
  expect(() => decodeZzzPoolHistory([{ ...rows[0], a: ["拼接\n内容"] }])).toThrow();
});

test("卡池文本沿用角色别名和音擎评级，附来源截止日并在故障时使用缓存", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-zzz-pool-test-"));
  const resources = join(root, "resources");
  await mkdir(join(resources, "map"), { recursive: true });
  await mkdir(join(root, "config"));
  await Bun.write(join(root, "config", "alias.yaml"), "艾莲:\n  - 鲨鱼\n");
  await Bun.write(join(resources, "map", "PartnerId2Data.json"), JSON.stringify({ 1191: { name: "艾莲", full_name: "艾莲·乔" } }));
  const lifetime = new AbortController();
  let now = 0, requests = 0;
  const query = createZzzPoolHistory(lifetime.signal, async (url, request) => {
    expect(url).toBe(zzzPoolHistoryUrl);
    expect(request?.credentials).toBe("omit");
    expect(request?.redirect).toBe("error");
    expect(Object.keys(request?.headers ?? {})).toEqual(["Cache-Control"]);
    return ++requests === 1 ? Response.json(rows) : new Response(null, { status: 503 });
  }, () => now);
  try {
    const [alias, weapon, full] = await Promise.all([query("鲨鱼", resources), query("深海访客", resources), query("艾莲·乔", resources)]);
    expect(requests).toBe(1);
    expect(alias).toBe("【 艾莲(S级代理人) 卡池记录 】\n1. 1.0上半 (2024/07/04 ~ 2024/07/24)\n2. 1.1上半 (2024/08/14 ~ 2024/09/04)\n来源所载频段截至 2024/09/04。");
    expect(full).toBe(alias);
    expect(weapon).toContain("深海访客(S级音擎)");
    expect(await query("妮可", resources)).toContain("妮可(A级代理人)");
    expect(await query("暂无角色", resources)).toContain("来源所载频段截至 2024/09/04");
    now += 24 * 60 * 60 * 1000;
    expect(await query("鲨鱼", resources)).toBe(alias);
    expect(await query("鲨鱼", resources)).toBe(alias);
    expect(requests).toBe(2);
    lifetime.abort();
    expect(await query("鲨鱼", resources)).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("来源失效且没有缓存时提示失败，到时可以重试", async () => {
  let now = 0, requests = 0;
  const query = createZzzPoolHistory(new AbortController().signal, () => {
    if (++requests === 1) throw new Error("unavailable");
    return Promise.resolve(Response.json(rows));
  }, () => now);
  expect(await query("艾莲", undefined)).toBe("卡池历史记录数据获取失败");
  expect(await query("艾莲", undefined)).toBe("卡池历史记录数据获取失败");
  expect(requests).toBe(1);
  now += 60_000;
  expect(await query("艾莲", undefined)).toContain("艾莲(S级代理人)");
  expect(requests).toBe(2);
});
