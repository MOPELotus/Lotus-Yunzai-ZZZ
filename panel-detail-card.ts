import { basename, join } from "node:path";
import type { ZzzPanelAvatar } from "@lotus-yunzai/hoyo-client";
import { nativeImageRasterScale, renderPng } from "@lotus-yunzai/skia";
import type { CanvasRenderingContext2D as Context, Image } from "skia-canvas";
import { box, cover, drawTag, label, openZzzCardTheme, zzzCardFooter, zzzScoreColors, type ZzzCardOptions } from "./card-theme.ts";
import { contain, fillRound } from "./challenge-card.ts";
import { cachedPanelWeaponImage, firstCachedPanelImage, panelSpriteName, readPanelArtMap } from "./panel-artwork.ts";
import { drawPanelDamage, panelDamageHeight, panelDamageSections } from "./panel-damage-card.ts";
import type { PanelDamage, PanelDamageSummary } from "./panel-damage.ts";
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
  readonly damageSummary?: PanelDamageSummary;
  readonly inlineImageByteLimit?: number;
  readonly profileId?: number;
  readonly atlasPortrait?: ZzzAtlasPortraitReader;
  readonly galleryDirectory?: string;
  readonly syncedGalleryRoot?: () => Promise<string | undefined>;
  readonly retainedGalleryDirectory?: Promise<string | undefined>;
  readonly atlasNames?: (roleId: number) => Promise<readonly string[]>;
};
const width = 840;
const gold = "#f2d267";
const muted = "#a09ca3";
const statBlue = "#4193ed";
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
const attributeElements: Readonly<Record<number, string>> = {
  315: "Physical", 316: "Fire", 317: "Ice", 318: "Electric", 319: "Ether", 323: "Wind",
};

async function galleryPortrait(roleId: number, partner: Readonly<Record<string, unknown>>, options: DetailOptions) {
  const known = [partner.name, partner.full_name].filter(name => typeof name === "string" && name.length > 0);
  const names = known.length ? known : await options.atlasNames?.(roleId).catch(() => undefined) ?? [];
  const local = await loadZzzRandomGalleryPortrait(options.galleryDirectory, names) ??
    await loadZzzRandomGalleryPortrait(options.legacyResources, names, true);
  if (local) return local;
  const synced = await options.syncedGalleryRoot?.();
  return await loadZzzRandomGalleryPortrait(synced && join(synced, "zzz-character"), names, false, synced && basename(synced)) ??
    loadZzzRandomGalleryPortrait(await options.retainedGalleryDirectory, names);
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
    const element = attributeElements[stat.id ?? 0];
    if (element) paths.add(`common/images/element/${element}.png`);
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

type Insets = readonly [top: number, right: number, bottom: number, left: number];

function slicedFrame(context: Context, image: Image | undefined, x: number, y: number, w: number, h: number,
  source: Insets, target: Insets) {
  if (!image) return skin(context, undefined, x, y, w, h);
  const [st, sr, sb, sl] = source;
  const [top, right, bottom, left] = target;
  const sx = [0, sl, image.width - sr, image.width], sy = [0, st, image.height - sb, image.height];
  const dx = [x, x + left, x + w - right, x + w], dy = [y, y + top, y + h - bottom, y + h];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const sw = sx[col + 1]! - sx[col]!, sh = sy[row + 1]! - sy[row]!;
    const dw = dx[col + 1]! - dx[col]!, dh = dy[row + 1]! - dy[row]!;
    if (sw > 0 && sh > 0 && dw > 0 && dh > 0) {
      context.drawImage(image, sx[col]!, sy[row]!, sw, sh, dx[col]!, dy[row]!, dw, dh);
    }
  }
}

function title(context: Context, primary: string, english: string, x: number, y: number, w: number, compact = false) {
  const center = x + w / 2;
  const size = compact ? 23 : 33;
  label(context, english, center, y - 3, size * 1.8, { color: "#ffffff14", align: "center", maxWidth: w });
  label(context, primary, center, y, size, { align: "center" });
  const count = compact ? 5 : 8;
  const gap = compact ? 21 : 30;
  const offset = primary.length * size / 2 + gap * 0.9;
  for (const left of [center - offset - gap * count, center + offset]) {
    for (let index = 0; index < count; index++) {
      context.save();
      context.transform(1, 0, -0.61, 1, left + gap * index, y - size * 0.4);
      box(context, "#f7c736", 0, 0, size * 0.56, size * 0.8);
      context.restore();
    }
  }
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
  fillRound(context, main ? statBlue : alt ? "#000b" : "#000e", x, y - (main ? 16 : 12), w, main ? 32 : 24, 15);
  const path = propertyImage(stat);
  if (path) icon(context, images.get(path), x + 5, y - 8, 17, 17);
  const name = main ? stat.name.replace("属性伤害加成", "伤加成").replace("能量自动回复", "能量回复") : stat.name;
  const color = main ? "white" : weight === undefined ? "white" : weight >= 1 ? "#f9bd40" :
    weight >= 0.75 ? "#eecf8b" : weight > 0 ? "white" : "#b6b1b9";
  label(context, name, x + 30, y, main ? 18 : 16, { color, maxWidth: w * 0.54 });
  if (bonus && stat.base !== undefined && stat.added && Number.parseFloat(stat.added) !== 0) {
    const added = stat.added.startsWith("-") || stat.added.startsWith("+") ? stat.added : `+${stat.added}`;
    label(context, `${stat.base} ${added}`, x + w - 93, y, 11, { color: gold, align: "right", maxWidth: 97 });
  }
  if (improvements && stat.enhancements) {
    for (let count = 0; count < stat.enhancements; count++) {
      label(context, "›", x + w - 81 - count * 5, y, 17, { color: "white", align: "center" });
    }
  }
  label(context, stat.value, x + w - 10, y, main ? 23 : 17, {
    color: improvements ? "#f9bd40" : "white", align: "right", maxWidth: 71,
  });
}

function hasDelta(stat: PanelStat) {
  return stat.base !== undefined && !!stat.added && Number.parseFloat(stat.added) !== 0;
}

function drawPanelProperties(context: Context, model: Detail, images: Images, score?: Score) {
  const x = 462, w = width - x;
  let y = 149;
  const rowSizes = model.properties.map(stat => hasDelta(stat) ? 37.7 : 32.3);
  const end = y + rowSizes.reduce((sum, size) => sum + size + 5.76, 0);
  box(context, "#262626", x, 102, w, Math.max(100, end - 102));
  box(context, "#000", x, 102, 3, Math.max(100, end - 102));
  title(context, "属性", "PROPERTY", x + 4, 132, w - 6, true);
  if (!model.properties.length) label(context, "暂无属性", x + w / 2, y + 26, 20, { color: muted, align: "center" });
  for (const [index, stat] of model.properties.entries()) {
    const height = rowSizes[index]!;
    const middle = y + height / 2;
    if (index % 2 === 0) box(context, "#dde0dd40", x + 3, y, w - 3, height);
    const element = attributeElements[stat.id ?? 0];
    const path = element ? `common/images/element/${element}.png` : propertyImage(stat);
    if (path) icon(context, images.get(path), x + 14, middle - 14, 28, 28);
    const id = Object.hasOwn(propertyWeightIds, stat.name) ? propertyWeightIds[stat.name] : (stat.id ?? 0) * 100 + 3;
    const weight = score?.weights[id ?? 0] ?? 0;
    const color = weight >= 1 ? "#f7c736" : weight >= 0.75 ? statBlue : weight > 0 ? "#e9e9e9" : "#a6a6a6";
    label(context, stat.name, x + 57, middle, 18.7, { color, maxWidth: 132 });
    if (hasDelta(stat)) {
      const added = stat.added!;
      context.font = '15.84px "Noto Sans CJK SC", sans-serif';
      context.textAlign = "right";
      context.textBaseline = "middle";
      context.fillStyle = "#b6b6b6";
      context.fillText(stat.base!, width - 112, middle - 9, 86);
      context.fillStyle = "#60c97c";
      context.fillText(/^[+-]/u.test(added) ? added : `+${added}`, width - 112, middle + 9, 86);
    }
    label(context, stat.value, width - 14, middle, 23, { align: "right", maxWidth: 90 });
    y += height + 5.76;
  }
}

function drawDriveDisc(context: Context, art: Awaited<ReturnType<typeof loadPanelDetailArt>>, model: Detail,
  score: Score | undefined, index: number, x: number, y: number, height: number) {
  const { images } = art, disc = model.discs[index];
  label(context, String(index + 1).padStart(2, "0"), x + 117, y - 13, 48, { align: "center" });
  slicedFrame(context, images.get("panel/images/equip_bg.png"), x - 36, y - 43, 307, height + 86,
    [190, 90, 110, 170], [136.8, 64.8, 79.2, 122.4]);
  const disk = disc ? art.discs[index] : images.get("panel/images/empty_equip_03.png");
  icon(context, disk, x - 22, y - 29, 65, 65);
  if (disc && !disk) {
    fillRound(context, "#28262a", x + 2, y - 8, 54, 54, 27, "#57545c");
    fillRound(context, "#131216", x + 21, y + 11, 16, 16, 8);
  }
  if (!disc) {
    icon(context, images.get("panel/images/empty_equip_07.png"), x + 87, y + height / 2 - 30, 60, 60);
    return;
  }
  rarity(context, images, disc.rarity, x + 184, y + 7, 42);
  fillRound(context, "#000", x + 53, y + 13, 125, 29, 16);
  label(context, disc.level === undefined ? "等级—" : `等级${disc.level}`, x + 116, y + 28, 18, { align: "center" });
  label(context, disc.name, x + 117, y + 67, 24, { align: "center", maxWidth: 224 });
  const scored = score?.discs[index];
  if (scored) {
    label(context, scored.grade, x + 105, y + 94, 22, { color: zzzScoreColors[scored.grade], align: "right" });
    label(context, scored.score.toFixed(2), x + 114, y + 95, 19, { color: "#c2c2c2" });
  } else if (score) label(context, "未评分", x + 117, y + 95, 16, { align: "center", color: muted });
  const stats = [...disc.main, ...disc.extra];
  stats.forEach((stat, row) => propertyLine(context, images, stat, x + 12, y + (score ? 127 : 102) + row * 29, 211, {
    alt: row % 2 === 1, main: row < disc.main.length, improvements: row >= disc.main.length,
    weight: score ? score.weights[stat.id ?? 0] ?? 0 : undefined,
  }));
}

function drawScoreSummary(context: Context, score: Score, y: number) {
  const x = 43, width = 754, gradeWidth = 226, cellWidth = (width - gradeWidth) / 3;
  const border = "#707070";
  fillRound(context, "#20202072", x, y, width, 180, 14, border);
  box(context, border, x + gradeWidth, y, 3, 180);
  box(context, border, x, y + 142, width, 2);
  fillRound(context, "#24242491", x + 24, y + 31, 79, 79, 19, border);
  label(context, score.grade, x + 63, y + 71, 28, { align: "center", color: zzzScoreColors[score.grade] });
  fillRound(context, "#1118", x + 104, y + 48, 108, 44, 7, border);
  label(context, `${score.total.toFixed(2)} 分`, x + 110, y + 70, 22, { maxWidth: 99, ellipsis: false });
  label(context, `规则：${score.rule}`, x + gradeWidth / 2, y + 163, 19, { align: "center", color: "#aaa", maxWidth: 208 });
  for (let index = 0; index < 9; index++) {
    const column = Math.floor(index / 3), row = index % 3;
    const left = x + gradeWidth + column * cellWidth;
    const top = y + row * 47.33;
    if (column) box(context, border, left, top, 1, 47.33);
    if (row) box(context, border, left, top, cellWidth, 1);
    const stat = score.aggregate[index];
    if (!stat) continue;
    const color = stat.weight >= 1 ? "#f9bd40" : stat.weight >= 0.75 ? "#eecf8b" : stat.weight > 0 ? "#eee" : muted;
    fillRound(context, "#0b0b0d", left + 7, top + 8, 26, 26, 6, border);
    label(context, String(stat.count), left + 20, top + 21, 14, { align: "center", color });
    label(context, stat.name, left + 40, top + 21, 16, { color, maxWidth: 65 });
    label(context, `+${stat.value}`, left + cellWidth - 9, top + 21, 16, { align: "right", color, maxWidth: 67 });
  }
  label(context, `有益词条数：${score.useful} 有效词条数：${score.effective.toFixed(2)}`,
    x + (width + gradeWidth) / 2, y + 163, 19, { align: "center", color: "#aaa", maxWidth: width - gradeWidth - 20 });
}

function drawOriginalEngine(context: Context, model: Detail, art: Awaited<ReturnType<typeof loadPanelDetailArt>>,
  y: number, height: number) {
  const { images } = art, weapon = model.weapon;
  slicedFrame(context, images.get("panel/images/weapon_bg.png"), 405, y, 435, height,
    [118, 0, 68, 43], [103.7, 0, 62.2, 39.2]);
  if (!weapon) return;
  if (art.weapon) contain(context, art.weapon, width + 23 - height * 0.7, y + 27.6, height * 0.7, height * 0.7);
  rarity(context, images, weapon.rarity, 433, y + 46, 55);
  label(context, weapon.name, 502, y + 75, 27.65, { maxWidth: 295 });
  const stars = weapon.star === undefined ? undefined : images.get(`panel/images/star/${weapon.star}.png`);
  if (stars) cover(context, stars, 433, y + 102, 121.65, 33);
  else if (weapon.star !== undefined) label(context, `改装 ${weapon.star}`, 433, y + 118, 19, { color: gold });
  drawTag(context, "#f3cb45", 563, y + 105, 73, 27, 4);
  label(context, weapon.level === undefined ? "Lv.—" : `Lv.${weapon.level}`, 599.5, y + 118, 20, {
    color: "#2b2628", align: "center",
  });
  [...weapon.main, ...weapon.extra].forEach((stat, index) =>
    propertyLine(context, images, stat, 433, y + 157 + 41.7 * index, 213, { main: index < weapon.main.length }));
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

function inlineDamageTables(summary: PanelDamageSummary, name: string, level: number, profile: number) {
  const amount = (value: number) => !Number.isFinite(value) ? "—" : value < 2 ? `${Math.round(value * 100)}%` :
    Number.isInteger(value) ? String(value) : value.toFixed(2);
  const skillCommand = `%${name}伤害1${profile === 1 ? "" : ` 档案${profile}`}`;
  return [
    ...(summary.buffs.length ? [{
      rows: [["%", "增益名称", "增益类型", "增益数值"], ...summary.buffs.map(buff =>
        ["-", buff.name, buff.type, amount(buff.value) + (buff.max ? `/${amount(buff.max)}` : "")])], notes: [],
    }] : []),
    ...(summary.skills.length ? [{
      rows: [["%", "技能类型", "暴击伤害", "期望伤害"], ...summary.skills.map(({ skill, result }, index) =>
        [String(index + 1), skill.name, ...(result.critDMG === 0 ? [] : [result.critDMG.toFixed(0)]),
          result.expectDMG.toFixed(0)])],
      notes: [`取有弱点、等级${level}、1级基础防御力50的敌方数据，不含失衡易伤区。`,
        `发送 ${skillCommand} 查看指定技能的伤害详情。`,
        ...summary.unavailableSkills.map(skill => `${skill}暂无原版计算结果。`)],
    }] : []),
  ];
}

type InlineDamageTable = ReturnType<typeof inlineDamageTables>[number];
const inlineHeaderHeight = 60.8;
const inlineRowHeight = 54.6;

function inlineTableHeight({ rows, notes }: InlineDamageTable) {
  return inlineHeaderHeight + inlineRowHeight * (rows.length - 1) + (notes.length ? 28 * notes.length + 11.5 : 0);
}

function drawInlineDamage(context: Context, tables: readonly InlineDamageTable[], gridBottom: number) {
  title(context, "伤害统计", "DAMAGE", 0, gridBottom + 55, width);
  let y = gridBottom + 107;
  for (const table of tables) {
    const x = 29, w = width - x * 2, height = inlineTableHeight(table);
    fillRound(context, "#151419bf", x, y, w, height, 12, "#ffffff33");
    for (const [index, cells] of table.rows.entries()) {
      const rowHeight = index ? inlineRowHeight : inlineHeaderHeight;
      const top = index ? y + inlineHeaderHeight + (index - 1) * inlineRowHeight : y;
      if (index % 2) box(context, "#ffffff1f", x, top, w, rowHeight);
      if (index) box(context, "#ffffff33", x, top, w, 1);
      const widths = cells.length === 3 ? [51, 365, 366] : [51, 365, 183, 183];
      let left = x;
      for (const [column, cell] of cells.entries()) {
        const cellWidth = widths[column]!;
        if (column) box(context, "#ffffff22", left, top, 1, rowHeight);
        if (index && column === 1) box(context, "#0003", left, top, cellWidth, rowHeight);
        label(context, cell, left + cellWidth / 2, top + rowHeight / 2, 21,
          { align: "center", color: !index || column === 1 ? "#cebe95" : "white", maxWidth: cellWidth - 10 });
        left += cellWidth;
      }
    }
    const notesY = y + inlineHeaderHeight + (table.rows.length - 1) * inlineRowHeight;
    table.notes.forEach((note, index) =>
      label(context, note, width / 2, notesY + 18 + index * 28, 18,
        { align: "center", color: "#bbb", maxWidth: w - 14 }));
    y += height + 24;
  }
}

// Layout follows resources/panel/card.html and card.css from ZZZure/ZZZ-Plugin 2057599.
export async function renderZzzPanelDetail(avatar: ZzzPanelAvatar, uid: string,
  options: DetailOptions = {}) {
  const model = buildZzzPanelDetail(avatar);
  const score = buildZzzPanelScore(avatar, model);
  const damage = options.damage && panelDamageSections(options.damage, avatar.name_mi18n, avatar.level, options.profileId ?? 1);
  const inlineDamage = options.damageSummary ? inlineDamageTables(options.damageSummary, avatar.name_mi18n,
    avatar.level, options.profileId ?? 1) : [];
  const art = await loadPanelDetailArt(avatar, model, options);
  options.signal?.throwIfAborted();
  const { images } = art;
  // The 840px source CSS flows from the actual property list into the W-Engine and disc grid.
  const propertyBottom = Math.max(202, 149 + model.properties.reduce((sum, stat) =>
    sum + (hasDelta(stat) ? 37.7 : 32.3) + 5.76, 0));
  const weaponY = propertyBottom - 18.4;
  const weaponHeight = model.weapon ? 216 + (model.weapon.main.length + model.weapon.extra.length) * 41.7 : 120;
  const topHeight = damage ? 722 : weaponY + weaponHeight;
  const otherY = topHeight - 22;
  const firstDiscY = otherY + (score ? 295 : 115);
  const discHeights = [0, 3].map(offset => Math.max(240, ...model.discs.slice(offset, offset + 3).map(disc =>
    disc ? (score ? 156 : 131) + Math.max(0, disc.main.length + disc.extra.length - 1) * 29 + 29 : 0)));
  const gridBottom = firstDiscY + discHeights[0]! + 55 + discHeights[1]!;
  const inlineHeight = inlineDamage.length ? 83 + inlineDamage.reduce((sum, table) => sum + inlineTableHeight(table) + 24, 0) : 0;
  const height = Math.ceil(damage ? topHeight + panelDamageHeight(damage) : gridBottom + 80 + inlineHeight);
  const standard = nativeImageRasterScale() === 4;
  const render = (scale: 2 | 4) => renderPng(width * scale, height * scale, context => {
    context.scale(scale, scale);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    box(context, "#1d1b20", 0, 0, width, height);
    const background = images.get("common/images/bg.jpg");
    if (background) cover(context, background, 0, 0, width, height);
    const portrait = art.portrait;
    if (portrait) {
      context.save();
      context.beginPath();
      const portraitY = damage ? 24 : 43.2;
      const portraitHeight = damage ? topHeight - 35 : topHeight - 19.2;
      context.rect(0, portraitY, 462, (damage ? topHeight - 122 : topHeight) - portraitY);
      context.clip();
      const scale = Math.max(462 / portrait.width, portraitHeight / portrait.height);
      const w = portrait.width * scale;
      context.drawImage(portrait, (462 - w) / 2, portraitY, w, portrait.height * scale);
      context.restore();
    } else label(context, avatar.name_mi18n, 230, 240, 40, { align: "center", color: muted, maxWidth: 400 });

    const uidLabel = `UID ${uid}`;
    context.font = '24px "LotusZzzRecordHongmeng", "Noto Sans CJK SC", sans-serif';
    const uidWidth = context.measureText(uidLabel).width + 57.6;
    slicedFrame(context, images.get("panel/images/CurseBG08.png"), 12, 12, uidWidth, 56,
      [30, 60, 30, 60], [12, 24, 12, 24]);
    label(context, uidLabel, 12 + uidWidth / 2, 40, 24, { align: "center" });
    if (options.showcase) {
      fillRound(context, "#18171ddb", 22, 65, 170, 30, 11);
      label(context, "Enka 公开展柜", 107, 80, 17, { align: "center", color: gold });
    }
    skin(context, images.get("panel/images/CurseBG04.png"), 386, 19, 529, 83);
    rarity(context, images, avatar.rarity, 417, 30, 35, "RANK");
    if (model.element) icon(context, images.get(`common/images/element/${model.element}.png`), 455, 32, 29, 29);
    label(context, model.name, model.element ? 491 : 455, 47, 28.8, { maxWidth: model.element ? 330 : 365 });
    label(context, `Lv.${avatar.level}`, 419, 81, 20.16);
    for (let rank = 1; rank <= 6; rank++) {
      const x = 503 + 26 * (rank - 1);
      const badge = images.get(`panel/images/ranks/${rank}.png`);
      context.save();
      context.globalAlpha = rank > avatar.rank ? 0.4 : 1;
      if (badge) contain(context, badge, x, 69, 24.2, 24.2);
      else label(context, String(rank), x + 12, 81, 16, { color: gold, align: "center" });
      context.restore();
    }

    if (damage) {
      title(context, "属性", "PROPERTY", 452, 124, 348, true);
      for (const [index, stat] of model.properties.entries()) {
        propertyLine(context, images, stat, 460, 157 + 30 * index, 353, { alt: index % 2 === 1, bonus: true });
      }
      drawEngine(context, model, art, 502);
    } else {
      drawPanelProperties(context, model, images, score);
      drawOriginalEngine(context, model, art, weaponY, weaponHeight);
    }

    const skill = images.get("panel/images/skill_bg.png");
    const skillY = damage ? 581 : topHeight - 156;
    if (skill) contain(context, skill, damage ? 0 : -54, skillY, damage ? 451 : 554, damage ? 76 : 84);
    else fillRound(context, "#161518", 24, skillY + 25, 413, 40, 12);
    for (const [index, level] of model.skills.entries()) {
      const x = skill ? (damage ? 46 + index * 60 : 23 + index * 66.7) : 67 + index * 62;
      if (!skill) label(context, skillNames[index]!, x, skillY + 34, 13, { align: "center", color: muted });
      label(context, level === undefined ? "—" : String(level), x, skillY + (damage ? 56 : 64), damage ? 17 : 24, { align: "center" });
    }

    if (damage) {
      drawPanelDamage(context, damage, topHeight);
    } else {
      slicedFrame(context, images.get("panel/images/BgFrame01.png"), -67.2, otherY - 48, 931.2, height - otherY + 64.8,
        [200, 100, 70, 280], [48, 24, 16.8, 67.2]);
      title(context, "驱动盘信息", "METAL", 0, otherY + 24, width);
      if (score) drawScoreSummary(context, score, otherY + 60);
      for (let slot = 0; slot < 6; slot++) {
        const row = slot < 3 ? 0 : 1;
        drawDriveDisc(context, art, model, score, slot, 43.2 + (slot % 3) * 259.2,
          firstDiscY + (row ? discHeights[0]! + 55 : 0), discHeights[row]!);
      }
      if (inlineDamage.length) drawInlineDamage(context, inlineDamage, gridBottom);
    }
    label(context, zzzCardFooter, width / 2, height - 22, 17, { color: muted, align: "center" });
  }, "gpu", { allowHalfScale: standard && scale === 4 });
  let rendered = await render(4);
  if (options.inlineImageByteLimit !== undefined && rendered.png.byteLength > options.inlineImageByteLimit) {
    if (standard && !rendered.reducedScaleReason) rendered = await render(2);
    if (rendered.png.byteLength > options.inlineImageByteLimit) throw new Error("绝区零面板超过当前会话的图片大小上限。");
  }
  return { ...rendered, original: art.original };
}
