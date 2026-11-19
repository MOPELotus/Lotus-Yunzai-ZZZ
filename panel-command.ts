import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createProfileStore, MAX_PROFILE_ID, ProfileError, type GameRole } from "@lotus-yunzai/account";
import { createAtlasRuntimeCatalog, findTraditionalEntries } from "@lotus-yunzai/atlas/catalog";
import { createProfileHoyoClient, GameRecordRequestError, HoyoRequestError } from "@lotus-yunzai/hoyo-client";
import type { AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { renderZzzPanelList } from "./panel-list-card.ts";
import { createZzzPanelStorage, readPanelJson, zzzPanelRegion } from "./panel-storage.ts";

const settingsFile = fileURLToPath(new URL("../../config/zzz-panel.yaml", import.meta.url));
const atlasRoot = fileURLToPath(new URL("../../data/atlas/", import.meta.url));
const prefix = /^(?:[#/](?:zzz|绝区零)(?:zzz|绝区零)?|[%％](?:zzz|绝区零)?|zzz|绝区零)/iu;
const listCommand = /^(?:面板|.*面板列表)\s*([1-9]\d{0,2})?$/u;
const updateCommand = /^(?:(?:刷新|更新)(.*?)面板|面板(?:刷新|更新))\s*([1-9]\d{0,2})?$/u;
const safeName = (name: string) => name.normalize("NFKC").trim().toLowerCase();

export function zzzPanelCommand(raw: string) {
  const command = raw.replace(prefix, "");
  if (command === raw) return;
  const refresh = updateCommand.exec(command);
  if (refresh) {
    const profileId = Number(refresh[2] ?? 1);
    if (profileId > MAX_PROFILE_ID || refresh[1]?.includes("展柜")) return;
    const names = (refresh[1] ?? "").split(/[\s,，、]+/u).filter(Boolean);
    return { kind: "update" as const, profileId, names };
  }
  const list = listCommand.exec(command);
  if (list) {
    const profileId = Number(list[1] ?? 1);
    if (profileId <= MAX_PROFILE_ID) return { kind: "list" as const, profileId };
  }
}

type Json = Readonly<Record<string, unknown>>;
function object(input: unknown): Json {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Json : {};
}

async function optionalYaml(path: string) {
  try {
    return object(Bun.YAML.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function settings(resources: string | undefined) {
  const explicit = Bun.env.LOTUS_ZZZ_PANEL_CONFIG;
  const inherited = (explicit ? await optionalYaml(explicit) : await optionalYaml(settingsFile) ??
    (resources ? await optionalYaml(join(dirname(resources), "config", "panel.yaml")) : undefined));
  const interval = Number(inherited?.interval ?? 60);
  const roleInterval = Number(inherited?.roleInterval ?? 3000);
  if (!Number.isSafeInteger(interval) || interval < 0 || !Number.isSafeInteger(roleInterval) || roleInterval < 0 ||
      roleInterval > 2_147_483_647 || interval > Math.floor(Number.MAX_SAFE_INTEGER / 1000)) {
    throw new Error("绝区零面板配置的刷新间隔无效。");
  }
  return { interval, roleInterval };
}

interface PanelContext {
  readonly user_id?: number;
  readonly message_type?: string;
  readonly isDelegated?: boolean;
  reply(message: string): unknown;
}

export function createZzzPanelCommands(profiles: ReturnType<typeof createProfileStore>, client: ReturnType<typeof createProfileHoyoClient>,
  lock: AcquireRoleArchiveLock, signal: AbortSignal) {
  const archive = createZzzPanelStorage(lock);
  const atlas = createAtlasRuntimeCatalog(atlasRoot, Bun.env.LOTUS_ATLAS_DATA_DIR);
  const running = new Set<string>();
  const lastSuccess = new Map<string, number>();

  async function targets(names: readonly string[], resources: string | undefined) {
    const ids = new Set<number>();
    const missing: string[] = [];
    const [map, aliases, index] = await Promise.all([
      resources ? readPanelJson(resources, "map/PartnerId2Data.json", 8 * 1024 * 1024).catch(() => undefined) : undefined,
      resources ? optionalYaml(join(dirname(resources), "config", "alias.yaml")).catch(() => undefined) : undefined,
      atlas.read().catch(() => undefined),
    ]);
    const entries = Object.entries(object(map));
    for (const name of names) {
      const key = safeName(name);
      const alias = Object.entries(aliases ?? {}).find(([name, list]) => safeName(name) === key ||
        (Array.isArray(list) && list.some(item => typeof item === "string" && safeName(item) === key)))?.[0];
      const legacy = entries.find(([, candidate]) =>
        [object(candidate).name, object(candidate).full_name].some(value =>
          typeof value === "string" && safeName(value) === safeName(alias ?? name)))?.[0];
      const found = index ? findTraditionalEntries(index, alias ?? name, "zzz", "character") : [];
      const raw = legacy ?? (found.length === 1 ? found[0]?.entry.id : undefined);
      if (!raw || !/^[1-9]\d{0,5}$/u.test(raw)) missing.push(name);
      else ids.add(Number(raw));
    }
    return { ids: [...ids], missing };
  }

  return async (command: NonNullable<ReturnType<typeof zzzPanelCommand>>, context: PanelContext) => {
    const user = context.user_id;
    if ((context.message_type !== "group" && context.message_type !== "private") || context.isDelegated ||
        typeof user !== "number" || !Number.isSafeInteger(user) || user < 1) {
      return "请从登录档案对应的 QQ 会话使用绝区零面板。";
    }
    const qq = String(user);
    const { profileId } = command;
    const resources = Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR;
    try {
      const role = await profiles.savedRole(qq, profileId, "zzz");
      const region = zzzPanelRegion(role.uid, role.region, role.gameBiz);
      if (!region) return "绝区零档案的角色与区服信息不一致。";
      const identity = { qq, uid: role.uid, region };
      const display: GameRole = { ...role, region };
      const theme = { qq, signal, legacyResources: resources };
      async function sameRole() {
        const current = await profiles.savedRole(qq, profileId, "zzz");
        if (current.uid !== identity.uid || zzzPanelRegion(current.uid, current.region, current.gameBiz) !== region) {
          throw new ProfileError("changed", "绝区零档案角色已变化。");
        }
        signal.throwIfAborted();
      }

      if (command.kind === "list") {
        const rows = await archive.read(identity);
        if (!rows.length) return `UID:${role.uid}无本地面板数据，请先%更新面板。`;
        const { png } = await renderZzzPanelList(rows, display, theme);
        await sameRole();
        return { type: "image" as const, file: png };
      }

      const source = await profiles.requestContext(qq, profileId, "zzz", role.uid);
      if (region !== "prod_gf_cn" && region !== "prod_qd_cn") return "米游社面板更新目前支持国服绝区零角色。";
      const key = `${region}:${role.uid}`;
      if (running.has(key)) return "该角色的绝区零面板正在更新，请稍后再试。";
      running.add(key);
      try {
        const { interval, roleInterval } = await settings(resources);
        const redis = globalThis.redis;
        const modernKey = `lotus-yunzai:zzz-panel:last-refresh:${key}`;
        const legacyKey = `ZZZ:PANEL:${role.uid}:LASTTIME`;
        const redisTime = redis ? Math.max(Number(await redis.get(legacyKey)) || 0, Number(await redis.get(modernKey)) || 0) : 0;
        const now = Date.now();
        for (const [id, time] of lastSuccess) if (now - time >= interval * 1000) lastSuccess.delete(id);
        if (now - Math.max(lastSuccess.get(key) ?? 0, redisTime) < interval * 1000) {
          return `${interval}秒内只能更新一次，请稍后再试。`;
        }
        const selected = command.names.length ? await targets(command.names, resources) : undefined;
        if (selected?.missing.length) return `角色${selected.missing.map(name => `【${name}】`).join("")}不存在，请确保角色名称/别称存在。`;
        await context.reply(command.names.length ? `正在更新${command.names.join("、")}面板，请稍候...` : "正在更新面板列表，请稍候...");
        const result = await client.fetchZzzPanel(source, { ids: selected?.ids, signal, roleInterval });
        if (result.uid !== role.uid || result.region !== region) throw new ProfileError("changed", "绝区零档案角色已变化。");
        if (!result.avatars.length) return "未能获取角色的面板数据，请确认已拥有对应角色。";
        const verify = async () => {
          await sameRole();
          const current = await profiles.requestContext(qq, profileId, "zzz", role.uid);
          if (current.revision !== result.revision) throw new ProfileError("changed", "绝区零档案已变化。");
          signal.throwIfAborted();
        };
        const rows = await archive.merge(identity, result.avatars, verify);
        const updatedAt = Date.now();
        lastSuccess.set(key, updatedAt);
        if (interval && redis) await redis.set(modernKey, String(updatedAt), { EX: interval }).catch(() => undefined);
        const updatedIds = new Set(result.avatars.map(row => row.id));
        const image = await renderZzzPanelList(rows, display, { ...theme, updatedIds }).catch(() => undefined);
        await verify();
        if (!image) return `绝区零面板已更新 ${updatedIds.size} 个角色。`;
        return { type: "image" as const, file: image.png };
      } finally {
        running.delete(key);
      }
    } catch (error) {
      if (signal.aborted) return [];
      if (error instanceof ProfileError) {
        if (error.code === "changed") return "绝区零档案角色已变化，请重新操作。";
        if (error.code === "missing" || error.code === "login-required") return `[荷花插件]请先登录 profile ${profileId}。`;
        if (error.code === "role-missing") return `[荷花插件]profile ${profileId} 没有同步绝区零 UID。`;
      }
      if (error instanceof GameRecordRequestError || error instanceof HoyoRequestError && ["refresh", "invalid-input"].includes(error.code)) {
        return error.message;
      }
      if (error instanceof HoyoRequestError && error.code === "profile-changed") return "绝区零档案角色已变化，请重新操作。";
      return command.kind === "update" ? "绝区零面板暂时无法更新。" : "绝区零面板暂时无法查询。";
    }
  };
}
