import { createHash } from "node:crypto";
import { MAX_PROFILE_ID } from "@lotus-yunzai/account";
import { loadImage } from "skia-canvas";
import { readZzzCardLocalArtwork } from "./card-theme.ts";
import { zzzPanelRegion } from "./panel-storage.ts";

export interface PanelOriginal {
  readonly path: string;
  readonly sha256: string;
}

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

function originalPath(path: unknown): path is string {
  if (typeof path !== "string" || !path.isWellFormed() || Buffer.byteLength(path) > 512 ||
      /[\\\p{Cc}\p{Cf}]/u.test(path)) return false;
  const parts = path.split("/");
  if (parts.some(value => !value || value === "." || value === "..")) return false;
  if (parts[0] !== "images" || !/\.(?:png|jpe?g|webp)$/iu.test(parts.at(-1) ?? "")) return false;
  return parts.length === 4 && parts[1] === "panel" ||
    parts.length === 3 && parts[1] === "role" && /^IconRole[A-Za-z0-9_]+\.png$/u.test(parts[2]!) ||
    parts.length === 4 && (parts[1] === "hakush" || parts[1] === "nanoka") &&
      parts[2] === "role" && /^[A-Za-z0-9_]+\.webp$/u.test(parts[3]!);
}

function hash(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function originalDescriptor(value: unknown): value is PanelOriginal {
  if (!value || typeof value !== "object") return false;
  const descriptor = value as Partial<PanelOriginal>;
  return originalPath(descriptor.path) && typeof descriptor.sha256 === "string" && /^[0-9a-f]{64}$/u.test(descriptor.sha256);
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

export async function readZzzPanelOriginal(directory: string | undefined, original: PanelOriginal) {
  if (!originalDescriptor(original)) return;
  const bytes = await readZzzCardLocalArtwork(directory, original.path).catch(() => undefined);
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
