import { expect, test } from "bun:test";
import { createZzzCurrentPool, decodeCurrentZzzPool, zzzCurrentPoolCommand, zzzCurrentPoolDetailsUrl, zzzCurrentPoolListUrl } from "./current-pool.ts";

const imageUrl = "https://sdk-webstatic.mihoyo.com/upload/ann/2026/11/06/test.png";
const notice = { ann_id: 260, subtitle: "3.3版本限时频段（下期）", lang: "zh-cn" };
const liveList = { retcode: 0, data: { pic_list: [{ type_list: [{ list: [notice] }] }] } };
const eligible = Date.parse("2026-11-20T10:00:00+08:00");
const article = `<p>本期代理人与音擎调频活动时间为：<strong>2026/11/11 12:00（服务器时间） ~ 2026/12/01 14:59（服务器时间）</strong>，包含如下内容：</p>
<p>「答案在风中」调频活动</p><p><img src="${imageUrl}"></p><p>活动期间，限定S级代理人<strong>[赛维里安(风·强攻)]</strong>的调频获取概率将大幅提升！</p>
<p>「禁罪囚笼」调频活动</p><p><img src="https://other.example/upload/ann/2026/11/06/test.png"></p>
<p>活动期间，限定S级音擎<strong>[禁罪囚笼(强攻)]</strong>的调频获取概率将大幅提升！</p>`;
const details = (content: string) => ({ retcode: 0, data: { pic_list: [{ ...notice, content }] } });

test("原本期卡池别名独立于历史和个人抽卡入口", () => {
  for (const command of ["%卡池", "%本期卡池", "％当期卡池", "#zzz当前卡池", "/绝区零卡池"]) expect(zzzCurrentPoolCommand.test(command)).toBe(true);
  for (const command of ["当前卡池", "%卡池历史", "%3.3卡池", "%抽卡记录"]) expect(zzzCurrentPoolCommand.test(command)).toBe(false);
});

test("对照国服图文公告编号，用正文限时而非索引发布时间", () => {
  expect(decodeCurrentZzzPool(liveList, details(article), eligible)?.banners).toEqual([
    { name: "答案在风中", kind: "代理人", featured: "赛维里安", artwork: imageUrl },
    { name: "禁罪囚笼", kind: "音擎", featured: "禁罪囚笼" },
  ]);
  for (const time of ["2026-11-11T11:59:59+08:00", "2026-12-01T15:00:00+08:00"]) {
    expect(decodeCurrentZzzPool(liveList, details(article), Date.parse(time))).toBeUndefined();
  }
  expect(decodeCurrentZzzPool(liveList, details(article), Date.parse("2026-12-01T14:59:59+08:00"))?.id).toBe(260);
  expect(decodeCurrentZzzPool(liveList, details(article.replace("2026/11/11 12:00", "3.3版本更新后")), eligible)).toBeUndefined();
  expect(decodeCurrentZzzPool(liveList, details(article.replace("限定S级音擎", "限定S级代理人")), eligible)).toBeUndefined();
  expect(decodeCurrentZzzPool({ retcode: 0, data: { pic_list: [] } }, details(article), eligible)).toBeUndefined();
});

test("公告和横幅匿名读取，资料故障仅在已核有效期内可沿用", async () => {
  let now = eligible;
  let unavailable = false;
  const requests: string[] = [];
  const image = Buffer.from("89504e470d0a1a0a", "hex");
  const command = createZzzCurrentPool(new AbortController().signal, async (url, request) => {
    expect(request).toMatchObject({ method: "GET", credentials: "omit", redirect: "error" });
    expect(request.headers).toBeUndefined();
    requests.push(url);
    if (unavailable) return new Response(null, { status: 503 });
    if (url === zzzCurrentPoolListUrl) return Response.json(liveList);
    if (url === zzzCurrentPoolDetailsUrl) return Response.json(details(article));
    if (url === imageUrl) return new Response(image);
    throw new Error(url);
  }, () => now);
  const first = await command();
  expect(first).toContainEqual({ type: "image", file: new Uint8Array(image) });
  expect(JSON.stringify(first)).toContain("A级名单以游戏内调频界面为准");
  expect(requests).toEqual([zzzCurrentPoolListUrl, zzzCurrentPoolDetailsUrl, imageUrl]);
  unavailable = true;
  now += 300_000;
  expect(await command()).toEqual(first);
  now = Date.parse("2026-12-01T15:00:00+08:00");
  expect(await command()).toBe("暂无法从国服官方公告核验当前限时频段。");
});
