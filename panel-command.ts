import { panelQueryUser } from "../../lib/panel-query-target.ts";
import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
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
    return $t("panel-command.text_186253f940");
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
    throw new Error($t("panel-command.text_e4f8605f21"));
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
      throw new ProfileError("changed", $t("panel-command.text_9cf98a9cde"));
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
      return sharedCommand ? undefined : $t("panel-command.text_4cfab4ad85");
    }
    const missing = sharedCommand ? undefined : $t("panel-command.text_68c18e077a");
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
    const user = ["list", "detail", "showcase-detail", "damage", "proficiency"].includes(command.kind)
      ? panelQueryUser(context) : context.user_id;
    if ((context.message_type !== "group" && context.message_type !== "private") || context.isDelegated ||
        typeof user !== "number" || !Number.isSafeInteger(user) || user < 1) {
      if (command.kind === "original" && command.sharedCommand) return;
      return $t("panel-command.text_b669aaeb8f");
    }
    const qq = String(user);
    const resources = zzzResourceDirectory();
    // Bundled artwork is independent from the version-checked damage data.
    // Only an explicit legacy resource override selects the old calculation tree.
    const damageResources = Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR?.trim();
    if (command.kind === "original") return originalPicture(context, qq, resources, command.sharedCommand === true);
    const { profileId } = command;
    try {
      const role = await profiles.savedRole(qq, profileId, "zzz");
      const region = zzzPanelRegion(role.uid, role.region, role.gameBiz);
      if (!region) return $t("panel-command.text_3c2fdabb7d");
      const identity = { qq, uid: role.uid, region };
      const display: GameRole = { ...role, region };
      const { inlineImageByteLimit } = context;
      const theme = { qq, signal, legacyResources: resources, atlasPortrait, inlineImageByteLimit };
      const sameRole = () => verifyRole(qq, profileId, identity);

      if (command.kind === "proficiency") {
        const local = command.showcase ? [] : await archive.read(identity);
        const rows = local.length ? local : await showcaseArchive.read(identity);
        await sameRole();
        if (!rows.length) return command.showcase ? $t("panel-command.text_fbee8127aa") :
          $t("panel-command.text_e990c3f994");
        const { png } = await renderZzzProficiency(buildZzzProficiency(rows), display, {
          qq, legacyResources: resources, signal, atlasPortrait, source: local.length ? "local" : "showcase",
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
        if (!rows.length) return $t("panel-command.text_2a779b6c39", { "uid": role.uid });
        const image = await renderZzzPanelList(rows, display, theme).catch((error: unknown) => {
          if (!(error instanceof ZzzInlineImageLimitError || error instanceof ImageSizeLimitError)) throw error;
        });
        await sameRole();
        if (image) return { type: "image" as const, file: image.png };
        return [$t("panel-command.text_16396605da", { "uid": role.uid }), ...rows.map(row => `${row.name_mi18n} · Lv.${row.level}`)].join("\n");
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
        if (!ids.length) return $t("panel-command.text_d080e2be29", { "name": command.name });
        if (!row) return command.kind === "showcase-detail"
          ? $t("panel-command.text_3b7a008e6f", { "name": command.name })
          : $t("panel-command.text_58d3b20941", { "name": command.name });
        const damage = command.kind === "damage" ? await readDamage(row, damageResources, command.skill) : undefined;
        const damageSummary = command.kind === "damage" ? undefined :
          await readDamage.summary(row, damageResources).catch(() => undefined);
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
        if (!tables) return $t("panel-command.text_bf3e1ea9a3");
        const requestedAt = Date.now();
        const result = await requestShowcase(identity, signal, async () => {
          await verify();
          await context.reply($t("panel-command.text_3e4059b671"));
          await verify();
        });
        const rows = result.rows.flatMap(data => {
          const row = formatEnkaPanel(data, tables);
          return row ? [row] : [];
        });
        if (rows.length !== result.rows.length) {
          return $t("panel-command.text_f490976de2");
        }
        const saved = await showcaseArchive.replace(identity, rows, requestedAt, verify);
        if (!saved.length) return $t("panel-command.text_15a84fcfc4");
        const updatedIds = new Set(saved.map(row => row.id));
        const publicPlayer = { ...display, nickname: result.nickname || $t("panel-command.text_4efe2edb6d"), level: result.level, avatar: undefined };
        const image = await renderZzzPanelList(saved, publicPlayer, {
          legacyResources: resources, signal, atlasPortrait, updatedIds, showcase: true, inlineImageByteLimit,
        }).catch(() => undefined);
        await verify();
        if (!image) return $t("panel-command.text_465b7453fa", { "length": saved.length });
        return { type: "image" as const, file: image.png };
      }

      if (command.kind === "showcase-update") return await refreshShowcase(sameRole);

      const source = await profiles.requestContext(qq, profileId, "zzz", role.uid).catch(async (error: unknown) => {
        if (!(error instanceof ProfileError) || error.code !== "login-required") throw error;
        const { hasCookie, hasStoken } = await profiles.describe(qq, profileId);
        if (hasCookie || hasStoken) throw error;
      });
      if (!source) {
        if (command.names.length) return $t("panel-command.text_32422e3a61");
        return await refreshShowcase(async () => {
          await sameRole();
          const { hasCookie, hasStoken } = await profiles.describe(qq, profileId);
          if (hasCookie || hasStoken) throw new ProfileError("changed", $t("panel-command.text_df7439bc97"));
        });
      }
      if (region !== "prod_gf_cn" && region !== "prod_qd_cn") return $t("panel-command.text_52e48d2d22");
      const key = `${region}:${role.uid}`;
      if (running.has(key)) return $t("panel-command.text_e24d8a9b63");
      running.add(key);
      try {
        const { roleInterval } = parseZzzPanelConfig(await readZzzPanelConfigDocument(resources));
        const selected = command.names.length ? await targets(command.names, resources) : undefined;
        if (selected?.missing.length) return $t("panel-command.text_00b8cd9c3d", { "value1": selected.missing.map(name => `【${name}】`).join("") });
        await context.reply(command.names.length ? $t("panel-command.text_a24961be0f", { "value1": command.names.join("、") }) : $t("panel-command.text_5bbc3899a5"));
        const result = await client.fetchZzzPanel(source, { ids: selected?.ids, signal, roleInterval });
        if (result.uid !== role.uid || result.region !== region) throw new ProfileError("changed", $t("panel-command.text_9cf98a9cde"));
        if (!result.avatars.length) return $t("panel-command.text_2f2fc38be8");
        const verify = async () => {
          await sameRole();
          const current = await profiles.requestContext(qq, profileId, "zzz", role.uid);
          if (current.revision !== result.revision) throw new ProfileError("changed", $t("panel-command.text_a53ef5b37a"));
          signal.throwIfAborted();
        };
        const rows = await archive.merge(identity, result.avatars, verify);
        const updatedIds = new Set(result.avatars.map(row => row.id));
        const image = await renderZzzPanelList(rows, display, { ...theme, updatedIds }).catch(() => undefined);
        await verify();
        if (!image) return $t("panel-command.text_7adbf8ad9f", { "size": updatedIds.size });
        return { type: "image" as const, file: image.png };
      } finally {
        running.delete(key);
      }
    } catch (error) {
      if (signal.aborted) return [];
      if (error instanceof ZzzShowcaseError) return error.message;
      if (error instanceof ZzzDamageUnavailable) return error.message;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return $t("panel-command.text_48851f4ae3");
        if (error.code === "missing" || error.code === "login-required") return $t("panel-command.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") return $t("panel-command.text_4ea60872c8", { "profileId": profileId });
      }
      if (error instanceof GameRecordRequestError || error instanceof HoyoRequestError && ["refresh", "invalid-input"].includes(error.code)) {
        return error.message;
      }
      if (error instanceof HoyoRequestError && error.code === "profile-changed") return $t("panel-command.text_48851f4ae3");
      if (command.kind === "showcase-update") return $t("panel-command.text_6bd2843285");
      if (command.kind === "proficiency") {
        if (error instanceof ImageSizeLimitError) return $t("panel-command.text_b100340b6a");
        return $t("panel-command.text_133be35d67");
      }
      return command.kind === "update" ? $t("panel-command.text_0072539b31") : $t("panel-command.text_315a13bdae");
    }
  };
  return Object.assign(handle, {
    renderPublic: (avatar: ZzzPanelAvatar, uid: string, options: Parameters<typeof renderZzzPanelDetail>[2]) =>
      renderZzzPanelDetail(avatar, uid, { ...options, ...portraitOptions, showcase: options?.showcase ?? true }),
  });
}
