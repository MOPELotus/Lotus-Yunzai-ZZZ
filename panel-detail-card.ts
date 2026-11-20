import type { ZzzPanelAvatar } from "@lotus-yunzai/hoyo-client";
import { renderPng } from "@lotus-yunzai/skia";
import type { CanvasRenderingContext2D as Context, Image } from "skia-canvas";
import { box, cover, label, openZzzCardTheme, zzzCardFooter, zzzScoreColors, type ZzzCardOptions } from "./card-theme.ts";
import { contain, fillRound, frame } from "./challenge-card.ts";
import { cachedPanelWeaponImage, firstCachedPanelImage, panelSpriteName, readPanelArtMap } from "./panel-artwork.ts";
import { drawPanelDamage, panelDamageHeight, panelDamageSections } from "./panel-damage-card.ts";
import type { PanelDamage } from "./panel-damage.ts";
import { buildZzzPanelDetail, panelObject, type PanelStat } from "./panel-detail.ts";
import { loadZzzAtlasPanelOriginal, loadZzzPanelOriginal, loadZzzRandomGalleryPortrait,
  type ZzzAtlasPortraitReader } from "./panel-original.ts";
import { buildZzzPanelScore } from "./panel-score.ts";

type Local = Awaited<ReturnType<typeof openZzzCardTheme>>;
type Detail = ReturnType<typeof buildZzzPanelDetail>;
type Score = NonNullable<ReturnType<typeof buildZzzPanelScore>>;
type Images = ReadonlyMap<string, Image | undefined>;
type DetailOptions = ZzzCardOptions & {
  readonly showcase?: boolean;
  readonly damage?: PanelDamage;
  readonly profileId?: number;
  readonly atlasPortrait?: ZzzAtlasPortraitReader;
  readonly galleryDirectory?: string;
  readonly atlasNames?: (roleId: number) => Promise<readonly string[]>;
};
const width = 840;
const gold = "#f2d267";
const muted = "#a09ca3";
const propertySprites: Readonly<Record<number, string>> = {
  1: "HpMax", 2: "Attack", 3: "Def", 4: "BreakStun", 5: "Crit", 6: "CritDam",
  7: "PenRatio", 8: "PenValue", 9: "SpRecover", 10: "ElementMystery", 11: "ElementAbnormalPower",
  19: "Laceration.svg", 20: "SharpnessAccumulate.svg", 111: "HpMax", 121: "Attack", 122: "BreakStun",
  131: "Def", 201: "Crit", 211: "CritDam", 231: "PenRatio", 232: "PenValue", 305: "SpRecover",
  312: "ElementMystery", 314: "ElementAbnormalPower", 315: "PhysDmg", 316: "Fire", 317: "Ice",
  318: "Thunder", 319: "DungeonBuffEther", 323: "Wind",
};
const propertyNames: Readonly<Record<string, string>> = {
  "生命值": "HpMax", "攻击力": "Attack", "防御力": "Def", "冲击力": "BreakStun",
  "暴击率": "Crit", "暴击伤害": "CritDam", "穿透率": "PenRatio", "穿透值": "PenValue",
  "异常掌控": "ElementAbnormalPower", "异常精通": "ElementMystery", "能量自动回复": "SpRecover",
  "贯穿力": "SheerForce", "锐暴伤害": "Laceration.svg",
  "闪能自动累积": "AdrenalineAccumulate.svg", "锐能自动累积": "SharpnessAccumulate.svg",
};
const skillNames = ["普攻", "闪避", "支援", "特殊", "连携", "核心"] as const;
const propertyWeightIds: Readonly<Record<string, number>> = {
  "生命值": 11102, "攻击力": 12102, "防御力": 13102, "冲击力": 12202, "暴击率": 20103,
  "暴击伤害": 21103, "异常掌控": 31402, "异常精通": 31203, "穿透率": 23103, "能量自动回复": 30502,
};

async function galleryPortrait(roleId: number, partner: Readonly<Record<string, unknown>>, options: DetailOptions) {
  const known = [partner.name, partner.full_name].filter(name => typeof name === "string" && name.length > 0);
  const names = known.length ? known : await options.atlasNames?.(roleId).catch(() => undefined) ?? [];
  return await loadZzzRandomGalleryPortrait(options.galleryDirectory, names) ??
    loadZzzRandomGalleryPortrait(options.legacyResources, names, true);
}

function propertyImage(stat: PanelStat) {
  const named = Object.hasOwn(propertyNames, stat.name) ? propertyNames[stat.name] : undefined;
  const name = named ?? propertySprites[stat.id ?? 0] ??
    propertySprites[Math.trunc((stat.id ?? 0) / 100)];
  if (name) return `common/images/property/Icon${name.includes(".") ? name : name + ".png"}`;
}

async function loadPanelDetailArt(avatar: ZzzPanelAvatar, model: Detail, options: DetailOptions) {
  const local = await openZzzCardTheme(options);
  const [partners, weapons, suits] = await Promise.all(
    ["PartnerId2Data", "WeaponId2Data", "SuitData"].map(name => readPanelArtMap(options.legacyResources, name)),
  );
  const partner = panelObject(partners?.[avatar.id]);
  const sprite = panelSpriteName(partner.sprite_id);
  const role = sprite && `IconRole${sprite}`;
  const skin = panelSpriteName(panelObject(panelObject(partner.Skin)[model.skinId ?? 0]).Image);
  const portraitPaths = [
    ...(skin && skin !== role ? [`images/hakush/role/${skin}.webp`, `images/nanoka/role/${skin}.webp`, `images/role/${skin}.png`] : []),
    ...(role ? [`images/role/${role}.png`, `images/hakush/role/${role}.webp`, `images/nanoka/role/${role}.webp`] : []),
  ];
  const paths = new Set([
    "common/images/bg.jpg", "panel/images/CurseBG04.png", "panel/images/CurseBG08.png",
    "panel/images/skill_bg.png", "panel/images/weapon_bg.png", "panel/images/BgFrame01.png",
    "panel/images/equip_bg.png", "panel/images/empty_equip_03.png", "panel/images/empty_equip_07.png",
    ...["S", "A", "B"].flatMap(rank => [`common/images/RANK_${rank}.png`, `common/images/Rarity_${rank}.png`]),
    ...Array.from({ length: 6 }, (_, index) => `panel/images/ranks/${index + 1}.png`),
  ]);
  if (model.element) paths.add(`common/images/element/${model.element}.png`);
  if (model.weapon?.star !== undefined) paths.add(`panel/images/star/${model.weapon.star}.png`);
  for (const stat of [...model.properties, ...(model.weapon?.main ?? []), ...(model.weapon?.extra ?? []),
    ...model.discs.flatMap(disc => disc ? [...disc.main, ...disc.extra] : [])]) {
    const path = propertyImage(stat);
    if (path) paths.add(path);
  }
  const [entries, fullPortrait, weapon, discs] = await Promise.all([
    Promise.all([...paths].map(async path => [path, await local(path)] as const)),
    galleryPortrait(avatar.id, partner, options)
      .then(gallery => gallery ?? loadZzzPanelOriginal(options.legacyResources, portraitPaths))
      .then(legacy => legacy ?? loadZzzAtlasPanelOriginal(options.atlasPortrait, avatar.id)),
    cachedPanelWeaponImage(local, weapons?.[model.weapon?.id ?? 0]),
    Promise.all(model.discs.map(item => {
      const disc = panelSpriteName(panelObject(suits?.[item?.suitId ?? 0]).sprite_file);
      if (disc) return firstCachedPanelImage(local, [`images/suit/${disc}.png`, `images/hakush/suit/${disc}.webp`,
        `images/nanoka/suit/${disc}.webp`]);
    })),
  ]);
  const portrait = fullPortrait?.image ?? await local(`images/square_avatar/role_square_avatar_${avatar.id}.png`);
  return { images: new Map(entries), portrait, original: fullPortrait?.original, weapon, discs };
}

function icon(context: Context, image: Image | undefined, x: number, y: number, w: number, h: number) {
  if (image) contain(context, image, x, y, w, h);
}

function skin(context: Context, image: Image | undefined, x: number, y: number, w: number, h: number) {
  if (image) context.drawImage(image, x, y, w, h);
  else fillRound(context, "#222126", x, y, w, h, 12, "#39383e");
}

function title(context: Context, primary: string, english: string, x: number, y: number, w: number) {
  label(context, english, x + w / 2, y - 3, 52, { color: "#ffffff22", align: "center", weight: 800, maxWidth: w });
  label(context, primary, x + w / 2, y + 4, 28, { align: "center", weight: 800 });
}

function rarity(context: Context, images: Images, rank: string | undefined, x: number, y: number, size: number, labelType = "Rarity") {
  if (!rank) return;
  const badge = images.get(`common/images/${labelType}_${rank}.png`);
  if (badge) contain(context, badge, x, y, size, size);
  else label(context, rank, x + size / 2, y + size / 2, 18, { color: gold, align: "center" });
}

function propertyLine(context: Context, images: Images, stat: PanelStat, x: number, y: number, w: number,
  { alt = false, main = false, bonus = false, improvements = false, weight }: {
    alt?: boolean; main?: boolean; bonus?: boolean; improvements?: boolean; weight?: number;
  } = {}) {
  fillRound(context, alt ? "#000b" : "#000e", x, y - 11, w, 22, 10);
  const path = propertyImage(stat);
  if (path) icon(context, images.get(path), x + 5, y - 8, 17, 17);
  const name = main ? stat.name.replace("属性伤害加成", "伤加成").replace("能量自动回复", "能量回复") : stat.name;
  const color = main ? gold : weight === undefined ? "white" : weight >= 1 ? "#f9bd40" :
    weight >= 0.75 ? "#eecf8b" : weight > 0 ? "white" : "#b6b1b9";
  label(context, name, x + 27, y, w > 280 ? 17 : 15, { color, maxWidth: w * 0.49 });
  if (bonus && stat.base !== undefined && stat.added && Number.parseFloat(stat.added) !== 0) {
    const added = stat.added.startsWith("-") || stat.added.startsWith("+") ? stat.added : `+${stat.added}`;
    label(context, `${stat.base} ${added}`, x + w - 93, y, 11, { color: gold, align: "right", maxWidth: 97 });
  }
  if (improvements && stat.enhancements) {
    for (let count = 0; count < stat.enhancements; count++) {
      fillRound(context, gold, x + w - 62 - count * 6, y - 3, 4, 6, 2);
    }
  }
  label(context, stat.value, x + w - 9, y, main ? 18 : 16, { align: "right", maxWidth: w > 280 ? 78 : 52 });
}

function drawDriveDisc(context: Context, art: Awaited<ReturnType<typeof loadPanelDetailArt>>, model: Detail,
  score: Score | undefined, index: number, x: number, y: number) {
  const { images } = art, disc = model.discs[index];
  skin(context, images.get("panel/images/equip_bg.png"), x - 10, y - 5, 276, 207);
  const disk = disc ? art.discs[index] : images.get("panel/images/empty_equip_03.png");
  icon(context, disk, x, y - 10, 58, 58);
  if (disc && !disk) {
    fillRound(context, "#28262a", x + 2, y - 8, 54, 54, 27, "#57545c");
    fillRound(context, "#131216", x + 21, y + 11, 16, 16, 8);
  }
  label(context, String(index + 1), x + 235, y + 23, 24, { color: gold, align: "center" });
  if (!disc) {
    icon(context, images.get("panel/images/empty_equip_07.png"), x + 106, y + 60, 48, 48);
    label(context, "未装备", x + 129, y + 128, 18, { align: "center", color: muted });
    return;
  }
  rarity(context, images, disc.rarity, x + 175, y + 8, 25);
  fillRound(context, "#141317", x + 63, y + 12, 96, 24, 12);
  label(context, disc.level === undefined ? "等级 —" : `等级 ${disc.level}`, x + 111, y + 24, 15, { align: "center" });
  label(context, disc.name, x + 129, y + 52, 21, { align: "center", maxWidth: 245 });
  const scored = score?.discs[index];
  if (scored) {
    label(context, scored.grade, x + 114, y + 75, 20, { color: zzzScoreColors[scored.grade], align: "right", weight: 700 });
    label(context, scored.score.toFixed(2), x + 126, y + 76, 17);
  } else if (score) label(context, "未评分", x + 129, y + 75, 14, { align: "center", color: muted });
  const stats = [...disc.main, ...disc.extra];
  stats.forEach((stat, row) => propertyLine(context, images, stat, x + 7, y + (score ? 98 : 80) + row * 21, 240, {
    alt: row % 2 === 1, main: row < disc.main.length, improvements: row >= disc.main.length,
    weight: score ? score.weights[stat.id ?? 0] ?? 0 : undefined,
  }));
}

function drawScoreSummary(context: Context, score: Score, y: number) {
  const x = 43, width = 754, gradeWidth = 226, cellWidth = (width - gradeWidth) / 3;
  const border = "#707070";
  fillRound(context, "#18171c", x, y, width, 163, 14, border);
  box(context, border, x + gradeWidth, y, 2, 163);
  box(context, border, x, y + 128, width, 2);
  fillRound(context, "#232227", x + 19, y + 24, 75, 75, 17, border);
  label(context, score.grade, x + 56, y + 62, 27, { align: "center", color: zzzScoreColors[score.grade], weight: 700 });
  label(context, `${score.total.toFixed(2)} 分`, x + 106, y + 63, 21, { weight: 700, maxWidth: 109 });
  label(context, `规则：${score.rule}`, x + gradeWidth / 2, y + 147, 18, { align: "center", color: muted, maxWidth: 208 });
  for (let index = 0; index < 9; index++) {
    const column = Math.floor(index / 3), row = index % 3;
    const left = x + gradeWidth + column * cellWidth;
    const top = y + row * 42.66;
    if (column) box(context, border, left, top, 1, 42.66);
    if (row) box(context, border, left, top, cellWidth, 1);
    const stat = score.aggregate[index];
    if (!stat) continue;
    const color = stat.weight >= 1 ? "#f9bd40" : stat.weight >= 0.75 ? "#eecf8b" : stat.weight > 0 ? "#eee" : muted;
    fillRound(context, "#0b0b0d", left + 7, top + 8, 26, 26, 6, border);
    label(context, String(stat.count), left + 20, top + 21, 14, { align: "center", color });
    label(context, stat.name, left + 40, top + 21, 16, { color, maxWidth: 65 });
    label(context, `+${stat.value}`, left + cellWidth - 9, top + 21, 16, { align: "right", color, maxWidth: 67 });
  }
  label(context, `有益词条数：${score.useful}    有效词条数：${score.effective.toFixed(2)}`,
    x + (width + gradeWidth) / 2, y + 147, 18, { align: "center", color: muted, maxWidth: width - gradeWidth - 20 });
}

function drawEngine(context: Context, model: Detail, art: Awaited<ReturnType<typeof loadPanelDetailArt>>, y: number) {
  const { images } = art, weapon = model.weapon;
  skin(context, images.get("panel/images/weapon_bg.png"), 416, y - 8, 419, 165);
  if (!weapon) {
    label(context, "未装备音擎", 641, y + 63, 23, { align: "center", color: muted });
    return;
  }
  if (art.weapon) {
    context.save();
    context.globalAlpha = 0.68;
    contain(context, art.weapon, 662, y + 3, 146, 139);
    context.restore();
  }
  rarity(context, images, weapon.rarity, 459, y + 9, 34);
  label(context, weapon.name, 498, y + 26, 25, { weight: 700, maxWidth: 305 });
  const stars = weapon.star === undefined ? undefined : images.get(`panel/images/star/${weapon.star}.png`);
  if (stars) contain(context, stars, 464, y + 37, 94, 23);
  else if (weapon.star !== undefined) label(context, `改装 ${weapon.star}`, 464, y + 50, 17, { color: gold });
  label(context, weapon.level === undefined ? "Lv. —" : `Lv. ${weapon.level}`, 568, y + 50, 16);
  [...weapon.main, ...weapon.extra].slice(0, 4).forEach((stat, index) =>
    propertyLine(context, images, stat, 456, y + 74 + 22 * index, 225, { main: index < weapon.main.length }));
}

// Layout follows resources/panel/card.html and card.css from ZZZure/ZZZ-Plugin 2057599.
export async function renderZzzPanelDetail(avatar: ZzzPanelAvatar, uid: string,
  options: DetailOptions = {}) {
  const model = buildZzzPanelDetail(avatar);
  const score = buildZzzPanelScore(avatar, model);
  const damage = options.damage && panelDamageSections(options.damage, avatar.name_mi18n, avatar.level, options.profileId ?? 1);
  const art = await loadPanelDetailArt(avatar, model, options);
  options.signal?.throwIfAborted();
  const { images } = art;
  const topHeight = damage ? 722 : 565;
  const scoreHeight = score ? 179 : 0;
  const height = topHeight + (damage ? panelDamageHeight(damage) : 510 + scoreHeight);
  const rendered = await renderPng(width * 2, height * 2, context => {
    context.scale(2, 2);
    box(context, "#1d1b20", 0, 0, width, height);
    const background = images.get("common/images/bg.jpg");
    if (background) cover(context, background, 0, 0, width, height);
    const portrait = art.portrait;
    if (portrait) {
      context.save();
      context.beginPath();
      context.rect(0, 24, 461, damage ? topHeight - 146 : topHeight - 35);
      context.clip();
      const scale = Math.max(461 / portrait.width, (topHeight - 35) / portrait.height);
      const w = portrait.width * scale;
      context.drawImage(portrait, (461 - w) / 2, 24, w, portrait.height * scale);
      context.restore();
    } else label(context, avatar.name_mi18n, 230, 240, 40, { align: "center", color: muted, maxWidth: 400 });

    skin(context, images.get("panel/images/CurseBG08.png"), 12, 13, 217, 47);
    label(context, `UID ${uid}`, 118, 37, 23, { align: "center" });
    if (options.showcase) {
      fillRound(context, "#18171ddb", 22, 65, 170, 30, 11);
      label(context, "Enka 公开展柜", 107, 80, 17, { align: "center", color: gold });
    }
    skin(context, images.get("panel/images/CurseBG04.png"), 404, 18, 436, 71);
    rarity(context, images, avatar.rarity, 441, 26, 34, "RANK");
    if (model.element) icon(context, images.get(`common/images/element/${model.element}.png`), 479, 29, 28, 28);
    label(context, model.name, model.element ? 516 : 485, 44, 27, { weight: 700, maxWidth: model.element ? 302 : 334 });
    fillRound(context, "#0f0e12", 449, 63, 92, 23, 12);
    label(context, `Lv. ${avatar.level}`, 495, 74, 17, { align: "center" });
    for (let rank = 1; rank <= 6; rank++) {
      const x = 545 + 31 * (rank - 1);
      const badge = images.get(`panel/images/ranks/${rank}.png`);
      context.save();
      context.globalAlpha = rank > avatar.rank ? 0.37 : 1;
      if (badge) contain(context, badge, x, 61, 25, 25);
      else label(context, String(rank), x + 13, 74, 16, { color: gold, align: "center" });
      context.restore();
    }

    title(context, "属性", "PROPERTY", 452, 124, 348);
    if (!model.properties.length) label(context, "暂无属性", 623, 221, 20, { color: muted, align: "center" });
    for (const [index, stat] of model.properties.entries()) {
      const id = Object.hasOwn(propertyWeightIds, stat.name) ? propertyWeightIds[stat.name] : (stat.id ?? 0) * 100 + 3;
      propertyLine(context, images, stat, 460, 157 + (damage ? 30 : 22) * index, 353, {
        alt: index % 2 === 1, bonus: true, weight: score?.weights[id ?? 0],
      });
    }
    drawEngine(context, model, art, damage ? 502 : 404);

    const skill = images.get("panel/images/skill_bg.png");
    const skillY = damage ? 581 : 434;
    if (skill) contain(context, skill, 0, skillY, 451, 76);
    else fillRound(context, "#161518", 24, skillY + 25, 413, 40, 12);
    for (const [index, level] of model.skills.entries()) {
      const x = skill ? 46 + index * 60 : 67 + index * 62;
      if (!skill) label(context, skillNames[index]!, x, skillY + 34, 13, { align: "center", color: muted });
      label(context, level === undefined ? "—" : String(level), x, skillY + 56, 17, { align: "center" });
    }

    if (damage) {
      drawPanelDamage(context, damage, topHeight);
    } else {
      frame(context, images.get("panel/images/BgFrame01.png"), 8, topHeight - 20, 824, 481 + scoreHeight);
      title(context, "驱动盘信息", "METAL", 12, topHeight + 16, 816);
      if (score) drawScoreSummary(context, score, topHeight + 43);
      for (let slot = 0; slot < 6; slot++) {
        drawDriveDisc(context, art, model, score, slot, 38 + (slot % 3) * 263, topHeight + scoreHeight + 48 + Math.floor(slot / 3) * 207);
      }
    }
    label(context, zzzCardFooter, width / 2, height - 22, 17, { color: muted, align: "center" });
  }, "gpu");
  return { ...rendered, original: art.original };
}
