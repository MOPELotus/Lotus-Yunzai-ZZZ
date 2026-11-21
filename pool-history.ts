import { readZzzRoleAliases, zzzRoleAlias, zzzRoleName } from "./role-alias.ts";
import { panelObject } from "./panel-detail.ts";
import { readPanelJson } from "./panel-storage.ts";

export const zzzPoolHistoryUrl = "https://raw.githubusercontent.com/iaoongin/GachaClock/main/spider/data/zzz/history.json";
const prefix = /^(?:[#/](?:zzz|绝区零)(?:zzz|绝区零)?|[%％](?:zzz|绝区零)?|zzz|绝区零)/iu;
const day = 24 * 60 * 60 * 1000;
const chinaOffset = 8 * 60 * 60 * 1000;
const maximumBytes = 2 * 1024 * 1024;
const permanentRoles = new Set(["猫又", "莱卡恩", "11号", "格莉丝", "珂蕾妲", "丽娜"]);

interface PoolSummary {
  readonly rank: "S" | "A";
  readonly type: "角色" | "武器";
}

interface PoolVersion {
  readonly version: string;
  readonly phase?: "上半" | "下半";
}

interface PoolAll { readonly kind: "all" }
interface PoolLegacy { readonly kind: "legacy"; readonly query: string }
type PoolImage = { readonly type: "image"; readonly file: string };

export function zzzPoolHistoryCommand(raw: string) {
  const command = raw.replace(prefix, "");
  if (command === raw) return;
  if (/^(?:复刻|卡池)(?:统计|记录|历史)$/u.test(command)) return { kind: "all" } satisfies PoolAll;
  const edition = /^v?(\d{1,2}\.\d{1,2})(上半|下半)?卡池$/u.exec(command);
  if (edition) return {
    version: edition[1]!,
    phase: edition[2] === "上半" || edition[2] === "下半" ? edition[2] : undefined,
  } satisfies PoolVersion;
  const name = /^([^\p{Cc}\p{Cf}]{1,80}?)(?:复刻|卡池)(?:统计|记录|历史)$/u.exec(command)?.[1]?.trim();
  if (!name) {
    const query = /^([^\s#\p{Cc}\p{Cf}]{1,80}?)(?:复刻|卡池)$/u.exec(command)?.[1];
    if (query && !/^(?:当前|本期|当期|常驻|角色|代理人|武器|音擎|v?[\d.]+(?:上半|下半)?)$/u.test(query)) {
      return { kind: "legacy", query } satisfies PoolLegacy;
    }
    return;
  }
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

function originalArtwork(value: unknown) {
  if (typeof value !== "string" || value.length > 1_024) return;
  try {
    const url = new URL(value);
    const path = /^\/images\/zzz\/(?:(thumb)\/)?[a-f\d]\/[a-f\d]{2}\/[\w.-]+\.(?:png|jpe?g|webp)(\/[^/]+\.(?:png|jpe?g|webp))?$/iu.exec(url.pathname);
    if (url.origin === "https://patchwiki.biligame.com" && !url.username && !url.password && !url.search && !url.hash &&
        path && Boolean(path[1]) === Boolean(path[2])) {
      return url.href;
    }
  } catch {}
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
  { type: "角色", version: "1.0上半", timer: "公测开启后 ~ 2024/07/24 11:59:59", s: "艾莲", a: ["安东", "苍角"],
    img: "https://patchwiki.biligame.com/images/zzz/thumb/7/7f/8pesvtvchbs3t2jhqjhckd9k08pe7ui.png/900px-%E7%8B%AC%E5%AE%B6%E9%A2%91%E6%AE%B5001%E6%9C%9F.png" },
  { type: "武器", version: "1.0上半", timer: "公测开启后 ~ 2024/07/24 11:59:59", s: "深海访客", a: ["含羞恶面", "旋钻机-赤轴"],
    img: "https://patchwiki.biligame.com/images/zzz/thumb/3/32/gs2uajlo6v2h6pljzij84wdiwhu9fkj.png/900px-%E9%9F%B3%E6%93%8E%E9%A2%91%E6%AE%B5001%E6%9C%9F.png" },
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
    // The official 2.7 notice confirms the April–May 机巧心种 row; the public archive labels it 2.6.
    // https://zzz.mihoyo.com/news/163519
    const mislabeled = type === "武器" && version === "2.6下半" && headliner === "机巧心种" &&
      dates[0] === "2026/04/15 12:00:00" && dates[1] === "2026/05/05 14:59:59";
    return { type, version: mislabeled ? "2.7下半" : version, headliner, items, startText: dates[0]!, end,
      artwork: originalArtwork(row.img), title: name(row.title) };
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
    return { ...row, start, dateRange: `${calendar(start).slice(0, 10)} ~ ${calendar(row.end).slice(0, 10)}` };
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

function versionParts(rows: ReturnType<typeof decodeZzzPoolHistory>, request: PoolVersion, artwork = false) {
  const stages = request.phase ? [request.version + request.phase] :
    [request.version, request.version + "上半", request.version + "下半"];
  const selected = stages.flatMap(stage => {
    const entries = rows.filter(row => row.version === stage);
    return entries.length ? [{ stage, entries }] : [];
  });
  if (!selected.length) return;
  const title = selected.length === 1 ? selected[0]!.stage : request.version;
  const lines: (string | PoolImage)[] = [`【 绝区零 v${title} 卡池 】`];
  for (const { stage, entries } of selected) {
    if (selected.length > 1) lines.push(`【 ${stage} 】`);
    const ranges = new Set(entries.map(row => row.dateRange));
    for (const range of ranges) {
      lines.push(`⏱️ ${range}`);
      for (const type of ["角色", "武器"] as const) {
        for (const row of entries) {
          if (row.type !== type || row.dateRange !== range) continue;
          lines.push(`◈ ${type === "角色" ? type : "音擎"}：S-${row.headliner} | A-${row.items.join("，")}`);
          if (artwork && row.artwork) lines.push({ type: "image", file: row.artwork });
        }
      }
    }
  }
  return lines;
}

function historyCoverage(rows: ReturnType<typeof decodeZzzPoolHistory>) {
  return `来源所载频段截至 ${calendar(rows.at(-1)!.end).slice(0, 10)}。`;
}

function versionHistory(rows: ReturnType<typeof decodeZzzPoolHistory>, request: PoolVersion) {
  const parts = versionParts(rows, request);
  const coverage = historyCoverage(rows);
  return parts ? [...parts, coverage].join("\n")
    : `未查询到绝区零${request.version}${request.phase ?? ""}版本的卡池历史数据。${coverage}`;
}

function allHistory(rows: ReturnType<typeof decodeZzzPoolHistory>) {
  const versions = [...new Set(rows.map(row => row.version.replace(/(?:上半|下半)$/u, "")))].reverse();
  const nodes = versions.flatMap(version => {
    const parts = versionParts(rows, { version }, true);
    if (!parts) return [];
    return [parts.map(part => typeof part === "string" ? `${part}\n` : part)];
  });
  return { type: "forward" as const, nodes: ["绝区零全版本卡池记录", historyCoverage(rows), ...nodes] };
}

function legacyHistory(label: string, rows: ReturnType<typeof decodeZzzPoolHistory>, result: ReturnType<typeof decodeZzzPoolHistory>, now: number) {
  if (!result.length) return;
  const kind = result.some(row => row.type === "角色") ? "角色" : "武器";
  const sorted = result.filter(row => row.type === kind).sort((a, b) => b.start - a.start || a.end - b.end);
  const latest = sorted[0]!;
  const last = rows.at(-1)!.end;
  const calendarDay = (us: number) => Math.floor((us + chinaOffset) / day);
  const snapshot = Math.min(now, last);
  const delta = calendarDay(latest.end) - calendarDay(snapshot);
  const next = calendarDay(latest.start) - calendarDay(snapshot);
  const status = now > last
    ? `截至 ${calendar(last).slice(0, 10)}，${Math.max(0, -delta)}天未复刻`
    : delta < 0 ? `${-delta}天未复刻` : next > 0 ? `下期UP，还有${next}天开启卡池`
      : `当期UP，${delta ? `还有${delta}天` : "今天"}结束卡池`;
  const pools = sorted.map(row => [`所属版本：${row.version}`, row.title && `卡池名称：${row.title}`,
    `S级UP：${row.headliner}`, row.items.length && `A级UP：${row.items.join("，")}`,
    `开始时间：${calendar(row.start)}`, `结束时间：${calendar(row.end)}`].filter(Boolean).join("\n"));
  return { type: "forward" as const, nodes: [`${label}卡池详情`, status, ...pools] };
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

  return async (query: string | PoolSummary | PoolVersion | PoolLegacy | PoolAll, resources: string | undefined) => {
    if (signal.aborted) return [];
    if (typeof query !== "string" && !("query" in query)) {
      const rows = await read();
      if (signal.aborted) return [];
      if (!rows) return "卡池历史记录数据获取失败";
      if ("kind" in query) return allHistory(rows);
      return "version" in query ? versionHistory(rows, query) : poolSummary(rows, query, now());
    }
    const input = typeof query === "string" ? query : query.query;
    const [rows, aliases, catalog] = await Promise.all([
      read(),
      readZzzRoleAliases(resources).catch(() => undefined),
      resources ? readPanelJson(resources, "map/PartnerId2Data.json", 8 * 1024 * 1024).catch(() => undefined) : undefined,
    ]);
    if (signal.aborted) return [];
    const key = zzzRoleName(input);
    const alias = zzzRoleAlias(aliases, input);
    const partner = alias ? undefined : Object.values(panelObject(catalog)).find(value => {
      const entry = panelObject(value);
      return [entry.name, entry.full_name].some(item => typeof item === "string" && zzzRoleName(item) === key);
    });
    const label = alias ?? name(panelObject(partner).name) ?? input;
    if (typeof query !== "string" && permanentRoles.has(label.replace(/[「」]/gu, ""))) return "常驻角色不支持查询";
    if (!rows) return "卡池历史记录数据获取失败";
    const match = zzzRoleName(label);
    const result = rows.filter(row => zzzRoleName(row.headliner) === match ||
      row.items.some(item => item !== undefined && zzzRoleName(item) === match));
    if (typeof query !== "string") return legacyHistory(label, rows, result, now());
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
