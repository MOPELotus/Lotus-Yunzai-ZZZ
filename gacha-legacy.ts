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
  throw new ZzzLegacyGachaError("corrupt", `绝区零旧逐抽档案的${field}无效。`);
}

function changed(): never {
  throw new ZzzLegacyGachaError("io", "绝区零旧逐抽档案正在变化，请稍后重试。");
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
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u.test(value)) invalid("抽卡时间");
  const timestamp = Date.parse(`${value.replace(" ", "T")}Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 19).replace("T", " ") !== value) {
    invalid("抽卡时间");
  }
  return value;
}

function drawOf(value: unknown, uid: string, [, gachaType, requestType]: typeof legacyBands[number]): ZzzLegacyGachaDraw {
  const row = object(value);
  if (!row) invalid("记录结构");
  if (wireString(row.uid) !== uid) invalid("记录 UID");
  const id = idOf(row.id, "记录编号");
  const itemId = idOf(row.item_id, "物品编号");
  const gachaId = wireString(row.gacha_id);
  if (typeof gachaId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(gachaId)) invalid("活动编号");
  const rank = wireString(row.rank_type);
  if (rank !== "2" && rank !== "3" && rank !== "4") invalid("物品稀有度");
  const itemType = row.item_type;
  if (itemType !== "代理人" && itemType !== "音擎" && itemType !== "邦布") invalid("物品类型");
  const count = Number(idOf(row.count, "物品数量"));
  if (!Number.isSafeInteger(count)) invalid("物品数量");
  const { lang, name } = row;
  if (typeof lang !== "string" || !/^[a-z]{2}-[a-z]{2}$/iu.test(lang)) invalid("记录语言");
  if (typeof name !== "string" || !name.isWellFormed() || Buffer.byteLength(name) > 512 || /[\x00-\x1F\x7F]/u.test(name)) {
    invalid("物品名称");
  }

  const rawType = wireString(row.gacha_type);
  const realType = wireString(row.real_gacha_type);
  if (realType !== undefined && realType !== gachaType && realType !== requestType) invalid("真实频段编号");
  // The old Cookie writer always saved type 2 and event 0, using the enclosing band as the actual type.
  const cookie = realType === undefined && rawType === "2" && gachaId === "0" && count === 1 && lang.toLowerCase() === "zh-cn";
  const returnBase = realType !== undefined && ((gachaType === "102" && rawType === "2") || (gachaType === "103" && rawType === "3"));
  if (!cookie && !returnBase && rawType !== gachaType && rawType !== requestType) invalid("记录频段编号");
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

function parseArchive(value: unknown, uid: string): ZzzLegacyGachaSnapshot {
  const archive = object(value);
  if (!archive || Object.keys(archive).some((name) => !supportedNames.has(name))) invalid("频段结构");
  const previous = new Map<string, ZzzLegacyGachaPool["gachaType"]>();
  return { uid, pools: legacyBands.map((band) => {
    const [type, gachaType] = band;
    const { name } = zzzTuningPools[type];
    const input = Object.hasOwn(archive, name) ? archive[name] : [];
    if (!Array.isArray(input)) invalid("频段记录");
    const records = new Map<string, ZzzLegacyGachaDraw>();
    for (const row of input) {
      const draw = drawOf(row, uid, band);
      const previousBand = previous.get(draw.id);
      if (previousBand !== undefined && previousBand !== gachaType) invalid("重复记录所属频段");
      const existing = records.get(draw.id);
      if (existing && !sameDraw(existing, draw)) invalid("重复记录内容");
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

async function readFileSnapshot(directory: string, qq: string, uid: string) {
  const rootPath = resolve(directory);
  const root = await statIfPresent(rootPath);
  if (!root) return;
  if (!root.isDirectory()) invalid("根目录");
  const physicalRoot = await realpath(rootPath);
  const currentRoot = await statIfPresent(rootPath);
  if (!currentRoot?.isDirectory() || currentRoot.dev !== root.dev || currentRoot.ino !== root.ino) changed();
  const parent = join(physicalRoot, qq);
  const user = await statIfPresent(parent);
  if (!user) return;
  if (!user.isDirectory() || await realpath(parent) !== parent) invalid("QQ 目录");
  const file = join(parent, `${uid}.json`);
  const expected = await statIfPresent(file);
  if (!expected) return;
  if (!expected.isFile()) invalid("普通 JSON 文件");
  if (expected.size > maxLegacyArchiveBytes) invalid("文件大小");

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
    return bytes;
  } finally {
    await handle.close();
  }
}

export async function readZzzLegacyGacha(directory: string, qq: string, uid: string): Promise<ZzzLegacyGachaSnapshot | undefined> {
  if (typeof qq !== "string" || !qqPattern.test(qq) || typeof uid !== "string" || !uidPattern.test(uid)) invalid("QQ 或 UID");
  let bytes: Buffer | undefined;
  try {
    bytes = await readFileSnapshot(directory, qq, uid);
  } catch (error) {
    if (error instanceof ZzzLegacyGachaError) throw error;
    throw new ZzzLegacyGachaError("io", "无法读取绝区零旧逐抽档案。");
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
