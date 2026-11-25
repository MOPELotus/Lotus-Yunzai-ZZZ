import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import { constants, type Stats } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { zzzTuningPools } from "@lotus-yunzai/hoyo-client";

const legacyBands = [
  ["GACHA_TYPE_WEAPON_UP", "3", "3001"],
  ["GACHA_TYPE_WEAPON_RETURN", "103", "13001"],
  ["GACHA_TYPE_CHARACTER_UP", "2", "2001"],
  ["GACHA_TYPE_CHARACTER_RETURN", "102", "12001"],
  ["GACHA_TYPE_PERMANENT", "1", "1001"],
  ["GACHA_TYPE_BANGBOO", "5", "5001"],
] as const satisfies readonly [keyof typeof zzzTuningPools, string, string][];
const supportedNames = new Set<string>(legacyBands.map(([type]) => zzzTuningPools[type].name));
const maxLegacyArchiveBytes = 32 * 1024 * 1024;
const uidPattern = /^[1-9]\d{7,9}$/u;
const qqPattern = /^[1-9]\d{0,18}$/u;
const idPattern = /^[1-9]\d{0,18}$/u;

export interface ZzzLegacyGachaDraw {
  readonly id: string;
  readonly itemId: string;
  readonly gachaId: string;
  readonly count: number;
  readonly time: string;
  readonly name: string;
  readonly lang: string;
  readonly itemType: "代理人" | "音擎" | "邦布";
  readonly rank: "2" | "3" | "4";
  readonly icon?: string;
}

export interface ZzzLegacyGachaPool {
  readonly type: typeof legacyBands[number][0];
  readonly name: typeof zzzTuningPools[ZzzLegacyGachaPool["type"]]["name"];
  readonly gachaType: typeof legacyBands[number][1];
  readonly records: readonly ZzzLegacyGachaDraw[];
}

export interface ZzzLegacyGachaSnapshot {
  readonly uid: string;
  readonly pools: readonly ZzzLegacyGachaPool[];
}

export class ZzzLegacyGachaError extends Error {
  constructor(readonly code: "corrupt" | "io", message: string) {
    super(message);
  }
}

function invalid(field: string): never {
  throw new ZzzLegacyGachaError("corrupt", $t("gacha-legacy.text_c0a01888f2", { "field": field }));
}

function changed(): never {
  throw new ZzzLegacyGachaError("io", $t("gacha-legacy.text_84a3b03a07"));
}

function object(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
}

function wireString(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
}

function idOf(value: unknown, field: string): string {
  const id = wireString(value);
  if (typeof id !== "string" || !idPattern.test(id)) invalid(field);
  return id;
}

function timeOf(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u.test(value)) invalid($t("gacha-legacy.text_df9dfe0456"));
  const timestamp = Date.parse(`${value.replace(" ", "T")}Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 19).replace("T", " ") !== value) {
    invalid($t("gacha-legacy.text_df9dfe0456"));
  }
  return value;
}

function drawOf(value: unknown, uid: string, [, gachaType, requestType]: typeof legacyBands[number]): ZzzLegacyGachaDraw {
  const row = object(value);
  if (!row) invalid($t("gacha-legacy.text_fc6e12a2c3"));
  if (wireString(row.uid) !== uid) invalid($t("gacha-legacy.text_6980b24770"));
  const id = idOf(row.id, $t("gacha-legacy.text_1de967ae18"));
  const itemId = idOf(row.item_id, $t("gacha-legacy.text_3fc0e85fe6"));
  const gachaId = wireString(row.gacha_id);
  if (typeof gachaId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(gachaId)) invalid($t("gacha-legacy.text_6d32211268"));
  const rank = wireString(row.rank_type);
  if (rank !== "2" && rank !== "3" && rank !== "4") invalid($t("gacha-legacy.text_0ece15300d"));
  const itemType = row.item_type;
  if (itemType !== "代理人" && itemType !== "音擎" && itemType !== "邦布") invalid($t("gacha-legacy.text_011ff1d948"));
  const count = Number(idOf(row.count, $t("gacha-legacy.text_c48d6e6c40")));
  if (!Number.isSafeInteger(count)) invalid($t("gacha-legacy.text_c48d6e6c40"));
  const { lang, name } = row;
  if (typeof lang !== "string" || !/^[a-z]{2}-[a-z]{2}$/iu.test(lang)) invalid($t("gacha-legacy.text_bed1afdc30"));
  if (typeof name !== "string" || !name.isWellFormed() || Buffer.byteLength(name) > 512 || /[\x00-\x1F\x7F]/u.test(name)) {
    invalid($t("gacha-legacy.text_b411fd04a9"));
  }

  const rawType = wireString(row.gacha_type);
  const realType = wireString(row.real_gacha_type);
  if (realType !== undefined && realType !== gachaType && realType !== requestType) invalid($t("gacha-legacy.text_a4aa2681c2"));
  // The old Cookie writer always saved type 2 and event 0, using the enclosing band as the actual type.
  const cookie = realType === undefined && rawType === "2" && gachaId === "0" && count === 1 && lang.toLowerCase() === "zh-cn";
  const returnBase = realType !== undefined && ((gachaType === "102" && rawType === "2") || (gachaType === "103" && rawType === "3"));
  if (!cookie && !returnBase && rawType !== gachaType && rawType !== requestType) invalid($t("gacha-legacy.text_d4b94d7552"));
  const icon = row.square_icon;
  return {
    id, itemId, gachaId, count, time: timeOf(row.time), name, lang, itemType, rank,
    ...(typeof icon === "string" && icon.length <= 2048 ? { icon } : {}),
  };
}

function sameDraw(a: ZzzLegacyGachaDraw, b: ZzzLegacyGachaDraw) {
  return a.itemId === b.itemId && a.count === b.count && a.time === b.time && a.name === b.name && a.lang === b.lang &&
    a.itemType === b.itemType && a.rank === b.rank && (a.gachaId === b.gachaId || a.gachaId === "0" || b.gachaId === "0");
}

function combineLegacyArchives(archives: readonly ZzzLegacyGachaSnapshot[], uid: string): ZzzLegacyGachaSnapshot {
  const usedBands = new Map<string, ZzzLegacyGachaPool["type"]>();
  const pools = legacyBands.map(([type, gachaType]) => {
    const records = new Map<string, ZzzLegacyGachaDraw>();
    for (const archive of archives) {
      for (const draw of archive.pools.find(pool => pool.type === type)!.records) {
        const previousBand = usedBands.get(draw.id);
        const previous = records.get(draw.id);
        if (previousBand !== undefined && previousBand !== type) invalid($t("gacha-legacy.text_dfadb48c2b"));
        if (previous && !sameDraw(previous, draw)) invalid($t("gacha-legacy.text_93277307d6"));
        usedBands.set(draw.id, type);
        if (!previous || (previous.gachaId === "0" && draw.gachaId !== "0")) records.set(draw.id, draw);
      }
    }
    return { type, gachaType, name: zzzTuningPools[type].name, records: [...records.values()].sort((a, b) =>
      b.id.length - a.id.length || (a.id > b.id ? -1 : 1)) };
  });
  return { uid, pools };
}

function parseArchive(value: unknown, uid: string): ZzzLegacyGachaSnapshot {
  const archive = object(value);
  if (!archive || Object.keys(archive).some((name) => !supportedNames.has(name))) invalid($t("gacha-legacy.text_f2067e3394"));
  const previous = new Map<string, ZzzLegacyGachaPool["gachaType"]>();
  return { uid, pools: legacyBands.map((band) => {
    const [type, gachaType] = band;
    const { name } = zzzTuningPools[type];
    const input = Object.hasOwn(archive, name) ? archive[name] : [];
    if (!Array.isArray(input)) invalid($t("gacha-legacy.text_5f9f8d078d"));
    const records = new Map<string, ZzzLegacyGachaDraw>();
    for (const row of input) {
      const draw = drawOf(row, uid, band);
      const previousBand = previous.get(draw.id);
      if (previousBand !== undefined && previousBand !== gachaType) invalid($t("gacha-legacy.text_dfadb48c2b"));
      const existing = records.get(draw.id);
      if (existing && !sameDraw(existing, draw)) invalid($t("gacha-legacy.text_93277307d6"));
      previous.set(draw.id, gachaType);
      if (!existing || (existing.gachaId === "0" && draw.gachaId !== "0")) records.set(draw.id, draw);
    }
    return { type, name, gachaType, records: [...records.values()].sort((a, b) =>
      b.id.length - a.id.length || (a.id > b.id ? -1 : 1)) };
  }) };
}

async function statIfPresent(file: string): Promise<Stats | undefined> {
  try {
    return await lstat(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
  }
}

function sameFile(expected: Stats, current: Stats | undefined) {
  return current !== undefined && expected.dev === current.dev && expected.ino === current.ino &&
    expected.size === current.size && expected.mtimeMs === current.mtimeMs && expected.ctimeMs === current.ctimeMs;
}

async function readFileSnapshot(directory: string, uid: string, qq?: string) {
  const rootPath = resolve(directory);
  const root = await statIfPresent(rootPath);
  if (!root) return;
  if (!root.isDirectory()) invalid($t("gacha-legacy.text_42ee2863b6"));
  const physicalRoot = await realpath(rootPath);
  const currentRoot = await statIfPresent(rootPath);
  if (!currentRoot?.isDirectory() || currentRoot.dev !== root.dev || currentRoot.ino !== root.ino) changed();
  const parent = qq === undefined ? physicalRoot : join(physicalRoot, qq);
  const parentInfo = qq === undefined ? currentRoot : await statIfPresent(parent);
  if (!parentInfo) return;
  if (!parentInfo.isDirectory() || await realpath(parent) !== parent) invalid(qq === undefined ? $t("gacha-legacy.text_42ee2863b6") : $t("gacha-legacy.text_c4880d0af6"));
  const file = join(parent, `${uid}.json`);
  const expected = await statIfPresent(file);
  if (!expected) return;
  if (!expected.isFile()) invalid($t("gacha-legacy.text_6d0aaaab3a"));
  if (expected.size > maxLegacyArchiveBytes) invalid($t("gacha-legacy.text_b9bf691643"));

  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile() || !sameFile(expected, info)) changed();
    const bytes = Buffer.alloc(info.size);
    for (let offset = 0; offset < bytes.length;) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) changed();
      offset += bytesRead;
    }
    if (!sameFile(info, await statIfPresent(file)) || await realpath(parent) !== parent) changed();
    const latestParent = await statIfPresent(parent);
    if (!latestParent?.isDirectory() || latestParent.dev !== parentInfo.dev || latestParent.ino !== parentInfo.ino) changed();
    return bytes;
  } finally {
    await handle.close();
  }
}

async function readArchive(directory: string, uid: string, qq?: string): Promise<ZzzLegacyGachaSnapshot | undefined> {
  let bytes: Buffer | undefined;
  try {
    bytes = await readFileSnapshot(directory, uid, qq);
  } catch (error) {
    if (error instanceof ZzzLegacyGachaError) throw error;
    throw new ZzzLegacyGachaError("io", $t("gacha-legacy.text_dec6e0c221"));
  }
  if (!bytes) return;
  let archive: unknown;
  try {
    archive = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    invalid("JSON");
  }
  return parseArchive(archive, uid);
}

export async function readZzzLegacyGacha(directory: string, qq: string, uid: string) {
  if (typeof qq !== "string" || !qqPattern.test(qq) || typeof uid !== "string" || !uidPattern.test(uid)) invalid($t("gacha-legacy.text_28369d1f89"));
  return readArchive(directory, uid, qq);
}

async function readArchives(directories: readonly string[], uid: string, qq?: string) {
  const archives = (await Promise.all(directories.map(directory => readArchive(directory, uid, qq))))
    .filter(archive => archive !== undefined);
  return archives.length > 1 ? combineLegacyArchives(archives, uid) : archives[0];
}

export async function readZzzLegacyGachaSources(directory: string, retired: readonly string[], qq: string, uid: string) {
  const current = await readZzzLegacyGacha(directory, qq, uid);
  if (current || !retired.length) return current;
  return readArchives(retired, uid, qq);
}

/** Flat archives have no QQ metadata. Verify the caller's account binding before using this reader. */
export async function readZzzFlatLegacyGacha(directories: readonly string[], uid: string) {
  if (typeof uid !== "string" || !uidPattern.test(uid)) invalid("UID");
  return readArchives(directories, uid);
}
