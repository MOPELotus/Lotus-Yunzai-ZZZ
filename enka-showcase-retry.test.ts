import { expect, test } from "bun:test";
import { createZzzShowcaseClient } from "./enka-showcase.ts";
const target = { uid: "12345678", region: "prod_gf_cn" };
const signal = () => new AbortController().signal;
const payload = () => Response.json({ uid: target.uid, region: target.region, ttl: 60,
  PlayerInfo: { SocialDetail: { ProfileDetail: { Uid: target.uid } }, ShowcaseDetail: { AvatarList: [] } } });

test("Enka单次读取内部最多三次，每次重试前复核授权且不触发自身缓存阻断", async () => {
  let calls = 0, guards = 0;
  const read = createZzzShowcaseClient(async () => {
    calls++;
    if (calls === 1) return new Response(null, { status: 502 });
    if (calls === 2) throw Object.assign(new Error("reset"), { code: "ECONNRESET" });
    return payload();
  }, () => 1000);
  expect(await read(target, signal(), async () => { guards++; })).toMatchObject({ ttl: 60, rows: [] });
  expect([calls, guards]).toEqual([3, 3]);
  await expect(read(target, signal())).rejects.toMatchObject({ code: "rate-limited" });
  expect(calls).toBe(3);
});

test("Enka显式Retry-After转原服务冷却，撤销授权后不再派发", async () => {
  let calls = 0;
  const read = createZzzShowcaseClient(async () => {
    calls++; return new Response(null, { status: 503, headers: { "Retry-After": "60" } });
  }, () => 1000);
  await expect(read(target, signal())).rejects.toMatchObject({ code: "rate-limited" });
  await expect(read({ ...target, uid: "23456789" }, signal())).rejects.toMatchObject({ code: "rate-limited" });
  expect(calls).toBe(1);
  calls = 0; let checks = 0;
  const stopped = createZzzShowcaseClient(async () => { calls++; return new Response(null, { status: 502 }); });
  await expect(stopped(target, signal(), async () => {
    if (++checks > 1) throw new Error("授权已撤销");
  })).rejects.toThrow("授权已撤销");
  expect(calls).toBe(1);
});
