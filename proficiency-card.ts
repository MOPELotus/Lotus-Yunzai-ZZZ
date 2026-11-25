import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import type { GameRole } from "@lotus-yunzai/account";
import { ImageSizeLimitError, nativeImageRasterScale, renderPng } from "@lotus-yunzai/skia";
import type { CanvasRenderingContext2D as Context, Image } from "skia-canvas";
import { box, cover, drawZzzCardPlayer, label, loadZzzCardPlayer, openZzzCardTheme, zzzCardFooter, zzzScoreColors } from "./card-theme.ts";
import { contain, fillRound } from "./challenge-card.ts";
import { cachedPanelWeaponImage, firstCachedPanelImage, panelSpriteName, readPanelArtMap } from "./panel-artwork.ts";
import type { ZzzAtlasPortraitReader } from "./panel-original.ts";
import { panelObject } from "./panel-detail.ts";
import type { buildZzzProficiency } from "./proficiency.ts";

type Proficiency = ReturnType<typeof buildZzzProficiency>;
type Row = Proficiency["rows"][number];
type Options = {
  readonly source: "local" | "showcase";
  readonly legacyResources?: string;
  readonly signal?: AbortSignal;
  readonly atlasPortrait?: ZzzAtlasPortraitReader;
  readonly inlineImageByteLimit?: number;
};
type RowArtwork = { portrait?: Image; weapon?: Image };
const width = 840;
const listTop = 427.1;
const rowHeight = 52;
const gap = 24;
const skew = Math.tan(25 * Math.PI / 180);
const rankColor = ["#666", "#3a742b", "#3d84d6", "#df7676", "#3336a1", "#667f13", "#da3020"];
const rarityBorder = { S: "#e9be4f", A: "#a429d2", B: "#6582a1" } as const;
const skillNames = [$t("proficiency-card.text_a223d4521a"), $t("proficiency-card.text_02c6f46a33"), $t("proficiency-card.text_7bb1340403"), $t("proficiency-card.text_25bd63d817"), $t("proficiency-card.text_91bb18682b"), $t("proficiency-card.text_e90ae9b53b")] as const;

async function loadProficiencyArt(model: Proficiency, options: Options) {
  const local = await openZzzCardTheme(options);
  const [partners, weapons, background, frame, skill, player] = await Promise.all([
    readPanelArtMap(options.legacyResources, "PartnerId2Data"), readPanelArtMap(options.legacyResources, "WeaponId2Data"),
    local("common/images/bg.jpg"), local("proficiency/images/BgFrame.png"), local("proficiency/images/skill_bg.png"),
    loadZzzCardPlayer(local, options),
  ]);
  const paths = [...new Set(model.rows.flatMap(row => row.element ? [`common/images/element/${row.element}.png`] : [])
    .concat(["S", "A", "B"].map(rarity => `common/images/Rarity_${rarity}.png`)))];
  const badges = new Map(await Promise.all(paths.map(async path => [path, await local(path)] as const)));
  const art: RowArtwork[] = [];
  for (let offset = 0; offset < model.rows.length; offset += 8) {
    options.signal?.throwIfAborted();
    art.push(...await Promise.all(model.rows.slice(offset, offset + 8).map(async ({ avatar, weapon }) => {
      const sprite = panelSpriteName(panelObject(partners[avatar.id]).sprite_id);
      const [portrait, icon] = await Promise.all([
        firstCachedPanelImage(local, [
          ...(sprite ? [`images/hakush/role_general/IconRoleGeneral${sprite}.webp`, `images/role_general/IconRoleGeneral${sprite}.png`,
            `images/nanoka/role_general/IconRoleGeneral${sprite}.webp`] : []),
          `images/square_avatar/role_square_avatar_${avatar.id}.png`,
        ]).then(async cached => cached ?? (await options.atlasPortrait?.(avatar.id, true))?.image),
        weapon ? cachedPanelWeaponImage(local, weapons[weapon.id]) : undefined,
      ]);
      return { portrait, weapon: icon };
    })));
  }
  return { background, frame, skill, player, badges, art };
}

function metricsFrame(context: Context, texture: Image | undefined) {
  if (!texture || texture.width <= 166 || texture.height <= 268) {
    fillRound(context, "#17161c", 48, 145, 744, 186, 16, "#615d62");
    return;
  }
  const sx = [0, 82.5, texture.width - 82.5, texture.width];
  const sy = [0, 105, texture.height - 162.5, texture.height];
  const dx = [48, 72, 768, 792];
  const dy = [145, 217, 307, 331];
  for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
    context.drawImage(texture, sx[column]!, sy[row]!, sx[column + 1]! - sx[column]!, sy[row + 1]! - sy[row]!,
      dx[column]!, dy[row]!, dx[column + 1]! - dx[column]!, dy[row + 1]! - dy[row]!);
  }
}

function skewedBox(context: Context, x: number, y: number, w: number, h: number, color: string, stroke?: string, radius = 7) {
  context.save();
  context.transform(1, 0, -skew, 1, x + h * skew / 2, y);
  fillRound(context, color, 0, 0, w, h, radius, stroke);
  context.restore();
}

function artTile(context: Context, image: Image | undefined, x: number, y: number, w: number, h: number, stroke: string) {
  const offset = h * skew;
  context.save();
  context.transform(1, 0, -skew, 1, x + offset / 2, y);
  context.beginPath();
  context.rect(0, 0, w, h);
  context.clip();
  context.transform(1, 0, skew, 1, -offset / 2, 0);
  box(context, "#211f25", 0, 0, w + offset, h);
  if (image) cover(context, image, 0, 0, w + offset, h);
  context.restore();
  context.save();
  context.transform(1, 0, -skew, 1, x + offset / 2, y);
  box(context, stroke, 0, 0, 2, h);
  box(context, stroke, w - 2, 0, 2, h);
  context.restore();
}

function drawRow(context: Context, row: Row, images: RowArtwork, art: Awaited<ReturnType<typeof loadProficiencyArt>>, y: number) {
  const { avatar, weapon, element, driveDiscGrade } = row;
  const stroke = rarityBorder[avatar.rarity];
  skewedBox(context, 60, y, 720, rowHeight, "#131216d9", stroke, 10);
  artTile(context, images.portrait, 93, y + 1, 119, rowHeight - 2, stroke);
  if (!images.portrait) label(context, avatar.name_mi18n, 154, y + 27, 17, { align: "center", maxWidth: 88 });
  skewedBox(context, 80, y + 2, 55, 19, rankColor[avatar.rank]!);
  label(context, $t("proficiency-card.text_68b16e68e7", { "rank": avatar.rank }), 107, y + 11, 13, { align: "center" });
  skewedBox(context, 175, y + 32, 65, 18, rankColor[Math.min(6, Math.trunc(avatar.level / 10))]!);
  label(context, `Lv${avatar.level}`, 207, y + 41, 13, { align: "center" });
  const elementIcon = element && art.badges.get(`common/images/element/${element}.png`);
  if (elementIcon) contain(context, elementIcon, 214, y + 4, 23, 23);

  if (art.skill) cover(context, art.skill, 248.4, y + 2, 240, 45.6);
  for (const [index, level] of row.skills.entries()) {
    const x = 259.8 + index * 36.27;
    if (!art.skill) {
      fillRound(context, "#292830", x - 12, y + 6, 24, 39, 8);
      label(context, skillNames[index]!, x, y + 17, 11, { align: "center", color: "#a09ca3" });
    }
    label(context, level === undefined ? "—" : String(level), x, y + 35, 13, { align: "center" });
  }

  artTile(context, images.weapon, 482, y + 1, 86, rowHeight - 2, stroke);
  if (!weapon) label(context, $t("proficiency-card.text_e055af7b73"), 620, y + 26, 16, { align: "center", color: "#dadada" });
  else {
    const badge = weapon.rarity && art.badges.get(`common/images/Rarity_${weapon.rarity}.png`);
    if (badge) contain(context, badge, 573, y + 4, 20, 20);
    label(context, weapon.name, 596, y + 15, 15, { maxWidth: 95 });
    const stars = weapon.star === undefined ? $t("proficiency-card.text_066a62e797") : $t("proficiency-card.text_9d86d2df73", { "star": weapon.star });
    const level = weapon.level === undefined ? "Lv—" : `Lv${weapon.level}`;
    skewedBox(context, 569, y + 30, 49, 18, rankColor[weapon.star ?? 0]!);
    skewedBox(context, 621, y + 30, 57, 18, rankColor[Math.min(6, Math.trunc((weapon.level ?? 0) / 10))]!);
    label(context, stars, 591, y + 39, 13, { align: "center" });
    label(context, level, 647, y + 39, 13, { align: "center" });
  }
  context.save();
  context.transform(1, 0, -skew, 1, 705, y);
  box(context, stroke, 0, 0, 2, rowHeight);
  context.restore();
  label(context, $t("proficiency-card.text_d245c1825d"), 734, y + 15, 13, { align: "center" });
  label(context, driveDiscGrade ?? (row.withDriveDiscs ? $t("proficiency-card.text_f58e9a5870") : $t("proficiency-card.text_2e03e7c94f")), 734, y + 37,
    driveDiscGrade ? 19 : 13, { align: "center", color: driveDiscGrade ? zzzScoreColors[driveDiscGrade] : "#a09ca3" });
}

function drawTitle(context: Context) {
  context.save();
  context.transform(1, 0, -0.17, 1, 64, 0);
  label(context, "Avatar List", 420, 375, 61, { align: "center", color: "#ffffff22", weight: 800 });
  context.restore();
  for (const left of [64, 574]) for (let index = 0; index < 8; index++) {
    context.save();
    context.transform(1, 0, -skew, 1, left + index * 24.8, 363);
    box(context, "#f6ca45", 0, 0, 16, 30);
    context.restore();
  }
  label(context, $t("proficiency-card.text_7f4826dbdb"), 420, 379, 34, { align: "center", weight: 700 });
}

// Skia adaptation of ZZZure/ZZZ-Plugin 2057599 resources/proficiency/index.html and index.css.
export async function renderZzzProficiency(model: Proficiency, role: GameRole, options: Options) {
  const art = await loadProficiencyArt(model, options);
  options.signal?.throwIfAborted();
  const height = Math.round(listTop + model.total * (rowHeight + gap) + 68);
  function draw(context: Context) {
    box(context, "#1d1b20", 0, 0, width, height);
    if (art.background) cover(context, art.background, 0, 0, width, height);
    const shade = context.createLinearGradient(0, 0, 0, height);
    shade.addColorStop(0, "#0002");
    shade.addColorStop(1, "#0004");
    context.fillStyle = shade;
    context.fillRect(0, 0, width, height);
    context.save();
    context.translate(0, 2);
    context.scale(0.9, 0.9);
    drawZzzCardPlayer(context, role, role.region, art.player);
    context.restore();
    metricsFrame(context, art.frame);
    [
      [`${model.agentS}/${model.total}`, $t("proficiency-card.text_1b79578a70")],
      [model.sWeaponRate === undefined ? "—" : `${model.sWeaponRate.toFixed(1)}%`, $t("proficiency-card.text_44230c2fcb")],
      [`${model.highRank}/${model.total}`, $t("proficiency-card.text_40f397ec2f")],
      [String(model.highGrades), $t("proficiency-card.text_04a1b34e0f")],
    ].forEach(([value, name], index) => {
      const x = 153 + 174 * index;
      const pillWidth = 29 + value!.length * 11.3;
      fillRound(context, "#d6bc3e", x - pillWidth / 2, 245, pillWidth, 35, 8);
      label(context, value!, x, 262, 23, { align: "center", weight: 700, color: "#101016" });
      label(context, name!, x, 296, 19, { align: "center" });
    });
    drawTitle(context);
    fillRound(context, "#18171bdd", 641, 399, 124, 24, 8);
    label(context, options.source === "showcase" ? $t("proficiency-card.text_5304f62a0d") : $t("proficiency-card.text_918e3dd5be"), 703, 411, 15, {
      align: "center", color: options.source === "showcase" ? "#f3c858" : "#b8b5bd",
    });
    for (const [index, row] of model.rows.entries()) drawRow(context, row, art.art[index]!, art, listTop + (rowHeight + gap) * index);
    label(context, zzzCardFooter, 420, height - 48, 17, { align: "center", color: "#fff" });
  }

  const standard = nativeImageRasterScale() === 4;
  const image = await renderPng(width * 4, height * 4, context => {
    context.scale(4, 4);
    draw(context);
  }, "gpu", { allowHalfScale: standard });
  const limit = options.inlineImageByteLimit;
  if (limit === undefined || image.png.byteLength <= limit) return image;
  if (standard && !image.reducedScaleReason) {
    options.signal?.throwIfAborted();
    const reduced = await renderPng(width * 2, height * 2, context => {
      context.scale(2, 2);
      draw(context);
    }, "gpu");
    if (reduced.png.byteLength <= limit) return reduced;
  }
  throw new ImageSizeLimitError($t("proficiency-card.text_b100340b6a"));
}
