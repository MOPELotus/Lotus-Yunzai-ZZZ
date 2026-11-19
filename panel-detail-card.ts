import { readdir, realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import type { ZzzPanelAvatar } from "@lotus-yunzai/hoyo-client";
import { renderPng } from "@lotus-yunzai/skia";
import type { CanvasRenderingContext2D as Context, Image } from "skia-canvas";
import { box, cover, label, openZzzCardTheme, zzzCardFooter, type ZzzCardOptions } from "./card-theme.ts";
import { contain, fillRound, frame } from "./challenge-card.ts";
import { buildZzzPanelDetail, panelObject, type PanelStat } from "./panel-detail.ts";
import { readPanelJson } from "./panel-storage.ts";

type Local = Awaited<ReturnType<typeof openZzzCardTheme>>;
type Detail = ReturnType<typeof buildZzzPanelDetail>;
type Images = ReadonlyMap<string, Image | undefined>;
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
const skillNames = ["普攻", "支援", "连携", "闪避", "特殊", "核心"] as const;

function sprite(value: unknown) {
  if (typeof value === "string" && /^[A-Za-z0-9_]{1,80}$/u.test(value)) return value;
}

async function firstImage(local: Local, paths: readonly string[]) {
  for (const path of paths) {
    const image = await local(path);
    if (image) return image;
  }
}

async function customPortrait(root: string | undefined, names: readonly unknown[], local: Local) {
  if (!root) return;
  const actual = await realpath(root).catch(() => undefined);
  if (!actual) return;
  for (const name of new Set(names)) {
    if (typeof name !== "string" || !name || name === "." || name === ".." || /[/\\\p{Cc}\p{Cf}]/u.test(name)) continue;
    const path = `images/panel/${name}`;
    const directory = await realpath(join(actual, path)).catch(() => undefined);
    if (!directory?.startsWith(join(actual, "images", "panel") + sep)) continue;
    const files = (await readdir(directory, { withFileTypes: true }).catch(() => []))
      .filter(file => file.isFile() && /\.(?:png|jpe?g|webp)$/iu.test(file.name));
    if (!files.length) continue;
    const selected = files[Math.floor(Math.random() * files.length)]!;
    const image = await local(`${path}/${selected.name}`);
    if (image) return image;
  }
}

function propertyImage(stat: PanelStat) {
  const named = Object.hasOwn(propertyNames, stat.name) ? propertyNames[stat.name] : undefined;
  const name = named ?? propertySprites[stat.id ?? 0] ??
    propertySprites[Math.trunc((stat.id ?? 0) / 100)];
  if (name) return `common/images/property/Icon${name.includes(".") ? name : name + ".png"}`;
}

async function loadPanelDetailArt(avatar: ZzzPanelAvatar, model: Detail, options: ZzzCardOptions) {
  const local = await openZzzCardTheme(options);
  async function map(name: string) {
    const root = options.legacyResources;
    return panelObject(root ? await readPanelJson(root, `map/${name}.json`, 8 * 1024 * 1024).catch(() => undefined) : undefined);
  }
  const [partners, weapons, suits] = await Promise.all([map("PartnerId2Data"), map("WeaponId2Data"), map("SuitData")]);
  const partner = panelObject(partners[avatar.id]);
  const role = sprite(partner.sprite_id);
  const skin = sprite(panelObject(panelObject(partner.Skin)[model.skinId ?? 0]).Image);
  const portraitPaths = [
    ...(skin ? [`images/hakush/role/${skin}.webp`, `images/nanoka/role/${skin}.webp`] : []),
    ...(role ? [`images/role/IconRole${role}.png`, `images/hakush/role/IconRole${role}.webp`,
      `images/nanoka/role/IconRole${role}.webp`] : []),
    `images/square_avatar/role_square_avatar_${avatar.id}.png`,
  ];
  const engine = sprite(panelObject(weapons[model.weapon?.id ?? 0]).CodeName);
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
  const [entries, portrait, weapon, discs] = await Promise.all([
    Promise.all([...paths].map(async path => [path, await local(path)] as const)),
    customPortrait(options.legacyResources, [avatar.name_mi18n, avatar.full_name_mi18n, partner.name, partner.full_name], local)
      .then(custom => custom ?? firstImage(local, portraitPaths)),
    engine ? firstImage(local, [`images/weapon/${engine}_High.png`, `images/hakush/weapon/${engine}.webp`,
      `images/nanoka/weapon/${engine}.webp`]) : undefined,
    Promise.all(model.discs.map(item => {
      const disc = sprite(panelObject(suits[item?.suitId ?? 0]).sprite_file);
      if (disc) return firstImage(local, [`images/suit/${disc}.png`, `images/hakush/suit/${disc}.webp`,
        `images/nanoka/suit/${disc}.webp`]);
    })),
  ]);
  return { images: new Map(entries), portrait, weapon, discs };
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
  { alt = false, main = false, bonus = false, improvements = false } = {}) {
  fillRound(context, alt ? "#000b" : "#000e", x, y - 11, w, 22, 10);
  const path = propertyImage(stat);
  if (path) icon(context, images.get(path), x + 5, y - 8, 17, 17);
  const name = main ? stat.name.replace("属性伤害加成", "伤加成").replace("能量自动回复", "能量回复") : stat.name;
  label(context, name, x + 27, y, w > 280 ? 17 : 15, { color: main ? gold : "white", maxWidth: w * 0.49 });
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
  index: number, x: number, y: number) {
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
  const stats = [...disc.main, ...disc.extra];
  stats.forEach((stat, row) => propertyLine(context, images, stat, x + 7, y + 80 + row * 22, 240, {
    alt: row % 2 === 1, main: row < disc.main.length, improvements: row >= disc.main.length,
  }));
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
export async function renderZzzPanelDetail(avatar: ZzzPanelAvatar, uid: string, options: ZzzCardOptions = {}) {
  const model = buildZzzPanelDetail(avatar);
  const art = await loadPanelDetailArt(avatar, model, options);
  options.signal?.throwIfAborted();
  const { images } = art;
  const topHeight = 565;
  const height = topHeight + 510;
  return renderPng(width * 2, height * 2, context => {
    context.scale(2, 2);
    box(context, "#1d1b20", 0, 0, width, height);
    const background = images.get("common/images/bg.jpg");
    if (background) cover(context, background, 0, 0, width, height);
    const portrait = art.portrait;
    if (portrait) {
      context.save();
      context.beginPath();
      context.rect(0, 24, 461, topHeight - 35);
      context.clip();
      const scale = Math.max(461 / portrait.width, (topHeight - 35) / portrait.height);
      const w = portrait.width * scale;
      context.drawImage(portrait, (461 - w) / 2, 24, w, portrait.height * scale);
      context.restore();
    } else label(context, avatar.name_mi18n, 230, 240, 40, { align: "center", color: muted, maxWidth: 400 });

    skin(context, images.get("panel/images/CurseBG08.png"), 12, 13, 217, 47);
    label(context, `UID ${uid}`, 118, 37, 23, { align: "center" });
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
      propertyLine(context, images, stat, 460, 157 + 22 * index, 353, { alt: index % 2 === 1, bonus: true });
    }
    drawEngine(context, model, art, 404);

    const skill = images.get("panel/images/skill_bg.png");
    if (skill) contain(context, skill, 0, 434, 451, 76);
    else fillRound(context, "#161518", 24, 459, 413, 40, 12);
    for (const [index, level] of model.skills.entries()) {
      const x = skill ? 46 + index * 60 : 67 + index * 62;
      if (!skill) label(context, skillNames[index]!, x, 468, 13, { align: "center", color: muted });
      label(context, level === undefined ? "—" : String(level), x, 490, 17, { align: "center" });
    }

    frame(context, images.get("panel/images/BgFrame01.png"), 8, topHeight - 20, 824, 481);
    title(context, "驱动盘信息", "METAL", 12, topHeight + 16, 816);
    for (let slot = 0; slot < 6; slot++) {
      drawDriveDisc(context, art, model, slot, 38 + (slot % 3) * 263, topHeight + 48 + Math.floor(slot / 3) * 207);
    }
    label(context, zzzCardFooter, width / 2, height - 22, 17, { color: muted, align: "center" });
  }, "gpu");
}
