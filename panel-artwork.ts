import type { openZzzCardTheme } from "./card-theme.ts";
import { panelObject } from "./panel-detail.ts";
import { readPanelJson } from "./panel-storage.ts";

type Local = Awaited<ReturnType<typeof openZzzCardTheme>>;

export function panelSpriteName(value: unknown) {
  if (typeof value === "string" && /^[A-Za-z0-9_&]{1,80}$/u.test(value)) return value;
}

export async function firstCachedPanelImage(local: Local, paths: readonly string[]) {
  for (const path of paths) {
    const image = await local(path);
    if (image) return image;
  }
}

export async function readPanelArtMap(root: string | undefined, name: string): Promise<Record<string, unknown>> {
  return root ? readPanelJson(root, `map/${name}.json`, 8 * 1024 * 1024).then(panelObject, () => ({})) : {};
}

export function cachedPanelWeaponImage(local: Local, record: unknown) {
  const name = panelSpriteName(panelObject(record).CodeName);
  if (name) return firstCachedPanelImage(local, [
    `images/weapon/${name}_High.png`, `images/hakush/weapon/${name}.webp`, `images/nanoka/weapon/${name}.webp`,
  ]);
}
