import { readZzzRoleAliases, zzzRoleAlias, zzzRoleName } from "./role-alias.ts";
import { panelObject } from "./panel-detail.ts";
import { readPanelJson } from "./panel-storage.ts";

export const zzzPoolHistoryUrl = "https://raw.githubusercontent.com/iaoongin/GachaClock/main/spider/data/zzz/history.json";
const prefix = /^(?:[#/](?:zzz|绝区零)(?:zzz|绝区零)?|[%％](?:zzz|绝区零)?|zzz|绝区零)/iu;
const day = 24 * 60 * 60 * 1000;
const chinaOffset = 8 * 60 * 60 * 1000;
const maximumBytes = 2 * 1024 * 1024;

interface PoolSummary {
  readonly rank: "S" | "A";
  readonly type: "角色" | "武器";
}

export function zzzPoolHistoryCommand(raw: string) {
  const command = raw.replace(prefix, "");
  if (command === raw) return;
  const name = /^([^\p{Cc}\p{Cf}]{1,80}?)(?:复刻|卡池)(?:统计|记录|历史)$/u.exec(command)?.[1]?.trim();
  if (!name) return;
  const category = /^(s级?|a级?|五星|四星)?(角色|代理人|武器|音擎)$/iu.exec(name);
  if (category) {
    const type = category[2] === "武器" || category[2] === "音擎" ? "武器" : "角色";
    if (type === "武器" && !category[1]) return;
    const rank = /^(?:a|四星)/iu.test(category[1] ?? "") ? "A" : "S";
    return { type, rank } satisfies PoolSummary;
  }
  return name;
}

function name(value: unknown) {
  return typeof value === "string" && value.length <= 80 && value.trim() && !/[\p{Cc}\p{Cf}]/u.test(value)
    ? value.trim() : undefined;
}

function calendar(time: number) {
  return new Date(time + chinaOffset).toISOString().slice(0, 19).replace("T", " ").replaceAll("-", "/");
}

function time(value: string) {
  if (!/^20\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/u.test(value)) return;
  const stamp = Date.parse(value.replaceAll("/", "-").replace(" ", "T") + "+08:00");
  if (Number.isFinite(stamp) && calendar(stamp) === value) return stamp;
}

const opening = [
  { type: "角色", version: "1.0上半", timer: "公测开启后 ~ 2024/07/24 11:59:59", s: "艾莲", a: ["安东", "苍角"] },
  { type: "武器", version: "1.0上半", timer: "公测开启后 ~ 2024/07/24 11:59:59", s: "深海访客", a: ["含羞恶面", "旋钻机-赤轴"] },
] as const;

export function decodeZzzPoolHistory(raw: unknown) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 1_000) throw new Error("绝区零卡池历史格式异常");
  const rows = raw.map(panelObject);
  if (!rows.some(row => row.version === "1.0上半")) rows.push(...opening);
  const sorted = rows.map(row => {
    const { type, version, timer } = row;
    const headliner = name(row.s);
    const items = Array.isArray(row.a) && row.a.length <= 12 ? row.a.map(name) : undefined;
    const dates = typeof timer === "string" && timer.length <= 120 ? timer.split("~").map(part => part.trim()) : [];
    const end = dates.length === 2 ? time(dates[1]!) : undefined;
    if ((type !== "角色" && type !== "武器") || typeof version !== "string" || !/^\d{1,2}\.\d{1,2}(?:上半|下半)?$/u.test(version) ||
        !headliner || !items || items.some(item => item === undefined) || end === undefined) {
      throw new Error("绝区零卡池历史格式异常");
    }
    return { type, version, headliner, items, startText: dates[0]!, end };
  }).sort((left, right) => left.end - right.end);

  let lastEnd: number | undefined, previousEnd: number | undefined;
  return sorted.map(row => {
    if (row.end !== lastEnd) {
      previousEnd = lastEnd;
      lastEnd = row.end;
    }
    let start = time(row.startText);
    if (row.startText === "公测开启后" && row.version === "1.0上半") start = time("2024/07/04 10:00:00");
    if (/^\d{1,2}\.\d{1,2}版本更新后$/u.test(row.startText) && previousEnd !== undefined) {
      const nextLocalDay = Math.floor((previousEnd + chinaOffset) / day) * day + day;
      start = nextLocalDay - chinaOffset + 11 * 60 * 60 * 1000;
    }
    if (start === undefined || start > row.end) throw new Error("绝区零卡池历史时间异常");
    return { ...row, dateRange: `${calendar(start).slice(0, 10)} ~ ${calendar(row.end).slice(0, 10)}` };
  });
}

function poolSummary(rows: ReturnType<typeof decodeZzzPoolHistory>, request: PoolSummary, now: number) {
  const lastEnd = rows.at(-1)!.end;
  const snapshot = Math.min(now, lastEnd);
  const newest = new Map<string, number>();
  for (const row of rows) {
    if (row.type !== request.type) continue;
    const names = request.rank === "S" ? [row.headliner] : row.items;
    for (const item of names) {
      if (item && (newest.get(item) ?? 0) < row.end) newest.set(item, row.end);
    }
  }
  const ages = [...newest].filter(([, end]) => end < snapshot)
    .map(([item, end]) => ({ item, days: Math.floor((snapshot - end) / day) }))
    .sort((left, right) => right.days - left.days);
  const kind = request.type === "武器" ? "音擎" : "代理人";
  return [
    `【 ${request.rank}级${kind}复刻统计 】`,
    ...ages.map(row => `${row.item}: ${String(row.days).padStart(3, " ")}天未复刻`),
    `按 ${calendar(snapshot).slice(0, 10)} 统计。来源所载频段截至 ${calendar(lastEnd).slice(0, 10)}。`,
  ].join("\n");
}

async function readResponse(response: Response) {
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("绝区零卡池历史请求失败");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let length = 0, text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > maximumBytes) throw new Error("绝区零卡池历史超出大小限制");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return decodeZzzPoolHistory(JSON.parse(text + decoder.decode()) as unknown);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function createZzzPoolHistory(signal: AbortSignal,
  transport: (url: string, request: RequestInit) => Promise<Response> = fetch, now = Date.now) {
  let cached: ReturnType<typeof decodeZzzPoolHistory> | undefined;
  let nextRead = 0;
  let pending: Promise<void> | undefined;
  async function read() {
    if (now() < nextRead) return cached;
    const request = pending ??= (async () => {
      try {
        const response = await transport(zzzPoolHistoryUrl, {
          method: "GET", headers: { "Cache-Control": "no-cache" }, credentials: "omit", redirect: "error",
          signal: AbortSignal.any([signal, AbortSignal.timeout(6_000)]),
        });
        cached = await readResponse(response);
        nextRead = now() + day;
      } catch {
        nextRead = now() + 60_000;
      }
    })();
    await request;
    if (pending === request) pending = undefined;
    return cached;
  }

  return async (query: string | PoolSummary, resources: string | undefined) => {
    if (signal.aborted) return [];
    if (typeof query !== "string") {
      const rows = await read();
      if (signal.aborted) return [];
      return rows ? poolSummary(rows, query, now()) : "卡池历史记录数据获取失败";
    }
    const [rows, aliases, catalog] = await Promise.all([
      read(),
      readZzzRoleAliases(resources).catch(() => undefined),
      resources ? readPanelJson(resources, "map/PartnerId2Data.json", 8 * 1024 * 1024).catch(() => undefined) : undefined,
    ]);
    if (signal.aborted) return [];
    if (!rows) return "卡池历史记录数据获取失败";
    const key = zzzRoleName(query);
    const alias = zzzRoleAlias(aliases, query);
    const partner = alias ? undefined : Object.values(panelObject(catalog)).find(value => {
      const entry = panelObject(value);
      return [entry.name, entry.full_name].some(item => typeof item === "string" && zzzRoleName(item) === key);
    });
    const label = alias ?? name(panelObject(partner).name) ?? query;
    const match = zzzRoleName(label);
    const result = rows.filter(row => zzzRoleName(row.headliner) === match ||
      row.items.some(item => item !== undefined && zzzRoleName(item) === match));
    const first = result[0];
    const until = calendar(rows.at(-1)!.end).slice(0, 10);
    if (!first) return `未找到【${label}】卡池记录，请确保角色名称/别称存在。来源所载频段截至 ${until}。`;
    const display = zzzRoleName(first.headliner) === match ? first.headliner :
      first.items.find(item => item !== undefined && zzzRoleName(item) === match) ?? label;
    const kind = first.type === "武器" ? "音擎" : "代理人";
    return [`【 ${display}(${display === first.headliner ? "S" : "A"}级${kind}) 卡池记录 】`,
      ...result.map((row, index) => `${index + 1}. ${row.version} (${row.dateRange})`), `来源所载频段截至 ${until}。`].join("\n");
  };
}
