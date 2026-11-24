import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { basename, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createAtlasRuntimeCatalog, type AtlasEntry } from "@lotus-yunzai/atlas/catalog";
import type { ZzzTuningSnapshot } from "@lotus-yunzai/hoyo-client";
import type { ZzzLegacyGachaDraw } from "./gacha-legacy.ts";

const atlasRoot = fileURLToPath(new URL("../../data/atlas/", import.meta.url));
const maxBytes = 8 * 1024 * 1024;
const iconHosts = new Set([
  "act-webstatic.mihoyo.com", "upload-static.mihoyo.com", "webstatic.mihoyo.com",
  "act-webstatic.hoyoverse.com", "upload-static.hoyoverse.com", "webstatic.hoyoverse.com", "fastcdn.hoyoverse.com",
  "act-webstatic.miyoushe.com", "upload-static.miyoushe.com",
]);
const avatarKey = "qq-avatar";
type Pool = ZzzTuningSnapshot["pools"][number];
type TuningRecord = Pool["records"][number];
type ArtRecord = { readonly itemId: string; readonly name: string; readonly icon?: string };
type Kind = "character" | "equipment" | "bangboo";
type ArtworkTransport = (url: URL, init: RequestInit) => Promise<Response>;

function kindOf({ type }: Pool): Kind {
  if (type.includes("WEAPON")) return "equipment";
  return type === "GACHA_TYPE_BANGBOO" ? "bangboo" : "character";
}

async function galleryImage(root: string, artwork: string | undefined) {
  if (!artwork?.startsWith("gallery/zzz/") ||
    !artwork.split("/").every((part) => /^[\p{L}\p{N}][\p{L}\p{N}_. -]*$/u.test(part))) return;
  const directory = await realpath(root).catch(() => undefined);
  if (!directory) return;
  const sources = basename(directory) === "data" ? [directory, dirname(directory)] : [directory];
  for (const source of sources) {
    const path = await realpath(join(source, artwork)).catch(() => undefined);
    if (!path?.startsWith(join(source, "gallery", "zzz") + sep)) continue;
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(() => undefined);
    if (!file) continue;
    try {
      const info = await file.stat();
      if (info.isFile() && info.size <= maxBytes) return await file.readFile();
    } catch {
      continue;
    } finally {
      await file.close();
    }
  }
}

async function fetchArtwork(url: URL, transport: ArtworkTransport, signal?: AbortSignal) {
  try {
    const deadline = AbortSignal.timeout(3_000);
    const response = await transport(url, {
      credentials: "omit", redirect: "error", signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    });
    if (!response.ok || !/^image\/(?:jpeg|png|webp)(?:;|$)/iu.test(response.headers.get("content-type") ?? "")) {
      await response.body?.cancel().catch(() => undefined);
      return;
    }
    const reader = response.body?.getReader();
    if (!reader) return;
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return bytes ? Buffer.concat(chunks, bytes) : undefined;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel();
          return;
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  } catch {
    return;
  }
}

function officialIcon(value: string) {
  const url = URL.parse(value);
  return url?.protocol === "https:" && !url.username && !url.password && !url.port && iconHosts.has(url.hostname) ? url : undefined;
}

export function fetchZzzOfficialArtwork(value: string, signal?: AbortSignal) {
  const url = officialIcon(value);
  if (url) return fetchArtwork(url, fetch, signal);
}

export function fetchZzzQqAvatar(qq: string, signal?: AbortSignal, transport: ArtworkTransport = fetch) {
  if (/^[1-9]\d*$/u.test(qq)) return fetchArtwork(new URL(`https://q1.qlogo.cn/g?b=qq&nk=${qq}&s=640`), transport, signal);
}

export function createZzzRecordPortraits<T extends ArtRecord>(kind: Kind, signal?: AbortSignal) {
  return createArtwork<T>({ qq: "", signal, transport: fetch, kindOfRecord: () => kind });
}

export function createZzzTuningArtwork(
  stats: ZzzTuningSnapshot, qq: string, signal?: AbortSignal, transport: ArtworkTransport = fetch,
) {
  const poolOf = new Map<TuningRecord, Kind>();
  for (const pool of stats.pools) {
    const kind = kindOf(pool);
    for (const record of pool.records) poolOf.set(record, kind);
  }
  return createArtwork<TuningRecord>({ qq, signal, transport, kindOfRecord: (record) => poolOf.get(record) });
}

export function createZzzLegacyGachaArtwork(
  qq: string, signal?: AbortSignal, transport: ArtworkTransport = fetch,
) {
  return createArtwork<ZzzLegacyGachaDraw>({
    qq, signal, transport,
    kindOfRecord: (draw) => draw.itemType === "代理人" ? "character" : draw.itemType === "音擎" ? "equipment" : "bangboo",
  });
}

function createArtwork<T extends ArtRecord>({
  qq, signal, transport, kindOfRecord,
}: {
  qq: string;
  signal?: AbortSignal;
  transport: ArtworkTransport;
  kindOfRecord: (record: T) => Kind | undefined;
}) {
  const catalog = createAtlasRuntimeCatalog(atlasRoot, Bun.env.LOTUS_ATLAS_DATA_DIR);
  const sources = new Map<string, { record: T; kind: Kind; official?: URL }>();

  function resolveIcon(record: T) {
    const kind = kindOfRecord(record);
    if (!kind) return;
    const key = `${kind}/${record.itemId}`;
    const official = record.icon ? officialIcon(record.icon) : undefined;
    const source = sources.get(key);
    if (!source) sources.set(key, { record, kind, official });
    else if (!source.official && official) source.official = official;
    return key;
  }

  async function localArtwork(entry: AtlasEntry, kind: Kind) {
    const art = kind === "character" ? (await catalog.roleDetails(entry))?.overview.icon
      : kind === "equipment" ? (await catalog.weaponDetails(entry))?.artwork
      : (await catalog.bangbooDetails(entry))?.artwork;
    return galleryImage(catalog.assetRoot(entry), art);
  }

  let snapshot: Promise<Awaited<ReturnType<typeof catalog.read>> | undefined> | undefined;
  async function loadArtwork(key: string) {
    if (signal?.aborted) return;
    if (key === avatarKey) return fetchZzzQqAvatar(qq, signal, transport);
    const source = sources.get(key);
    if (!source) return;
    const { record, kind, official } = source;
    if (official) {
      const image = await fetchArtwork(official, transport, signal);
      if (image) return image;
    }
    const index = await (snapshot ??= catalog.read().catch(() => undefined));
    const entries = index?.pages.find((page) => page.game === "zzz" && page.kind === kind)?.entries;
    const candidates = entries?.filter(({ name }) => name === record.name) ?? [];
    const entry = candidates.find(({ id }) => id === record.itemId) ?? (candidates.length === 1 ? candidates[0] : undefined);
    return entry && localArtwork(entry, kind);
  }

  return { avatar: avatarKey, resolveIcon, loadArtwork };
}
