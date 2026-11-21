import { readZzzAliasRegistry } from "@lotus-yunzai/atlas/zzz-aliases";
export { zzzRoleAlias, zzzRoleName } from "@lotus-yunzai/atlas/zzz-aliases";

export async function readZzzRoleAliases(resources: string | undefined) {
  return (await readZzzAliasRegistry(resources, globalThis.redis)).groups;
}
