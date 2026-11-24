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
    if (command.kind !== "list" && !ownsZzzManagement(context, signal)) return "仅限主人设置。";
    const scope = rankGroup(context);
    const redis = globalThis.redis;
    if (command.kind !== "list" && !redis) return "角色别名设置暂时不可用。";

    try {
      if (command.kind !== "list" && scope && !await rankMembership(context, scope.actor)) return "暂无法核对当前群成员。";
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
        if (!role) return "未找到对应代理人。";
        const list = registry.groups[role.name] ?? [];
        return list.length ? `角色 ${role.name} 共 ${list.length} 个别名：\n${list.join("、")}` : `角色 ${role.name} 暂无别名。`;
      }

      if (!registry.overrides || !redis) return "角色别名设置暂时不可用。";
      const key = zzzAliasKey(command.alias);
      if (!key) return "请输入 1 到 48 个文字、数字或常用连接符组成的角色别名。";
      const indexed = findTraditionalEntries(snapshot, command.alias, undefined, "name").some(({ score }) => score >= 2.5);
      const configured = registry.aliases.get(key);
      if (command.kind === "remove") {
        if (registry.canonical.has(key) || indexed) return "该名称来自角色本名或图鉴索引，无法删除。";
        if (configured?.length !== 1) return "未找到唯一可删除的角色别名。";
        if (!ownsZzzManagement(context, signal)) return "仅限主人设置。";
        return await updateZzzRoleAlias(redis, key, registry.overrides[key]) ?
          `角色 ${configured[0]!.role} 的别名 ${command.alias} 已删除。` : "别名已变化，请重新查询。";
      }

      const role = roleFor(command.role);
      if (!role) return "未找到唯一对应的绝区零代理人。";
      if (registry.canonical.has(key) || indexed || configured?.length) return `别名 ${command.alias} 已存在。`;
      if (!ownsZzzManagement(context, signal)) return "仅限主人设置。";
      return await updateZzzRoleAlias(redis, key, registry.overrides[key], { role: role.name, label: command.alias, id: role.id }) ?
        `角色 ${role.name} 已添加别名 ${command.alias}。` : "别名已变化，请重新查询。";
    } catch {
      return "角色别名暂时不可用。";
    }
  };
}
