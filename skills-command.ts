import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import { zzzResourceDirectory } from "./card-theme.ts";
import { fileURLToPath } from "node:url";
import { createAtlasRuntimeCatalog, findTraditionalEntries } from "@lotus-yunzai/atlas/catalog";
import { readAtlasGalleryImage } from "@lotus-yunzai/atlas/gallery";
import { loadImage } from "skia-canvas";
import { openZzzCardTheme } from "./card-theme.ts";
import { ZzzInlineImageLimitError } from "./challenge-card.ts";
import { panelObject } from "./panel-detail.ts";
import { readPanelJson } from "./panel-storage.ts";
import { readZzzRoleAliases, zzzRoleAlias } from "./role-alias.ts";
import { renderZzzSkills } from "./skills-card.ts";
import { buildZzzSkills, skillKinds, zzzSkillText, type zzzSkillCommand } from "./skills-data.ts";

const atlasRoot = fileURLToPath(new URL("../../data/atlas/", import.meta.url));

export function createZzzSkillReader(signal: AbortSignal) {
  const catalog = createAtlasRuntimeCatalog(atlasRoot, Bun.env.LOTUS_ATLAS_DATA_DIR);
  return async ({ name, levels }: NonNullable<ReturnType<typeof zzzSkillCommand>>, {
    resources = zzzResourceDirectory(), inlineImageByteLimit,
  }: { readonly resources?: string; readonly inlineImageByteLimit?: number } = {}) => {
    try {
      const [snapshot, aliases] = await Promise.all([catalog.read(), readZzzRoleAliases(resources).catch(() => undefined)]);
      const matches = findTraditionalEntries(snapshot, zzzRoleAlias(aliases, name) ?? name, "zzz", "character");
      if (matches.length !== 1) return $t("skills-command.text_98c70549e8", { "name": name });
      const { entry } = matches[0]!;
      if (!/^[1-9]\d{0,5}$/u.test(entry.id)) return;
      // The compact Atlas view omits the original B–E attack-data columns.
      // Read the same validated catalog entry using its paired snapshot root.
      const root = catalog.assetRoot(entry);
      const item = panelObject(await readPanelJson(root, entry.path));
      const meta = panelObject(item.meta);
      if (meta.gameId !== "zzz" || meta.pageId !== "character" || meta.recordId !== entry.id || meta.version !== entry.version) {
        return $t("skills-command.text_f11a55782f", { "name": entry.name });
      }
      const detail = panelObject(panelObject(item.content).detail);
      if (String(detail.id) !== entry.id) return $t("skills-command.text_f11a55782f", { "name": entry.name });
      const sections = buildZzzSkills(detail, levels);
      if (!sections) return $t("skills-command.text_36fcfe9b7c", { "name": entry.name });
      if (signal.aborted) return [];
      const partner = panelObject(detail.partner_info);
      const impressions = [partner.impression_f, partner.impression_m].map(zzzSkillText).filter(Boolean);
      const galleryRows = Array.isArray(meta.images) ? meta.images.map(panelObject) : [];
      const faceIcon = galleryRows.find(row => row.fieldPath === "detail.partner_info.icon_path" &&
        row.status === "downloaded" && row.placeholder !== true)?.localPath;
      async function galleryImage(path: string | undefined) {
        const bytes = await readAtlasGalleryImage(root, "zzz", path, 8 * 1024 * 1024).catch(() => undefined);
        return bytes && loadImage(Buffer.from(bytes)).catch(() => undefined);
      }
      const local = await openZzzCardTheme({ legacyResources: resources });
      const [background, avatar, icons] = await Promise.all([
        local("common/images/bg.jpg"),
        local(`images/square_avatar/role_square_avatar_${entry.id}.png`).then(async image => {
          if (image) return image;
          return await galleryImage(typeof faceIcon === "string" ? faceIcon : undefined) ??
            galleryImage((await catalog.roleDetails(entry))?.overview.icon);
        }),
        Promise.all(skillKinds.map(async kind => [kind, await local(`common/images/skills/${kind}.webp`)] as const)),
      ]);
      if (signal.aborted) return [];
      const pages = await renderZzzSkills(sections, {
        name: entry.name, fullName: zzzSkillText(partner.full_name), impressions, avatar, background,
        icons: Object.fromEntries(icons),
      }, inlineImageByteLimit);
      if (signal.aborted) return [];
      const images = pages.map(({ png }) => ({ type: "image" as const, file: png }));
      return images.length === 1 ? images[0] : { type: "forward" as const, nodes: [$t("skills-command.text_cfd049d3f5", { "name": entry.name, "length": images.length }), ...images] };
    } catch (error) {
      if (signal.aborted) return [];
      if (error instanceof ZzzInlineImageLimitError) return $t("skills-command.text_2cbb80ffd2");
      return $t("skills-command.text_07359a0477");
    }
  };
}
