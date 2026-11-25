import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { normalizeZzzMonthly, type ZzzMonthlyRecord } from "@lotus-yunzai/hoyo-client";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";

type Identity = { readonly qq: string; readonly uid: string; readonly region: string };
type Snapshot = { readonly fetchedAt: number; readonly record: ZzzMonthlyRecord };
const maxBytes = 4 * 1024 * 1024;
const subject = $t("monthly-archive.text_d27d1612f0");

function invalid(): never {
  throw new Error($t("monthly-archive.text_648de7ec85", { "subject": subject }));
}

function json(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function isMissing(error: unknown) {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

async function legacyFile(directory: string, uid: string) {
  const physical = await realpath(resolve(directory)).catch((error: unknown) => {
    if (!isMissing(error)) throw error;
  });
  if (!physical) return;
  const file = join(physical, `${uid}.json`);
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch((error: unknown) => {
    if (!isMissing(error)) throw error;
  });
  if (!handle) return;
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > maxBytes) invalid();
    const bytes = Buffer.alloc(before.size);
    for (let position = 0; position < bytes.length;) {
      const { bytesRead } = await handle.read(bytes, position, bytes.length - position, position);
      if (!bytesRead) invalid();
      position += bytesRead;
    }
    const latest = await lstat(file);
    if (!latest.isFile() || latest.ino !== before.ino || latest.dev !== before.dev || latest.size !== before.size ||
        latest.ctimeMs !== before.ctimeMs || latest.mtimeMs !== before.mtimeMs) invalid();
    const data: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!Array.isArray(data)) invalid();
    return data as unknown[];
  } finally {
    await handle.close();
  }
}

function mergeMonth(previous: Snapshot | undefined, current: Snapshot): Snapshot {
  if (!previous) return current;
  if (previous.fetchedAt > current.fetchedAt) return mergeMonth(current, previous);
  const older = previous.record.month_data;
  const newer = current.record.month_data;
  const quantities = new Map(older.list.map(row => [row.data_type, row]));
  for (const row of newer.list) quantities.set(row.data_type, row);
  const remaining = new Map(older.income_components.map(row => [row.action, row]));
  const income = newer.income_components.map(row => {
    const old = remaining.get(row.action);
    remaining.delete(row.action);
    return { action: row.action, num: row.num ?? old?.num, percent: row.percent ?? old?.percent };
  });
  return { fetchedAt: current.fetchedAt, record: { ...current.record, month_data: {
    list: [...quantities.values()], income_components: [...income, ...remaining.values()],
  } } };
}

export function createZzzMonthlyArchive(directory: string, legacyDirectories: readonly string[], acquireLock: AcquireRoleArchiveLock) {
  const files = createRoleJsonArchive(directory, acquireLock, { subject, lockSuffix: "lotus-zzz-monthly", maxBytes, rejectNull: true });
  async function legacy(identity: Identity) {
    if (!/^\d{8,10}$/u.test(identity.uid)) invalid();
    const saved = new Map<string, Snapshot>();
    for (const directory of legacyDirectories) {
      for (const value of await legacyFile(directory, identity.uid) ?? []) {
        const { record } = normalizeZzzMonthly(value, identity);
        if (!record) continue;
        const previous = saved.get(record.data_month);
        const incoming = { fetchedAt: 0, record };
        saved.set(record.data_month, previous ? mergeMonth(incoming, previous) : incoming);
      }
    }
    return saved;
  }

  function mergeSaved(value: unknown, identity: Identity, into: Map<string, Snapshot>) {
    if (value === null) return;
    const data = json(value);
    if (data.version !== 1 || data.qq !== identity.qq || data.uid !== identity.uid || data.region !== identity.region ||
        !Array.isArray(data.months)) invalid();
    for (const entry of data.months as unknown[]) {
      const { fetchedAt, record: raw } = json(entry);
      if (typeof fetchedAt !== "number" || !Number.isSafeInteger(fetchedAt) || fetchedAt < 0) invalid();
      const { record } = normalizeZzzMonthly(raw, identity);
      if (!record) invalid();
      into.set(record.data_month, mergeMonth(into.get(record.data_month), { record, fetchedAt }));
    }
  }

  function ordered(saved: Map<string, Snapshot>) {
    return [...saved.values()].sort((left, right) => right.record.data_month.localeCompare(left.record.data_month));
  }

  return {
    async read(identity: Identity) {
      const base = await legacy(identity);
      mergeSaved(await files.read(identity.qq, identity.uid), identity, base);
      return ordered(base).map(entry => entry.record);
    },
    async update(identity: Identity, records: readonly ZzzMonthlyRecord[], fetchedAt: number, verifyProfile: () => Promise<void>) {
      const base = await legacy(identity);
      return files.update(identity, verifyProfile, (latest) => {
        mergeSaved(latest, identity, base);
        for (const value of records) {
          const { record } = normalizeZzzMonthly(value, identity);
          if (!record) invalid();
          base.set(record.data_month, mergeMonth(base.get(record.data_month), { fetchedAt, record }));
        }
        const months = ordered(base);
        return { document: { version: 1, ...identity, months }, result: months.map(entry => entry.record) };
      });
    },
  };
}
