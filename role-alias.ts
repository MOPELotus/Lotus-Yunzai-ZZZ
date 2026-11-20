import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { panelObject } from "./panel-detail.ts";

export const zzzRoleName = (name: string) => name.normalize("NFKC").trim().toLowerCase();

export async function readZzzRoleAliases(resources: string | undefined) {
  if (resources) return panelObject(Bun.YAML.parse(await readFile(join(dirname(resources), "config", "alias.yaml"), "utf8")));
}

export function zzzRoleAlias(aliases: Readonly<Record<string, unknown>> | undefined, query: string) {
  const name = zzzRoleName(query);
  return Object.entries(aliases ?? {}).find(([entry, list]) => zzzRoleName(entry) === name ||
    (Array.isArray(list) && list.some(item => typeof item === "string" && zzzRoleName(item) === name)))?.[0];
}
