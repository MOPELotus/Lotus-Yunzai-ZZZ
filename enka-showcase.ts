import { panelInteger, panelObject } from "./panel-detail.ts";

const userAgent = "Lotus-Yunzai/ZZZ (+https://github.com/MOPELotus/Lotus-Yunzai-ZZZ)";
const maximumBytes = 1_048_576;
const maxLifetime = 7 * 24 * 60 * 60;
const minimumLifetime = 60;
const maximumShowcaseSize = 12;
type PublicIdentity = { readonly uid: string; readonly region: string };
type Transport = (url: URL, options: RequestInit) => Promise<Response>;

const regions: Readonly<Record<string, string>> = {
  prod_gf_cn: "prod_gf_cn", cn: "prod_gf_cn",
  prod_qd_cn: "prod_qd_cn", qd: "prod_qd_cn",
  prod_gf_us: "prod_gf_us", us: "prod_gf_us", na: "prod_gf_us", america: "prod_gf_us",
  prod_gf_jp: "prod_gf_jp", jp: "prod_gf_jp", asia: "prod_gf_jp",
  prod_gf_eu: "prod_gf_eu", eu: "prod_gf_eu", europe: "prod_gf_eu",
  prod_gf_sg: "prod_gf_sg", sg: "prod_gf_sg", cht: "prod_gf_sg", tw: "prod_gf_sg",
};

export class ZzzShowcaseError extends Error {
  constructor(readonly code: "identity" | "unavailable" | "response" | "rate-limited", message: string) {
    super(message);
  }
}

function invalid() {
  return new ZzzShowcaseError("response", "Enka 公开展柜返回的数据无法核验。");
}

function uidMatches(value: unknown, uid: string) {
  return value === uid || typeof value === "number" && Number.isSafeInteger(value) && String(value) === uid;
}

async function payload(response: Response): Promise<unknown> {
  if (!/^application\/(?:[\w.+-]+\+)?json\b/iu.test(response.headers.get("content-type") ?? "") ||
    Number(response.headers.get("content-length")) > maximumBytes || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw invalid();
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let length = 0, text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > maximumBytes) throw invalid();
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch {
    throw invalid();
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function decodeEnkaShowcase(value: unknown, { uid, region }: PublicIdentity) {
  const data = panelObject(value);
  const profile = panelObject(data.PlayerInfo);
  const social = panelObject(panelObject(profile.SocialDetail).ProfileDetail);
  if (!uidMatches(data.uid, uid) || !uidMatches(social.Uid, uid)) {
    throw new ZzzShowcaseError("identity", "Enka 公开展柜回复的 UID 与当前档案不一致。");
  }
  if (data.region !== undefined &&
      (typeof data.region !== "string" || !Object.hasOwn(regions, data.region.toLowerCase()) ||
        regions[data.region.toLowerCase()] !== region)) {
    throw new ZzzShowcaseError("identity", "Enka 公开展柜回复的区服与当前档案不一致。");
  }
  const lifetime = panelInteger(data.ttl, 0, maxLifetime);
  if (lifetime === undefined) throw invalid();
  const nickname = typeof social.Nickname === "string" && social.Nickname.isWellFormed() &&
    social.Nickname.length <= 80 && !/[\p{Cc}\p{Cf}]/u.test(social.Nickname) ? social.Nickname.trim() : "";
  const level = panelInteger(social.Level, 1, 60);
  const profileData = { ttl: Math.max(lifetime, minimumLifetime), nickname, level };
  const showcase = profile.ShowcaseDetail;
  if (showcase !== undefined && showcase !== null && (typeof showcase !== "object" || Array.isArray(showcase))) throw invalid();
  const rows = panelObject(showcase).AvatarList;
  if (rows === undefined) return { ...profileData, rows: [] };
  if (!Array.isArray(rows) || rows.length > maximumShowcaseSize) throw invalid();
  const ids = new Set<number>();
  const visible = [];
  for (const row of rows.map(panelObject)) {
    if (row.IsHidden === true || row.IsHidden === 1) continue;
    if (row.IsHidden !== undefined && row.IsHidden !== false && row.IsHidden !== 0) throw invalid();
    const id = panelInteger(row.Id, 1, 999_999);
    if (id === undefined || ids.has(id)) throw invalid();
    ids.add(id);
    visible.push(row);
  }
  return { ...profileData, rows: visible };
}

function retrySeconds(response: Response, now: number) {
  const value = response.headers.get("retry-after");
  if (!value) return minimumLifetime;
  const seconds = /^\d+$/u.test(value) ? Number(value) : Math.ceil((Date.parse(value) - now) / 1000);
  return Number.isSafeInteger(seconds) ? Math.min(maxLifetime, Math.max(1, seconds)) : minimumLifetime;
}

function rateLimited(seconds: number, reason: string) {
  return new ZzzShowcaseError("rate-limited", `${reason}，请在 ${Math.max(1, Math.ceil(seconds))} 秒后再试。`);
}

export function createZzzShowcaseClient(transport: Transport = fetch, now = Date.now) {
  const nextRequestByUid = new Map<string, number>();
  const inFlight = new Set<string>();
  let nextRequest = 0, serviceBlockedUntil = 0;
  return async (
    target: PublicIdentity,
    signal: AbortSignal,
    beforeRequest: () => Promise<void> = async () => {},
  ) => {
    const { uid } = target;
    signal.throwIfAborted();
    if (!/^[1-9]\d{7,9}$/u.test(uid)) throw new ZzzShowcaseError("identity", "当前档案的绝区零 UID 无效。");
    if (inFlight.has(uid)) throw rateLimited(1, "此 UID 的公开展柜正在更新");
    if (inFlight.size) throw rateLimited(1, "Enka 公开展柜请求正在进行");
    inFlight.add(uid);
    try {
      const started = now();
      const perUid = nextRequestByUid.get(uid) ?? 0;
      if (perUid > started) throw rateLimited((perUid - started) / 1000, "Enka 展柜数据仍在缓存期");
      if (serviceBlockedUntil > started) throw rateLimited((serviceBlockedUntil - started) / 1000, "Enka 公开展柜限流中");
      if (nextRequest > started) throw rateLimited((nextRequest - started) / 1000, "Enka 公开展柜请求间隔未到");
      for (const [key, expires] of nextRequestByUid) if (expires <= started) nextRequestByUid.delete(key);
      await beforeRequest();
      signal.throwIfAborted();
      // Bound repeat traffic even for unavailable, invalid, or timed-out responses.
      const submitted = now();
      nextRequest = submitted + 1000;
      nextRequestByUid.set(uid, submitted + minimumLifetime * 1000);
      const response = await transport(new URL(`https://enka.network/api/zzz/uid/${uid}`), {
        method: "GET", headers: { "User-Agent": userAgent, Accept: "application/json" },
        redirect: "error", credentials: "omit", referrerPolicy: "no-referrer",
        signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        if (response.status === 429 || (response.status === 503 && response.headers.has("retry-after"))) {
          const retry = retrySeconds(response, now());
          serviceBlockedUntil = now() + retry * 1000;
          throw rateLimited(retry, "Enka 公开展柜限流中");
        }
        throw new ZzzShowcaseError("unavailable", response.status === 404
          ? "找不到该 UID 的公开展柜，请确认游戏内已开启角色展示。"
          : "Enka 公开展柜暂时不可用。");
      }
      const result = decodeEnkaShowcase(await payload(response), target);
      signal.throwIfAborted();
      nextRequestByUid.set(uid, now() + result.ttl * 1000);
      return result;
    } finally {
      inFlight.delete(uid);
    }
  };
}
