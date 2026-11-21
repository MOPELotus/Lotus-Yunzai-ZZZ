import { realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { resolveZzzGachaLinkRole } from "@lotus-yunzai/hoyo-client";
import type { AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { readZzzFlatLegacyGacha, readZzzLegacyGacha, type ZzzLegacyGachaDraw,
  type ZzzLegacyGachaPool, type ZzzLegacyGachaSnapshot } from "./gacha-legacy.ts";
import { createZzzLinkHistory } from "./gacha-link-history.ts";

async function legacyDirectory(path: string) {
  const actual = await realpath(path).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  });
  if (actual && (actual !== path || !(await stat(actual)).isDirectory())) {
    throw new Error("旧逐抽路径须为副本内的实际目录。");
  }
  return actual;
}

function mergeDraw(previous: ZzzLegacyGachaDraw, next: ZzzLegacyGachaDraw) {
  if (previous.itemId !== next.itemId || previous.rank !== next.rank || previous.itemType !== next.itemType ||
      previous.count !== next.count || previous.time !== next.time || previous.name !== next.name ||
      previous.lang !== next.lang ||
      (previous.gachaId !== next.gachaId && previous.gachaId !== "0" && next.gachaId !== "0")) {
    throw new Error("同一逐抽编号的内容不一致，请核对频段、时间和源档案后重新导出。");
  }
  const gachaId = previous.gachaId === "0" ? next.gachaId : previous.gachaId;
  return { ...previous, gachaId, icon: previous.icon || next.icon };
}

function combine(archives: readonly ZzzLegacyGachaSnapshot[]) {
  const ids = new Map<string, ZzzLegacyGachaPool["name"]>();
  const bands = new Map<ZzzLegacyGachaPool["name"], { gachaType: ZzzLegacyGachaPool["gachaType"];
    records: Map<string, ZzzLegacyGachaDraw> }>();
  for (const { pools } of archives) {
    for (const { name, gachaType, records } of pools) {
      let band = bands.get(name);
      if (!band) {
        band = { gachaType, records: new Map() };
        bands.set(name, band);
      }
      for (const draw of records) {
        const previousName = ids.get(draw.id);
        if (previousName !== undefined && previousName !== name) throw new Error("同一逐抽编号被归入不同频段。");
        ids.set(draw.id, name);
        const previous = band.records.get(draw.id);
        band.records.set(draw.id, previous ? mergeDraw(previous, draw) : draw);
      }
    }
  }
  return { bands, count: ids.size };
}

function legacyDocument(uid: string, combined: ReturnType<typeof combine>) {
  return Object.fromEntries([...combined.bands].map(([name, { gachaType, records }]) => [name,
    [...records.values()].sort((a, b) => b.id.length - a.id.length || (a.id > b.id ? -1 : 1)).map(draw => ({
      uid,
      gacha_id: draw.gachaId,
      gacha_type: draw.gachaId === "0" && draw.count === 1 && draw.lang.toLowerCase() === "zh-cn" ? "2" : gachaType,
      item_id: draw.itemId,
      count: String(draw.count),
      time: draw.time,
      name: draw.name,
      lang: draw.lang,
      item_type: draw.itemType,
      rank_type: draw.rank,
      id: draw.id,
      square_icon: draw.icon || "",
    })),
  ]));
}

export async function prepareZzzGachaHandback({ managed, legacy, qq, uid, region }: {
  managed: string; legacy: string; qq: string; uid: string; region: string;
}, acquireLock: AcquireRoleArchiveLock) {
  const identity = resolveZzzGachaLinkRole({ uid, region });
  const sources = [
    { path: "plugins/Lotus-Plugin/data/zzzGachaJson", scoped: true },
    { path: "plugins/Lotus-ReFactor/data/zzzGachaJson", scoped: true },
    { path: "data/ZZZ-Plugin/gacha", scoped: false },
    { path: "plugins/ZZZ-Plugin/data/gacha", scoped: false },
  ];
  const [modern, ...previous] = await Promise.all([
    createZzzLinkHistory(managed, acquireLock).read(qq, identity),
    ...sources.map(async ({ path, scoped }) => {
      const directory = await legacyDirectory(join(legacy, path));
      if (!directory) return;
      return scoped ? readZzzLegacyGacha(directory, qq, uid) : readZzzFlatLegacyGacha([directory], uid);
    }),
  ]);
  if (!modern) throw new Error("指定 QQ、UID 和区服没有新版绝区零链接逐抽档案。");
  const oldArchives = previous.filter(archive => archive !== undefined);
  const combined = combine([...oldArchives, modern]);
  const counts = { modern: modern.pools.reduce((total, pool) => total + pool.records.length, 0),
    legacy: combine(oldArchives).count, total: combined.count };
  return { document: legacyDocument(uid, combined), counts };
}
