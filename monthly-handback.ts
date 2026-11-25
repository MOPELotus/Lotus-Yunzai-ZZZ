import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { normalizeZzzMonthly, resolveZzzGachaLinkRole } from "@lotus-yunzai/hoyo-client";

type Row = Record<string, unknown>;
type Identity = { readonly uid: string; readonly region: string };
const maxBytes = 4 * 1024 * 1024;
const legacyDirectories = ["data/ZZZ-Plugin/monthly", "plugins/ZZZ-Plugin/data/monthly"];

function object(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error($t("monthly-handback.text_7a4b556ac9"));
  return value as Row;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

function decimal(source: string) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/iu.exec(source);
  if (!match) throw new Error($t("monthly-handback.text_da27a58f4f"));
  const [, sign, integral, fraction = "", power = "0"] = match;
  const significant = (integral! + fraction).replace(/^0+/u, "");
  if (!significant) return "0";
  const digits = significant.replace(/0+$/u, "");
  return `${sign}${digits}e${Number(power) - fraction.length + significant.length - digits.length}`;
}

function decode(bytes: Uint8Array): unknown {
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  return JSON.parse(text, (_key, value: unknown, token?: { readonly source?: string }) => {
    if (typeof value === "number" && (!Number.isFinite(value) || Object.is(value, -0) ||
        (Number.isInteger(value) && !Number.isSafeInteger(value)) || !token?.source || token.source.length > 256 ||
        decimal(token.source) !== decimal(String(value)))) {
      throw new Error($t("monthly-handback.text_da27a58f4f"));
    }
    return value;
  });
}

async function readCopy(file: string) {
  const parent = dirname(file);
  const physical = await realpath(parent).catch((error: unknown) => {
    if (!isMissing(error)) throw error;
  });
  if (!physical) return;
  if (physical !== parent) throw new Error($t("monthly-handback.text_58ce5d901b"));
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch((error: unknown) => {
    if (!isMissing(error)) throw error;
  });
  if (!handle) return;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new Error($t("monthly-handback.text_9a4b88dcf3"));
    const bytes = Buffer.alloc(stat.size);
    for (let offset = 0; offset < bytes.length;) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) throw new Error($t("monthly-handback.text_55716801e2"));
      offset += bytesRead;
    }
    const latest = await lstat(file);
    if (!latest.isFile() || latest.ino !== stat.ino || latest.dev !== stat.dev ||
        latest.size !== stat.size || latest.mtimeMs !== stat.mtimeMs || latest.ctimeMs !== stat.ctimeMs ||
        await realpath(parent) !== physical) throw new Error($t("monthly-handback.text_55716801e2"));
    return decode(bytes);
  } finally {
    await handle.close();
  }
}

function legacyRecord(value: unknown, identity: Identity): Row {
  const row = object(value);
  const fields = object(row.month_data);
  if (typeof row.data_month !== "string" || !Array.isArray(fields.list) || !Array.isArray(fields.income_components) ||
      !normalizeZzzMonthly(row, identity).record) {
    throw new Error($t("monthly-handback.text_d68e725f52"));
  }
  for (const value of fields.list) {
    const item = object(value);
    if ((item.data_type === "PolychromesData" || item.data_type === "MatserTapeData" || item.data_type === "BooponsData") &&
        item.count != null && typeof item.count !== "number") throw new Error($t("monthly-handback.text_5fe173f2bd"));
  }
  return row;
}

function validatedLegacy(value: unknown, identity: Identity) {
  if (!Array.isArray(value)) throw new Error($t("monthly-handback.text_9f057d2674"));
  return value.map(row => legacyRecord(row, identity));
}

function mergeRows(older: Row, incoming: Row, path: readonly string[] = []): Row {
  const fields: [string, unknown][] = Object.entries(older);
  const result = new Map(fields);
  for (const [key, value] of Object.entries(incoming)) {
    const previous = result.get(key);
    if (!result.has(key)) result.set(key, value);
    else if (!path.length && key === "uid" && String(previous) === String(value)) continue;
    else if (path.length === 1 && path[0] === "month_data" && (key === "list" || key === "income_components")) {
      result.set(key, mergeItems(previous, value, key));
    } else if (path.length === 2 && path[0] === "month_data" && (key === "count" || key === "num" || key === "percent")) {
      const unset = (amount: unknown) => amount == null || amount === "";
      if (unset(previous) && !unset(value)) result.set(key, value);
      else if (!unset(previous) && !unset(value) && Number(previous) !== Number(value)) conflict();
    } else if (typeof previous === "object" && previous && !Array.isArray(previous) &&
        typeof value === "object" && value && !Array.isArray(value)) {
      result.set(key, mergeRows(object(previous), object(value), [...path, key]));
    } else if (!isDeepStrictEqual(previous, value)) conflict();
  }
  return Object.fromEntries(result);
}

function conflict(): never {
  throw new Error($t("monthly-handback.text_ea98780a16"));
}

function indexedItems(value: unknown, field: string) {
  if (!Array.isArray(value)) throw new Error($t("monthly-handback.text_1a30a24b6d"));
  const rows = new Map<string, Row>();
  for (const entry of value) {
    const row = object(entry);
    const key = row[field];
    if (typeof key !== "string" || !key || rows.has(key)) {
      throw new Error($t("monthly-handback.text_6fd05f905d"));
    }
    rows.set(key, row);
  }
  return rows;
}

function mergeItems(older: unknown, incoming: unknown, field: "list" | "income_components") {
  const key = field === "list" ? "data_type" : "action";
  const result = indexedItems(older, key);
  for (const [id, next] of indexedItems(incoming, key)) {
    const previous = result.get(id);
    result.set(id, previous ? mergeRows(previous, next, ["month_data", field]) : next);
  }
  return [...result.values()];
}

function combine(rows: readonly Row[]) {
  const result = new Map<string, Row>();
  for (const row of rows) {
    const month = row.data_month as string;
    const previous = result.get(month);
    result.set(month, previous ? mergeRows(previous, row) : row);
  }
  return result;
}

export async function prepareZzzMonthlyHandback({ managed, legacy, qq, uid, region }: {
  readonly managed: string; readonly legacy: string; readonly qq: string; readonly uid: string; readonly region: string;
}) {
  if (!/^[1-9]\d{0,18}$/u.test(qq) || !region) throw new Error($t("monthly-handback.text_1c42d08b5c"));
  const identity = resolveZzzGachaLinkRole({ uid, region });
  const previous = await Promise.all(legacyDirectories.map(directory => readCopy(join(legacy, directory, `${uid}.json`))));
  const oldRows = previous.flatMap(data => data === undefined ? [] : validatedLegacy(data, identity));
  const old = combine(oldRows);
  const source = await readCopy(join(managed, qq, `${uid}.json`));
  if (source === undefined) throw new Error($t("monthly-handback.text_ba6e3a40d7"));
  const current = object(source);
  if (current.version !== 1 || current.qq !== qq || current.uid !== uid || current.region !== region ||
      !Array.isArray(current.months) || !current.months.length) throw new Error($t("monthly-handback.text_bcbec8819a"));
  const modern = current.months.map(value => {
    const entry = object(value);
    if (typeof entry.fetchedAt !== "number" || !Number.isSafeInteger(entry.fetchedAt) || entry.fetchedAt < 0) {
      throw new Error($t("monthly-handback.text_55d22a8e8c"));
    }
    return legacyRecord(entry.record, identity);
  });
  if (new Set(modern.map(row => row.data_month)).size !== modern.length) throw new Error($t("monthly-handback.text_58c5c6e487"));
  const merged = combine([...old.values(), ...modern]);
  const document = [...merged.keys()].sort().map(month => merged.get(month)!);
  const content = Buffer.from(JSON.stringify(document, null, 2) + "\n");
  if (content.byteLength > maxBytes) throw new Error($t("monthly-handback.text_3099033829"));
  const rebuilt = validatedLegacy(decode(content), identity);
  if (!isDeepStrictEqual(rebuilt, document) || rebuilt.length !== merged.size) throw new Error($t("monthly-handback.text_46d0f9d180"));
  return { content, counts: { modern: modern.length, legacy: old.size, total: merged.size } };
}
