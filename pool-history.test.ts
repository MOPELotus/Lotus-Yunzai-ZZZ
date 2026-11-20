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
  for (const command of ["艾莲卡池历史", "%卡池历史", "%音擎卡池历史", "%本期卡池", "%抽卡记录"]) {
    expect(zzzPoolHistoryCommand(command)).toBeUndefined();
  }
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
