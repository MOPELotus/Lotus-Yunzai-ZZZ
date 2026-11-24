import { zzzResourceDirectory } from "./card-theme.ts";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createProfileStore, gameCommandProfileId, MAX_PROFILE_ID, ProfileError, type GameRole } from "@lotus-yunzai/account";
import { zzzCharacterGalleryRoot } from "@lotus-yunzai/atlas/gallery";
import { createAtlasRuntimeCatalog, findTraditionalEntries } from "@lotus-yunzai/atlas/catalog";
import { createProfileHoyoClient, GameRecordRequestError, HoyoRequestError } from "@lotus-yunzai/hoyo-client";
import type { ZzzPanelAvatar } from "@lotus-yunzai/hoyo-client";
import { ImageSizeLimitError } from "@lotus-yunzai/skia";
import type { AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { readSyncedPanelGalleryRoot, retainedPanelGalleryDirectory } from "../../lib/panel-gallery-paths.ts";
import { ZzzInlineImageLimitError } from "./challenge-card.ts";
import { formatEnkaPanel, loadEnkaPanelTables } from "./enka-panel-data.ts";
import { createZzzShowcaseClient, ZzzShowcaseError } from "./enka-showcase.ts";
import { createPanelDamageReader, ZzzDamageUnavailable } from "./panel-damage.ts";
import { renderZzzPanelDetail } from "./panel-detail-card.ts";
import { renderZzzPanelList } from "./panel-list-card.ts";
import { createZzzAtlasPortraitReader, createZzzPanelOriginalLedger, findZzzAtlasCharacter, readZzzPanelOriginal } from "./panel-original.ts";
import { createZzzPanelStorage, createZzzShowcaseStorage, readPanelJson, zzzPanelRegion } from "./panel-storage.ts";
import { renderZzzProficiency } from "./proficiency-card.ts";
import { buildZzzProficiency } from "./proficiency.ts";
import { readZzzRoleAliases, zzzRoleAlias, zzzRoleName as safeName } from "./role-alias.ts";

const installation = new URL("../../", import.meta.url);
const atlasRoot = fileURLToPath(new URL("../../data/atlas/", import.meta.url));
const prefix = /^(?:[#/](?:zzz|绝区零)(?:zzz|绝区零)?|[%％](?:zzz|绝区零)?|zzz|绝区零)/iu;
const formerPanelBrand = /^[#/%]?\s*(?:(?:zzz|绝区零)\s*)?[\[【]?(?:zzz[-_ ]*plugin|lotus[-_ ]*plugin|荷花(?:插件)?)/iu;
const listCommand = /^(?:面板|.*面板列表)\s*([1-9]\d{0,2})?$/u;
const showcaseCommand = /^(?:(?:刷新|更新)(?:展柜|展板)面板|(?:展柜|展板)(?:全部面板更新|更新全部面板|(?:刷新|更新)面板|面板(?:刷新|更新)))\s*([1-9]\d{0,2})?$/u;
const showcaseName = /展柜|展板/u;
const proficiencyCommand = /^(展柜)?练度(?:统计)?\s*([1-9]\d{0,2})?$/u;
const updateCommand = /^(?:更新全部面板|全部面板更新|(?:刷新|更新)(.*?)面板|面板(?:刷新|更新))\s*([1-9]\d{0,2})?$/u;
const detailCommand = /^([^\p{Cc}\p{Cf}]{1,80}?)面板\s*([1-9]\d{0,2})?$/u;
const damageCommand = /^([^\p{Cc}\p{Cf}]{1,80}?)伤害(?: *(技能 *)?(\d{1,6}))?(?: *档案 *([1-9]\d{0,2}))?$/u;

export function zzzPrefixedCommand(raw: string) {
  if (formerPanelBrand.test(raw.normalize("NFKC"))) return;
  const command = raw.replace(prefix, "");
  if (command !== raw) return command;
}

export function zzzPanelCommand(raw: string, inGroup = false) {
  if (inGroup && /^#?原图$/u.test(raw)) return { kind: "original" as const, sharedCommand: true as const };
  const command = zzzPrefixedCommand(raw);
  if (!command) return;
  if (command === "原图") return { kind: "original" as const };
  const damage = damageCommand.exec(command);
  if (damage) {
    const [, role, explicitSkill, numeric, explicitProfile] = damage;
    const legacyProfile = !explicitSkill && !explicitProfile && numeric !== undefined &&
      /^[1-9]\d{0,2}$/u.test(numeric) && Number(numeric) <= MAX_PROFILE_ID ? numeric : undefined;
    const profileId = gameCommandProfileId("zzz", explicitProfile ?? legacyProfile);
    const name = role!.trim();
    if (name && profileId <= MAX_PROFILE_ID) {
      return { kind: "damage" as const, profileId, name, skill: numeric === undefined || legacyProfile ? undefined : Number(numeric) };
    }
    return;
  }
  const proficiency = proficiencyCommand.exec(command);
  if (proficiency) {
    const profileId = gameCommandProfileId("zzz", proficiency[2]);
    if (profileId <= MAX_PROFILE_ID) return { kind: "proficiency" as const, profileId, showcase: Boolean(proficiency[1]) };
    return;
  }
  const showcase = showcaseCommand.exec(command);
  if (showcase) {
    const profileId = gameCommandProfileId("zzz", showcase[1]);
    if (profileId <= MAX_PROFILE_ID) return { kind: "showcase-update" as const, profileId };
    return;
  }
  const refresh = updateCommand.exec(command);
  if (refresh) {
    const profileId = gameCommandProfileId("zzz", refresh[2]);
    if (profileId > MAX_PROFILE_ID || showcaseName.test(refresh[1] ?? "")) return;
    const names = (refresh[1] ?? "").split(/[\s,，、]+/u).filter(Boolean);
    return { kind: "update" as const, profileId, names };
  }
  const list = listCommand.exec(command);
  if (list) {
    const profileId = gameCommandProfileId("zzz", list[1]);
    if (profileId <= MAX_PROFILE_ID) return { kind: "list" as const, profileId };
    return;
  }
  const detail = detailCommand.exec(command);
  if (!detail) return;
  const name = detail[1]!.trim();
  const profileId = gameCommandProfileId("zzz", detail[2]);
  if (!name || profileId > MAX_PROFILE_ID) return;
  if (name.endsWith("展柜") && name.length > 2) {
    return { kind: "showcase-detail" as const, profileId, name: name.slice(0, -2).trim() };
  }
  return { kind: "detail" as const, profileId, name };
}

export function zzzPanelCommandHint(raw: string) {
  const command = zzzPrefixedCommand(raw);
  if (!command || showcaseCommand.test(command)) return;
  const refresh = updateCommand.exec(command);
  if (refresh && showcaseName.test(refresh[1] ?? "") && Number(refresh[2] ?? 1) <= MAX_PROFILE_ID) {
    return "展柜更新不支持指定角色，请使用%更新展柜面板";
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

export function zzzPanelConfigFile(root = installation) {
  const explicit = Bun.env.LOTUS_ZZZ_PANEL_CONFIG;
  return explicit ? resolve(explicit) : fileURLToPath(new URL("config/zzz-panel.yaml", root));
}

export async function readZzzPanelConfigDocument(resources = zzzResourceDirectory(), root = installation) {
  const local = await optionalYaml(zzzPanelConfigFile(root));
  if (Bun.env.LOTUS_ZZZ_PANEL_CONFIG || !resources) return local ?? {};
  const legacy = dirname(resources);
  const [defaults, configured] = await Promise.all([
    optionalYaml(join(legacy, "defSet", "panel.yaml")),
    optionalYaml(join(legacy, "config", "panel.yaml")),
  ]);
  return { ...defaults, ...configured, ...local };
}

export function parseZzzPanelConfig(inherited: Json) {
  const roleInterval = Number(inherited?.roleInterval ?? 3000);
  if (!Number.isSafeInteger(roleInterval) || roleInterval < 0 || roleInterval > 2_147_483_647) {
    throw new Error("绝区零面板配置的刷新间隔无效。");
  }
  return { roleInterval };
}

interface PanelContext {
  readonly adapter?: string;
  readonly inlineImageByteLimit?: number;
  readonly user_id?: number;
  readonly self_id?: number;
  readonly group_id?: number;
  readonly message_type?: string;
  readonly isDelegated?: boolean;
  readonly privateCredentialSignal?: AbortSignal;
  readonly groupOriginalSignal?: AbortSignal;
  readonly message?: readonly { readonly type: string; readonly id?: unknown }[];
  readonly reply_id?: string | number;
  readonly lookupReply?: () => Promise<{ readonly user_id: number; readonly message: readonly { readonly type: string }[] } | undefined>;
  reply(message: string): unknown;
}

export function createZzzPanelCommands(profiles: ReturnType<typeof createProfileStore>, client: ReturnType<typeof createProfileHoyoClient>,
  lock: AcquireRoleArchiveLock, signal: AbortSignal, requestShowcase = createZzzShowcaseClient()) {
  const archive = createZzzPanelStorage(lock);
  const showcaseArchive = createZzzShowcaseStorage(lock);
  const readDamage = createPanelDamageReader();
  const originals = createZzzPanelOriginalLedger({
    async get(key) { return globalThis.redis?.get(key); },
    async set(key, value, lifetime) { return globalThis.redis?.set(key, value, { EX: lifetime }); },
  }, signal);
  const atlas = createAtlasRuntimeCatalog(atlasRoot, Bun.env.LOTUS_ATLAS_DATA_DIR);
  const atlasPortrait = createZzzAtlasPortraitReader(atlas);
  const galleryDirectory = join(zzzCharacterGalleryRoot(), "zzz-character");
  const retainedGalleryDirectory = retainedPanelGalleryDirectory("zzz");
  const portraitOptions = {
    atlasPortrait, galleryDirectory, retainedGalleryDirectory,
    async syncedGalleryRoot() {
      if (!Bun.env.LOTUS_CHARACTER_GALLERY_DIR?.trim()) return readSyncedPanelGalleryRoot();
    },
    async atlasNames(id: number) {
      const entry = await findZzzAtlasCharacter(atlas, id);
      return entry ? [entry.name, (await atlas.roleDetails(entry))?.overview.name ?? entry.name] : [];
    },
  };
  const running = new Set<string>();

  async function verifyRole(qq: string, profileId: number, expected: { uid: string; region: string }) {
    const current = await profiles.savedRole(qq, profileId, "zzz");
    if (current.uid !== expected.uid || zzzPanelRegion(current.uid, current.region, current.gameBiz) !== expected.region) {
      throw new ProfileError("changed", "绝区零档案角色已变化。");
    }
    signal.throwIfAborted();
  }

  async function originalPicture(context: PanelContext, qq: string, resources: string | undefined, sharedCommand: boolean) {
    const session = sharedCommand ? context.groupOriginalSignal : context.privateCredentialSignal;
    if (sharedCommand && (!session || session.aborted)) return;
    const sources = context.message?.filter(part => part.type === "reply");
    const sourceId = sources?.[0]?.id;
    if (context.reply_id === undefined || !context.lookupReply || sources?.length !== 1 ||
        (typeof sourceId !== "string" && typeof sourceId !== "number") || String(sourceId) !== String(context.reply_id)) {
      return sharedCommand ? undefined : "未找到消息源，请引用要查看的一张图片。";
    }
    const missing = sharedCommand ? undefined : "未找到原图。";
    try {
      const record = await originals.find(context, context.reply_id);
      if (!record || session?.aborted) return missing;
      const quote = await context.lookupReply();
      if (!quote || session?.aborted || quote.user_id !== context.self_id ||
          quote.message.filter(part => part.type === "image").length !== 1) {
        return missing;
      }
      await verifyRole(qq, record.profileId, record);
      if (session?.aborted) return missing;
      const file = await readZzzPanelOriginal(resources, record.original, atlasPortrait,
        [galleryDirectory, await retainedGalleryDirectory], async snapshot => {
          const root = await readSyncedPanelGalleryRoot(undefined, snapshot);
          if (root) return join(root, "zzz-character");
        });
      await verifyRole(qq, record.profileId, record);
      if (!file || session?.aborted) return missing;
      return { type: "image" as const, file };
    } catch {
      if (signal.aborted && !sharedCommand) return [];
      return missing;
    }
  }

  async function targets(names: readonly string[], resources: string | undefined, rows: readonly ZzzPanelAvatar[] = []) {
    const ids = new Set<number>();
    const missing: string[] = [];
    const [map, aliases, index] = await Promise.all([
      resources ? readPanelJson(resources, "map/PartnerId2Data.json", 8 * 1024 * 1024).catch(() => undefined) : undefined,
      readZzzRoleAliases(resources).catch(() => undefined),
      atlas.read().catch(() => undefined),
    ]);
    const entries = Object.entries(object(map));
    for (const name of names) {
      const alias = zzzRoleAlias(aliases, name);
      const legacy = entries.find(([, candidate]) =>
        [object(candidate).name, object(candidate).full_name].some(value =>
          typeof value === "string" && safeName(value) === safeName(alias ?? name)))?.[0];
      const found = index ? findTraditionalEntries(index, alias ?? name, "zzz", "character") : [];
      const matches = rows.filter(row => [row.name_mi18n, row.full_name_mi18n]
        .some(value => value && safeName(value) === safeName(alias ?? name)));
      const raw = legacy ?? (matches.length === 1 ? String(matches[0]!.id) : undefined) ??
        (found.length === 1 ? found[0]?.entry.id : undefined);
      if (!raw || !/^[1-9]\d{0,5}$/u.test(raw)) missing.push(name);
      else ids.add(Number(raw));
    }
    return { ids: [...ids], missing };
  }

  const handle = async (command: NonNullable<ReturnType<typeof zzzPanelCommand>>, context: PanelContext) => {
    const user = context.user_id;
    if ((context.message_type !== "group" && context.message_type !== "private") || context.isDelegated ||
        typeof user !== "number" || !Number.isSafeInteger(user) || user < 1) {
      if (command.kind === "original" && command.sharedCommand) return;
      return "请从登录档案对应的 QQ 会话使用绝区零面板。";
    }
    const qq = String(user);
    const resources = zzzResourceDirectory();
    if (command.kind === "original") return originalPicture(context, qq, resources, command.sharedCommand === true);
    const { profileId } = command;
    try {
      const role = await profiles.savedRole(qq, profileId, "zzz");
      const region = zzzPanelRegion(role.uid, role.region, role.gameBiz);
      if (!region) return "绝区零档案的角色与区服信息不一致。";
      const identity = { qq, uid: role.uid, region };
      const display: GameRole = { ...role, region };
      const { inlineImageByteLimit } = context;
      const theme = { qq, signal, legacyResources: resources, atlasPortrait, inlineImageByteLimit };
      const sameRole = () => verifyRole(qq, profileId, identity);

      if (command.kind === "proficiency") {
        const local = command.showcase ? [] : await archive.read(identity);
        const rows = local.length ? local : await showcaseArchive.read(identity);
        await sameRole();
        if (!rows.length) return command.showcase ? "本档案暂无公开展柜记录，请先%更新展柜面板。" :
          "未找到面板数据，请先%更新面板或%更新展柜面板。";
        const { png } = await renderZzzProficiency(buildZzzProficiency(rows), display, {
          legacyResources: resources, signal, atlasPortrait, source: local.length ? "local" : "showcase",
          inlineImageByteLimit: context.inlineImageByteLimit,
        });
        await sameRole();
        return { type: "image" as const, file: png };
      }

      if (command.kind === "list") {
        const rows = await archive.read(identity);
        const publicRows = await showcaseArchive.read(identity).catch(() => []);
        const known = new Set(rows.map(row => row.id));
        rows.push(...publicRows.filter(row => !known.has(row.id)));
        if (!rows.length) return `UID:${role.uid}无本地面板数据，请先%更新面板。`;
        const image = await renderZzzPanelList(rows, display, theme).catch((error: unknown) => {
          if (!(error instanceof ZzzInlineImageLimitError || error instanceof ImageSizeLimitError)) throw error;
        });
        await sameRole();
        if (image) return { type: "image" as const, file: image.png };
        return [`UID ${role.uid} · 绝区零面板列表`, ...rows.map(row => `${row.name_mi18n} · Lv.${row.level}`)].join("\n");
      }
      if (command.kind === "detail" || command.kind === "showcase-detail" || command.kind === "damage") {
        const privateRows = command.kind === "showcase-detail" ? [] : await archive.read(identity);
        const publicRows = await showcaseArchive.read(identity).catch(error => {
          if (command.kind === "showcase-detail") throw error;
          return [];
        });
        const privateIds = new Set(privateRows.map(row => row.id));
        const rows = [...privateRows, ...publicRows.filter(row => !privateIds.has(row.id))];
        const { ids } = await targets([command.name], resources, rows);
        const row = rows.find(avatar => avatar.id === ids[0]);
        await sameRole();
        if (!ids.length) return `角色${command.name}不存在，请确保角色名称/别称存在。`;
        if (!row) return command.kind === "showcase-detail"
          ? `暂无角色${command.name}的公开展柜数据，请先%更新展柜面板。`
          : `暂无角色${command.name}面板数据，请先%更新面板。`;
        const damage = command.kind === "damage" ? await readDamage(row, resources, command.skill) : undefined;
        const damageSummary = command.kind === "damage" ? undefined :
          await readDamage.summary(row, resources).catch(() => undefined);
        const { png, original } = await renderZzzPanelDetail(row, identity.uid, {
          ...theme, ...portraitOptions, showcase: !privateIds.has(row.id), damage, damageSummary, profileId,
        });
        await sameRole();
        const message = { type: "image" as const, file: png };
        if (!original || context.self_id === undefined) return message;
        return {
          type: "delivery" as const, message,
          async onDelivered(id: number) {
            await sameRole();
            await originals.delivered(context, id, { profileId, uid: identity.uid, region }, original);
          },
        };
      }

      async function refreshShowcase(verify: () => Promise<void>) {
        const tables = await loadEnkaPanelTables(resources);
        if (!tables) return "绝区零公开展柜所需的本地游戏资料不可用。";
        const requestedAt = Date.now();
        const result = await requestShowcase(identity, signal, async () => {
          await verify();
          await context.reply("正在查询第三方 Enka 公开展柜。此请求只发送当前档案的游戏 UID。");
          await verify();
        });
        const rows = result.rows.flatMap(data => {
          const row = formatEnkaPanel(data, tables);
          return row ? [row] : [];
        });
        if (rows.length !== result.rows.length) {
          return "本地游戏资料无法核验本次公开展柜的全部角色或装备。";
        }
        const saved = await showcaseArchive.replace(identity, rows, requestedAt, verify);
        if (!saved.length) return "该 UID 的公开展柜暂无展示角色。";
        const updatedIds = new Set(saved.map(row => row.id));
        const publicPlayer = { ...display, nickname: result.nickname || "绳匠", level: result.level, avatar: undefined };
        const image = await renderZzzPanelList(saved, publicPlayer, {
          legacyResources: resources, signal, atlasPortrait, updatedIds, showcase: true, inlineImageByteLimit,
        }).catch(() => undefined);
        await verify();
        if (!image) return `Enka 公开展柜已保存 ${saved.length} 个角色。`;
        return { type: "image" as const, file: image.png };
      }

      if (command.kind === "showcase-update") return await refreshShowcase(sameRole);

      const source = await profiles.requestContext(qq, profileId, "zzz", role.uid).catch(async (error: unknown) => {
        if (!(error instanceof ProfileError) || error.code !== "login-required") throw error;
        const { hasCookie, hasStoken } = await profiles.describe(qq, profileId);
        if (hasCookie || hasStoken) throw error;
      });
      if (!source) {
        if (command.names.length) return "指定角色更新需要登录档案。也可以用%更新展柜面板读取公开展示角色。";
        return await refreshShowcase(async () => {
          await sameRole();
          const { hasCookie, hasStoken } = await profiles.describe(qq, profileId);
          if (hasCookie || hasStoken) throw new ProfileError("changed", "绝区零档案登录状态已变化。");
        });
      }
      if (region !== "prod_gf_cn" && region !== "prod_qd_cn") return "米游社面板更新目前支持国服绝区零角色。";
      const key = `${region}:${role.uid}`;
      if (running.has(key)) return "该角色的绝区零面板正在更新，请稍后再试。";
      running.add(key);
      try {
        const { roleInterval } = parseZzzPanelConfig(await readZzzPanelConfigDocument(resources));
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
      if (error instanceof ZzzShowcaseError) return error.message;
      if (error instanceof ZzzDamageUnavailable) return error.message;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return "绝区零档案角色已变化，请重新操作。";
        if (error.code === "missing" || error.code === "login-required") return `[zzz] 请先登录 profile ${profileId}。`;
        if (error.code === "role-missing") return `[zzz] profile ${profileId} 没有同步绝区零 UID。`;
      }
      if (error instanceof GameRecordRequestError || error instanceof HoyoRequestError && ["refresh", "invalid-input"].includes(error.code)) {
        return error.message;
      }
      if (error instanceof HoyoRequestError && error.code === "profile-changed") return "绝区零档案角色已变化，请重新操作。";
      if (command.kind === "showcase-update") return "绝区零公开展柜暂时无法更新。";
      if (command.kind === "proficiency") {
        if (error instanceof ImageSizeLimitError) return "绝区零练度统计超过当前会话的图片大小上限。";
        return "绝区零练度统计暂时无法查询。";
      }
      return command.kind === "update" ? "绝区零面板暂时无法更新。" : "绝区零面板暂时无法查询。";
    }
  };
  return Object.assign(handle, {
    renderPublic: (avatar: ZzzPanelAvatar, uid: string, options: Parameters<typeof renderZzzPanelDetail>[2]) =>
      renderZzzPanelDetail(avatar, uid, { ...options, ...portraitOptions, showcase: true }),
  });
}
