import { fileURLToPath } from "node:url";
import { createAtlasRuntimeCatalog, findTraditionalEntries } from "@lotus-yunzai/atlas/catalog";
import { readAtlasGalleryImage } from "@lotus-yunzai/atlas/gallery";
import { loadImage } from "skia-canvas";
import { openZzzCardTheme } from "./card-theme.ts";
import { panelObject } from "./panel-detail.ts";
import { readPanelJson } from "./panel-storage.ts";
import { readZzzRoleAliases, zzzRoleAlias } from "./role-alias.ts";
import { renderZzzSkills } from "./skills-card.ts";
import { buildZzzSkills, skillKinds, zzzSkillText, type zzzSkillCommand } from "./skills-data.ts";

const atlasRoot = fileURLToPath(new URL("../../data/atlas/", import.meta.url));

export function createZzzSkillReader(signal: AbortSignal) {
  const catalog = createAtlasRuntimeCatalog(atlasRoot, Bun.env.LOTUS_ATLAS_DATA_DIR);
  return async ({ name, levels }: NonNullable<ReturnType<typeof zzzSkillCommand>>, resources = Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR) => {
    try {
      const [snapshot, aliases] = await Promise.all([catalog.read(), readZzzRoleAliases(resources).catch(() => undefined)]);
      const matches = findTraditionalEntries(snapshot, zzzRoleAlias(aliases, name) ?? name, "zzz", "character");
      if (matches.length !== 1) return `未找到${name}的技能资料。`;
      const { entry } = matches[0]!;
      if (!/^[1-9]\d{0,5}$/u.test(entry.id)) return;
      // The compact Atlas view omits the original B–E attack-data columns.
      // Read the same validated catalog entry using its paired snapshot root.
      const root = catalog.assetRoot(entry);
      const item = panelObject(await readPanelJson(root, entry.path));
      const meta = panelObject(item.meta);
      if (meta.gameId !== "zzz" || meta.pageId !== "character" || meta.recordId !== entry.id || meta.version !== entry.version) {
        return `${entry.name}的原始技能记录无法核验。`;
      }
      const detail = panelObject(panelObject(item.content).detail);
      if (String(detail.id) !== entry.id) return `${entry.name}的原始技能记录无法核验。`;
      const sections = buildZzzSkills(detail, levels);
      if (!sections) return `${entry.name}的指定等级技能资料不完整。`;
      if (signal.aborted) return [];
      const partner = panelObject(detail.partner_info);
      const impressions = [partner.impression_f, partner.impression_m].map(zzzSkillText).filter(Boolean);
      const local = await openZzzCardTheme({ legacyResources: resources });
      const [background, avatar, icons] = await Promise.all([
        local("common/images/bg.jpg"),
        local(`images/square_avatar/role_square_avatar_${entry.id}.png`).then(async image => {
          if (image) return image;
          const role = await catalog.roleDetails(entry);
          const bytes = await readAtlasGalleryImage(root, "zzz", role?.overview.icon, 8 * 1024 * 1024).catch(() => undefined);
          if (bytes) return loadImage(bytes).catch(() => undefined);
        }),
        Promise.all(skillKinds.map(async kind => [kind, await local(`common/images/skills/${kind}.webp`)] as const)),
      ]);
      if (signal.aborted) return [];
      const pages = await renderZzzSkills(sections, {
        name: entry.name, fullName: zzzSkillText(partner.full_name), impressions, avatar, background,
        icons: Object.fromEntries(icons),
      });
      if (signal.aborted) return [];
      const images = pages.map(({ png }) => ({ type: "image" as const, file: png }));
      return images.length === 1 ? images[0] : { type: "forward" as const, nodes: [`${entry.name}技能 · ${images.length} 页`, ...images] };
    } catch {
      return signal.aborted ? [] : "绝区零技能暂时无法查看。";
    }
  };
}
