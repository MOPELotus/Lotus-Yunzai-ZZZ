import { createHash } from "node:crypto";
import { readdir, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { MAX_PROFILE_ID } from "@lotus-yunzai/account";
import type { createAtlasRuntimeCatalog } from "@lotus-yunzai/atlas/catalog";
import { readAtlasGalleryImage } from "@lotus-yunzai/atlas/gallery";
import { loadImage, type Image } from "skia-canvas";
import { isSyncedPanelGallerySnapshot } from "../../lib/panel-gallery-paths.ts";
import { readZzzCardLocalArtwork } from "./card-theme.ts";
import { zzzPanelRegion } from "./panel-storage.ts";

export interface PanelOriginal {
  readonly path: string;
  readonly sha256: string;
  readonly atlasRole?: number;
  readonly gallery?: true;
  readonly snapshot?: string;
}

export type ZzzAtlasPortraitReader = (roleId: number, preferIcon?: boolean) =>
  Promise<{ readonly path: string; readonly bytes: Uint8Array; readonly image: Image } | undefined>;

interface OriginalContext {
  readonly adapter?: string;
  readonly message_type?: string;
  readonly self_id?: number;
  readonly user_id?: number;
  readonly group_id?: number;
  readonly isDelegated?: boolean;
  readonly privateCredentialSignal?: AbortSignal;
}

interface PanelBinding {
  readonly profileId: number;
  readonly uid: string;
  readonly region: string;
}

interface OriginalRecord extends PanelBinding {
  readonly original: PanelOriginal;
  readonly expiresAt: number;
}

interface OriginalStorage {
  get(key: string): Promise<unknown>;
  set(key: string, data: string, lifetime: number): Promise<unknown>;
}

const lifetime = 3 * 3600;
const capacity = 4096;

function imagePath(path: unknown): path is string {
  if (typeof path !== "string" || !path.isWellFormed() || Buffer.byteLength(path) > 512 ||
      /[\\\p{Cc}\p{Cf}]/u.test(path)) return false;
  const parts = path.split("/");
  if (parts.some(value => !value || value === "." || value === "..")) return false;
  return /\.(?:png|jpe?g|webp)$/iu.test(parts.at(-1) ?? "");
}

function galleryPath(path: unknown): path is string {
  return imagePath(path) && path.split("/").length === 2;
}

function originalPath(path: unknown): path is string {
  if (!imagePath(path)) return false;
  const parts = path.split("/");
  if (parts[0] !== "images") return false;
  return parts.length === 4 && parts[1] === "panel" ||
    parts.length === 3 && parts[1] === "role" && /^IconRole[A-Za-z0-9_]+\.png$/u.test(parts[2]!) ||
    parts.length === 4 && (parts[1] === "hakush" || parts[1] === "nanoka") &&
      parts[2] === "role" && /^[A-Za-z0-9_]+\.webp$/u.test(parts[3]!);
}

function hash(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function atlasPortraitPath(path: unknown): path is string {
  return typeof path === "string" && /^gallery\/zzz\/[A-Za-z0-9_]{1,120}\.(?:png|jpe?g|webp)$/iu.test(path);
}

function originalDescriptor(value: unknown): value is PanelOriginal {
  if (!value || typeof value !== "object") return false;
  const descriptor = value as Partial<PanelOriginal>;
  if (typeof descriptor.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(descriptor.sha256)) return false;
  if (descriptor.snapshot !== undefined && (descriptor.gallery !== true || !isSyncedPanelGallerySnapshot(descriptor.snapshot))) return false;
  if (descriptor.gallery !== undefined) {
    return descriptor.gallery === true && descriptor.atlasRole === undefined && galleryPath(descriptor.path);
  }
  if (descriptor.atlasRole === undefined) return originalPath(descriptor.path);
  return positive(descriptor.atlasRole) && descriptor.atlasRole <= 999_999 && atlasPortraitPath(descriptor.path);
}

export async function loadZzzPanelOriginal(directory: string | undefined, paths: readonly string[]) {
  for (const path of paths) {
    if (!originalPath(path)) continue;
    const bytes = await readZzzCardLocalArtwork(directory, path).catch(() => undefined);
    if (!bytes) continue;
    const image = await loadImage(bytes).catch(() => undefined);
    if (image) return { image, original: { path, sha256: hash(bytes) } };
  }
}

async function roleDirectory(root: string | undefined, relative: string) {
  if (!root) return;
  const resolved = await realpath(root).catch(() => undefined);
  if (!resolved) return;
  const directory = join(resolved, relative);
  if (await realpath(directory).catch(() => undefined) === directory) return directory;
}

async function readGalleryImage(root: string | undefined, path: string) {
  const folder = dirname(path);
  const directory = await roleDirectory(root, folder);
  return readZzzCardLocalArtwork(directory, path.slice(folder.length + 1)).catch(() => undefined);
}

export async function loadZzzRandomGalleryPortrait(root: string | undefined, names: readonly unknown[], installed = false, snapshot?: string) {
  if (!root) return;
  const paths: string[] = [];
  for (const name of new Set(names)) {
    if (typeof name !== "string" || !galleryPath(`${name}/a.png`)) continue;
    const folder = installed ? `images/panel/${name}` : name;
    const directory = await roleDirectory(root, folder);
    if (!directory) continue;
    for (const file of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      const path = `${folder}/${file.name}`;
      if (file.isFile() && (installed ? originalPath(path) : galleryPath(path))) paths.push(path);
    }
  }
  while (paths.length) {
    const index = Math.floor(Math.random() * paths.length);
    const path = paths.splice(index, 1)[0]!;
    const bytes = await readGalleryImage(root, path);
    const image = bytes && await loadImage(bytes).catch(() => undefined);
    if (bytes && image) {
      const original: PanelOriginal = { path, sha256: hash(bytes), ...(installed ? {} : { gallery: true, ...(snapshot && { snapshot }) }) };
      return { image, original };
    }
  }
}

export async function findZzzAtlasCharacter(atlas: ReturnType<typeof createAtlasRuntimeCatalog>, roleId: number) {
  if (!positive(roleId) || roleId > 999_999) return;
  const snapshot = await atlas.read().catch(() => undefined);
  const entries = snapshot?.pages.find(page => page.game === "zzz" && page.kind === "character")?.entries;
  return entries?.find(character => character.id === String(roleId));
}

export function createZzzAtlasPortraitReader(atlas: ReturnType<typeof createAtlasRuntimeCatalog>): ZzzAtlasPortraitReader {
  return async (roleId, preferIcon) => {
    const entry = await findZzzAtlasCharacter(atlas, roleId);
    if (!entry) return;
    const { artwork, icon } = (await atlas.roleDetails(entry).catch(() => undefined))?.overview ?? {};
    for (const path of new Set(preferIcon ? [icon, artwork] : [artwork, icon])) {
      if (!atlasPortraitPath(path)) continue;
      const bytes = await readAtlasGalleryImage(atlas.assetRoot(entry), "zzz", path, 8 * 1024 * 1024).catch(() => undefined);
      const image = bytes && await loadImage(bytes).catch(() => undefined);
      if (bytes && image) return { path, bytes, image };
    }
  };
}

export async function loadZzzAtlasPanelOriginal(read: ZzzAtlasPortraitReader | undefined, roleId: number) {
  const asset = await read?.(roleId).catch(() => undefined);
  if (!asset) return;
  const original: PanelOriginal = { path: asset.path, sha256: hash(asset.bytes), atlasRole: roleId };
  if (!originalDescriptor(original)) return;
  return { image: asset.image, original };
}

export async function readZzzPanelOriginal(directory: string | undefined, original: PanelOriginal,
  atlas?: ZzzAtlasPortraitReader, gallery?: string | readonly (string | undefined)[],
  readSyncedGallery?: (snapshot: string) => Promise<string | undefined>) {
  if (!originalDescriptor(original)) return;
  if (original.atlasRole !== undefined) {
    const asset = await atlas?.(original.atlasRole).catch(() => undefined);
    if (asset?.path === original.path && hash(asset.bytes) === original.sha256) return asset.bytes;
    return;
  }
  if (original.gallery) {
    const roots = original.snapshot ? [await readSyncedGallery?.(original.snapshot)] : typeof gallery === "string" ? [gallery] : gallery ?? [];
    for (const root of roots) {
      const bytes = await readGalleryImage(root, original.path);
      if (bytes && hash(bytes) === original.sha256) return bytes;
    }
    return;
  }
  const bytes = original.path.startsWith("images/panel/") ? await readGalleryImage(directory, original.path)
    : await readZzzCardLocalArtwork(directory, original.path).catch(() => undefined);
  if (bytes && hash(bytes) === original.sha256) return bytes;
}

function positive(value: number | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function scope(context: OriginalContext): { adapter: "onebot" | "milky"; address: string } | undefined {
  const { message_type: chat, self_id: bot, user_id: owner, group_id: group } = context;
  if (context.isDelegated || context.privateCredentialSignal?.aborted || !positive(bot) || !positive(owner) ||
      (chat !== "group" && chat !== "private")) return;
  const peer = chat === "group" ? group : owner;
  if (!positive(peer)) return;
  const adapter = context.adapter ?? "onebot";
  if (adapter !== "onebot" && adapter !== "milky") return;
  return { adapter, address: `lotus-yunzai:zzz-panel-original:${adapter}:${bot}:${chat}:${peer}:${owner}` };
}

function messageNumber(value: string | number | undefined, adapter: "onebot" | "milky") {
  const id = typeof value === "string" && /^-?(?:0|[1-9]\d{0,15})$/u.test(value) ? Number(value) : value;
  if (typeof id !== "number" || !Number.isSafeInteger(id)) return;
  if (adapter === "milky" ? id >= 0 : id !== 0 && id >= -2_147_483_648 && id <= 2_147_483_647) return id;
}

function validBinding(record: Partial<PanelBinding>) {
  return positive(record.profileId) && record.profileId <= MAX_PROFILE_ID && typeof record.uid === "string" &&
    typeof record.region === "string" && zzzPanelRegion(record.uid, record.region, "") === record.region;
}

function decode(value: unknown, now: number): OriginalRecord | undefined {
  if (typeof value !== "string" || Buffer.byteLength(value) > 2048) return;
  try {
    const record = JSON.parse(value) as Partial<OriginalRecord> | null;
    if (record && validBinding(record) && originalDescriptor(record.original) &&
      positive(record.expiresAt) && record.expiresAt > now && record.expiresAt <= now + lifetime * 1000) {
      return record as OriginalRecord;
    }
  } catch {
    return;
  }
}

export function createZzzPanelOriginalLedger(storage?: OriginalStorage, signal?: AbortSignal, now = Date.now) {
  const recent = new Map<string, OriginalRecord>();

  function remember(key: string, record: OriginalRecord) {
    recent.delete(key);
    recent.set(key, record);
    if (recent.size > capacity) recent.delete(recent.keys().next().value!);
  }

  return {
    async delivered(context: OriginalContext, confirmed: number, binding: PanelBinding, original: PanelOriginal) {
      const room = scope(context);
      if (signal?.aborted || !room || !validBinding(binding) || !originalDescriptor(original)) return;
      const id = messageNumber(confirmed, room.adapter);
      if (id === undefined) return;
      const record = { ...binding, original, expiresAt: now() + lifetime * 1000 };
      const key = `${room.address}:${id}`;
      remember(key, record);
      try {
        await storage?.set(key, JSON.stringify(record), lifetime);
      } catch {
        // A live receipt remains available until this process exits.
      }
    },

    async find(context: OriginalContext, reference: string | number | undefined) {
      const room = scope(context);
      if (signal?.aborted || !room) return;
      const id = messageNumber(reference, room.adapter);
      if (id === undefined) return;
      const key = `${room.address}:${id}`;
      const found = recent.get(key);
      if (found && found.expiresAt > now()) return found;
      recent.delete(key);
      try {
        const saved = decode(await storage?.get(key), now());
        if (saved && !signal?.aborted && !context.privateCredentialSignal?.aborted) {
          remember(key, saved);
          return saved;
        }
      } catch {
        return;
      }
    },
  };
}
