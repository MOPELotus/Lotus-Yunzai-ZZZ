import { panelObject } from "./panel-detail.ts";

const parameters = "game=nap&game_biz=nap_cn&lang=zh-cn&bundle_id=nap_cn";
export const zzzCurrentPoolListUrl = `https://announcement-api.mihoyo.com/common/nap_cn/announcement/api/getAnnList?${parameters}&channel_id=1&level=70&platform=pc&region=prod_gf_cn&uid=12345678`;
export const zzzCurrentPoolDetailsUrl = `https://announcement-static.mihoyo.com/common/nap_cn/announcement/api/getAnnContent?${parameters}&platform=pc&region=prod_gf_cn&level=70&channel_id=1`;
export const zzzCurrentPoolCommand = /^(?:[#/](?:zzz|绝区零)(?:zzz|绝区零)?|[%％](?:zzz|绝区零)?|zzz|绝区零)(?:当前|本期|当期)?卡池$/iu;
const limitedNotice = /^\d{1,2}\.\d{1,2}版本限时频段[（(](?:上|下)期[）)]$/u;
const day = 86_400_000;
const chinaOffset = 28_800_000;
const unavailable = "暂无法从国服官方公告核验当前限时频段。";
type Transport = (url: string, request: RequestInit) => Promise<Response>;
type PoolKind = "代理人" | "音擎";

interface Banner {
  readonly name: string;
  readonly kind: PoolKind;
  readonly featured: string;
  readonly artwork?: string;
}

interface Period {
  readonly id: number;
  readonly title: string;
  readonly start: number;
  readonly end: number;
  readonly time: string;
  readonly banners: readonly Banner[];
}

function text(value: unknown) {
  return typeof value === "string" ? value.replace(/<[^>]*>/gu, "").replaceAll("&nbsp;", " ").trim() : "";
}

function array(value: unknown) {
  return Array.isArray(value) && value.length <= 200 ? value.map(panelObject) : [];
}

function pictureNotices(value: unknown) {
  const envelope = panelObject(value);
  const rows = panelObject(envelope.data).pic_list;
  if (envelope.retcode !== 0 || !Array.isArray(rows) || rows.length > 200) throw new Error("国服公告格式异常");
  return array(rows);
}

function timestamp(value: string) {
  const match = /^(20\d{2})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/u.exec(value);
  if (!match) return;
  const y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
  const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6] ?? 0);
  const stamped = Date.UTC(y, m - 1, d, hour, minute, second);
  const date = new Date(stamped);
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d || hour > 23 || minute > 59 || second > 59) return;
  return { time: stamped - chinaOffset, seconds: match[6] !== undefined };
}

function bulletinImage(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { return; }
  if (url.origin === "https://sdk-webstatic.mihoyo.com" && !url.username && !url.password && !url.search && !url.hash &&
      /^\/upload\/ann\/20\d{2}\/\d{2}\/\d{2}\/[\w.-]+\.(?:png|jpe?g|webp)$/iu.test(url.pathname)) return url.href;
}

function interval(content: string) {
  const date = "20\\d{2}[/-]\\d{1,2}[/-]\\d{1,2}\\s+\\d{1,2}:\\d{2}(?::\\d{2})?";
  const heading = new RegExp(`本期代理人与音擎调频活动时间为\\s*[：:]\\s*(${date})\\s*[~～至]\\s*(${date})(?![\\d:])`, "u");
  const found = heading.exec(text(content).replace(/[（(]服务器时间[）)]/gu, ""));
  if (!found) return;
  const first = found[1]!, last = found[2]!;
  const start = timestamp(first), end = timestamp(last);
  if (!start || !end || end.time < start.time || end.time - start.time > 45 * day) return;
  return { start: start.time, end: end.time + (end.seconds ? 1_000 : 60_000), time: `${first} ~ ${last}` };
}

function namedBanners(content: string) {
  const result: Banner[] = [];
  for (const section of content.split(/<\/p>/iu)) {
    if (section.length > 20_000) continue;
    const paragraph = text(section);
    const title = /^「([^」\p{Cc}\p{Cf}]{1,80})」\s*调频活动$/u.exec(paragraph)?.[1];
    if (title) result.push({ name: title, kind: "代理人", featured: "" });
    const current = result.at(-1);
    if (!current || current.featured) continue;
    const image = /<img\b[^>]*?\bsrc=(?:"([^"]+)"|'([^']+)')/iu.exec(section);
    const artwork = image && bulletinImage(image[1] ?? image[2] ?? "");
    if (artwork) result[result.length - 1] = { ...current, artwork };
    const featured = /^活动期间，\s*限定S级(代理人|音擎)\s*[\[［]([^\]］(（\p{Cc}\p{Cf}]{1,80})(?:[(（][^\]］]+[)）])?[\]］]\s*(?:的)?调频获取概率将大幅提升/u.exec(paragraph);
    if (featured) result[result.length - 1] = {
      ...current, ...(artwork ? { artwork } : {}), kind: featured[1] === "音擎" ? "音擎" : "代理人", featured: featured[2]!.trim(),
    };
  }
  if (result.length > 0 && result.length <= 8 && result.every(banner => banner.featured) &&
      result.some(banner => banner.kind === "代理人") && result.some(banner => banner.kind === "音擎") &&
      new Set(result.map(banner => banner.name)).size === result.length) return result;
}

export function decodeCurrentZzzPool(list: unknown, detail: unknown, now: number): Period | undefined {
  const published = pictureNotices(list).flatMap(group => array(group.type_list).flatMap(type => array(type.list)));
  const matches: Period[] = [];
  for (const row of pictureNotices(detail)) {
    const title = text(row.subtitle);
    const id = row.ann_id;
    const content = row.content;
    if (!limitedNotice.test(title) || typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0 ||
        row.lang !== "zh-cn" || typeof content !== "string" || content.length > 150_000 ||
        !published.some(item => item.ann_id === id && item.lang === "zh-cn" && text(item.subtitle) === title)) continue;
    const times = interval(content);
    if (!times || now < times.start || now >= times.end) continue;
    const banners = namedBanners(content);
    if (banners) matches.push({ id, title, ...times, banners });
  }
  if (matches.length === 1) return matches[0];
}

async function readBytes(response: Response, maximum: number) {
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > maximum) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("国服公告数据不可用");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > maximum) throw new Error("国服公告数据过大");
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function validRaster(bytes: Uint8Array) {
  const header = Buffer.from(bytes.subarray(0, 12));
  return header.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" ||
    header.subarray(0, 3).toString("hex") === "ffd8ff" ||
    (header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP");
}

export function createZzzCurrentPool(signal: AbortSignal, transport: Transport = fetch, now = Date.now) {
  async function fetchBytes(url: string, maximum: number) {
    const response = await transport(url, {
      method: "GET", credentials: "omit", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(6_000)]),
    });
    return readBytes(response, maximum);
  }

  async function refresh() {
    const read = async (url: string) => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await fetchBytes(url, 2_097_152))) as unknown;
    const [list, detail] = await Promise.all([read(zzzCurrentPoolListUrl), read(zzzCurrentPoolDetailsUrl)]);
    const period = decodeCurrentZzzPool(list, detail, now());
    if (!period) return;
    const images = await Promise.all(period.banners.map(async banner => {
      if (!banner.artwork) return;
      const file = await fetchBytes(banner.artwork, 2_097_152).catch(() => undefined);
      if (file && validRaster(file)) return { type: "image" as const, file };
    }));
    return { period, images };
  }

  let cached: Awaited<ReturnType<typeof refresh>>;
  let nextRead = 0;
  let pending: Promise<void> | undefined;

  return async () => {
    if (signal.aborted) return [];
    if (now() >= nextRead) {
      const inFlight = pending ??= refresh().then(value => {
        cached = value;
        nextRead = now() + (value ? 300_000 : 60_000);
      }).catch(() => { nextRead = now() + 60_000; });
      await inFlight;
      if (pending === inFlight) pending = undefined;
    }
    if (signal.aborted) return [];
    if (!cached || now() >= cached.period.end || now() < cached.period.start) return unavailable;
    const { period, images } = cached;
    const remaining = Math.ceil((period.end - now()) / day);
    return [
      `=== 📅 绝区零本期卡池 ===\n${period.title}\n时间：${period.time}（国服）\n剩余约 ${remaining} 天\n`,
      ...(["代理人", "音擎"] as const).flatMap(kind => [
        `\n【 ${kind === "代理人" ? "角色" : kind}调频 】\n`,
        ...period.banners.flatMap((banner, index) => banner.kind === kind ? [
          `◈ S-${banner.featured} · 「${banner.name}」\n`, ...(images[index] ? [images[index]] : []),
        ] : []),
      ]),
      "\nA级名单以游戏内调频界面为准。",
    ];
  };
}
