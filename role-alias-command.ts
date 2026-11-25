import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import { zzzResourceDirectory } from "./card-theme.ts";
import { fileURLToPath } from "node:url";
import { createAtlasRuntimeCatalog, findTraditionalEntries } from "@lotus-yunzai/atlas/catalog";
import { readZzzAliasRegistry, updateZzzRoleAlias, zzzAliasKey, zzzRoleAlias, zzzRoleName } from "@lotus-yunzai/atlas/zzz-aliases";
import { rankGroup, rankMembership, type ChallengeRankContext } from "./challenge-rank.ts";
import { zzzPrefixedCommand } from "./panel-command.ts";

const atlasRoot = fileURLToPath(new URL("../../data/atlas/", import.meta.url));

export function zzzRoleAliasCommand(raw: string) {
  const command = zzzPrefixedCommand(raw);
  if (!command || command.length > 160) return;
  const add = /^添加(\S+)别名(\S+)$/u.exec(command);
  if (add) return { kind: "add", role: add[1]!, alias: add[2]! } as const;
  const remove = /^删除别名(\S+)$/u.exec(command);
  if (remove) return { kind: "remove", alias: remove[1]! } as const;
  const list = /^(\S+)别名$/u.exec(command);
  if (list) return { kind: "list", role: list[1]! } as const;
}

export function ownsZzzManagement(context: ChallengeRankContext, signal: AbortSignal) {
  const user = context.user_id;
  return !signal.aborted && !context.isDelegated && !!user && context.isBotMaster?.(user) === true &&
    (context.adapter === "milky" || context.isMaster === true) &&
    (context.message_type === "private" ? !!context.privateCredentialSignal && !context.privateCredentialSignal.aborted : !!rankGroup(context));
}

export function createZzzRoleAliasCommands(signal: AbortSignal) {
  const catalogue = createAtlasRuntimeCatalog(atlasRoot, Bun.env.LOTUS_ATLAS_DATA_DIR);
  return async (context: ChallengeRankContext, command: NonNullable<ReturnType<typeof zzzRoleAliasCommand>>) => {
    if (signal.aborted || context.isDelegated) return;
    if (command.kind !== "list" && !ownsZzzManagement(context, signal)) return $t("role-alias-command.text_e3c1df5c60");
    const scope = rankGroup(context);
    const redis = globalThis.redis;
    if (command.kind !== "list" && !redis) return $t("role-alias-command.text_1b49d362fa");

    try {
      if (command.kind !== "list" && scope && !await rankMembership(context, scope.actor)) return $t("role-alias-command.text_b9eeade8a7");
      const [snapshot, registry] = await Promise.all([
        catalogue.read(), readZzzAliasRegistry(zzzResourceDirectory(), redis),
      ]);
      function roleFor(name: string) {
        const canonical = zzzRoleAlias(registry.groups, name) ?? name;
        const aliases = registry.aliases.get(zzzRoleName(name));
        const id = aliases?.length === 1 ? aliases[0]?.id : undefined;
        const matches = findTraditionalEntries(snapshot, canonical, "zzz", "character").filter(({ entry }) => !id || entry.id === id);
        if (matches.length === 1) return matches[0]?.entry;
      }
      if (command.kind === "list") {
        const role = roleFor(command.role);
        if (!role) return $t("role-alias-command.text_ebcb4d619b");
        const list = registry.groups[role.name] ?? [];
        return list.length ? $t("role-alias-command.text_197881ba6a", { "name": role.name, "length": list.length, "value3": list.join("、") }) : $t("role-alias-command.text_277e11e2e9", { "name": role.name });
      }

      if (!registry.overrides || !redis) return $t("role-alias-command.text_1b49d362fa");
      const key = zzzAliasKey(command.alias);
      if (!key) return $t("role-alias-command.text_71ef71bf7e");
      const indexed = findTraditionalEntries(snapshot, command.alias, undefined, "name").some(({ score }) => score >= 2.5);
      const configured = registry.aliases.get(key);
      if (command.kind === "remove") {
        if (registry.canonical.has(key) || indexed) return $t("role-alias-command.text_5f45f664eb");
        if (configured?.length !== 1) return $t("role-alias-command.text_1877d3b583");
        if (!ownsZzzManagement(context, signal)) return $t("role-alias-command.text_e3c1df5c60");
        return await updateZzzRoleAlias(redis, key, registry.overrides[key]) ?
          $t("role-alias-command.text_721f893eab", { "role": configured[0]!.role, "alias": command.alias }) : $t("role-alias-command.text_0a7701427b");
      }

      const role = roleFor(command.role);
      if (!role) return $t("role-alias-command.text_6db10f578f");
      if (registry.canonical.has(key) || indexed || configured?.length) return $t("role-alias-command.text_2a09470b5e", { "alias": command.alias });
      if (!ownsZzzManagement(context, signal)) return $t("role-alias-command.text_e3c1df5c60");
      return await updateZzzRoleAlias(redis, key, registry.overrides[key], { role: role.name, label: command.alias, id: role.id }) ?
        $t("role-alias-command.text_6144c59d4c", { "name": role.name, "alias": command.alias }) : $t("role-alias-command.text_0a7701427b");
    } catch {
      return $t("role-alias-command.text_9cdadc18d3");
    }
  };
}
