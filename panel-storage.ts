import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeZzzPanelAvatar, type ZzzPanelAvatar } from "@lotus-yunzai/hoyo-client";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";

const legacyDirectory = fileURLToPath(new URL("../../data/ZZZ-Plugin/", import.meta.url));
const managedDirectory = fileURLToPath(new URL("../../data/zzzPanels/", import.meta.url));
const maximumBytes = 12 * 1024 * 1024;
const validUid = /^[1-9]\d{7,9}$/u;
export const maximumZzzPanelRows = 128;

export async function readPanelJson(directory: string, path: string, max = maximumBytes) {
  const root = await realpath(directory).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  });
  if (!root) return;
  const expected = join(root, path);
  const target = await realpath(expected).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  });
  if (!target) return;
  if (!target.startsWith(root + sep)) throw new Error("绝区零面板文件超出数据目录。");
  if (target !== expected) throw new Error("绝区零面板须读取原归属文件。");
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size < 1 || info.size > max) throw new Error("绝区零面板文件大小无效。");
    const bytes = await file.readFile("utf8");
    if (Buffer.byteLength(bytes) > max) throw new Error("绝区零面板文件大小无效。");
    return JSON.parse(bytes) as unknown;
  } finally {
    await file.close();
  }
}

export function decodeZzzPanelRows(value: unknown) {
  if (!Array.isArray(value) || value.length > maximumZzzPanelRows) throw new Error("绝区零面板角色列表无效。");
  const rows = value.map(normalizeZzzPanelAvatar);
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error("绝区零面板角色编号重复。");
  return rows;
}

export function zzzPanelRegion(uid: string, region: string, gameBiz: string) {
  if (!validUid.test(uid)) return;
  if (uid.length < 10 && (!gameBiz || gameBiz === "nap_cn")) {
    if (!region || region === "prod_gf_cn") return "prod_gf_cn";
    if (region === "prod_qd_cn") return region;
  }
  const overseas = { "10": "prod_gf_us", "13": "prod_gf_jp", "15": "prod_gf_eu", "17": "prod_gf_sg" } as const;
  if (uid.length === 10 && (!gameBiz || gameBiz === "nap_global")) {
    const expected = overseas[uid.slice(0, 2) as keyof typeof overseas];
    if (expected && (!region || region === expected)) return expected;
  }
}

interface PanelIdentity { readonly qq: string; readonly uid: string; readonly region: string }
function managedRows(value: unknown, identity: PanelIdentity) {
  if (value === null) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("绝区零面板归档无效。");
  const data = value as Readonly<Record<string, unknown>>;
  if (data.version !== 1 || data.uid !== identity.uid || data.region !== identity.region) throw new Error("绝区零面板归档身份不符。");
  return decodeZzzPanelRows(data.avatars);
}

export function createZzzPanelStorage(acquireLock: AcquireRoleArchiveLock, options: {
  readonly legacy?: string;
  readonly managed?: string;
} = {}) {
  const legacy = options.legacy || Bun.env.LOTUS_ZZZ_LEGACY_DATA_DIR || legacyDirectory;
  const managed = options.managed || Bun.env.LOTUS_ZZZ_PANEL_DIR || managedDirectory;
  function archive(identity: PanelIdentity) {
    if (zzzPanelRegion(identity.uid, identity.region, "") !== identity.region) throw new Error("绝区零面板归属不明。");
    return createRoleJsonArchive(join(managed, identity.region), acquireLock, {
      subject: "绝区零面板", lockSuffix: "panel", maxBytes: maximumBytes, rejectNull: true,
    });
  }
  async function oldRows({ uid, region }: PanelIdentity) {
    // The original CN route used only prod_gf_cn. Raw UID-only archives cannot identify a channel account.
    if (region === "prod_qd_cn") return [];
    const data = await readPanelJson(legacy, `panel/${uid}.json`);
    return data === undefined ? [] : decodeZzzPanelRows(data);
  }
  return {
    async read(identity: PanelIdentity) {
      return managedRows(await archive(identity).read(identity.qq, identity.uid), identity) ?? await oldRows(identity);
    },
    async merge(identity: PanelIdentity, fresh: readonly ZzzPanelAvatar[], verify: () => Promise<void>) {
      if (!fresh.length) throw new Error("绝区零面板没有新的角色资料。");
      return archive(identity).update(identity, verify, async original => {
        const prior = managedRows(original, identity) ?? await oldRows(identity);
        const ids = new Set(fresh.map(row => row.id));
        const avatars = decodeZzzPanelRows([...fresh, ...prior.filter(row => !ids.has(row.id))]);
        return {
          document: { version: 1, uid: identity.uid, region: identity.region, avatars },
          result: avatars,
        };
      });
    },
  };
}
