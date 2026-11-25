import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import type { GameRole } from "@lotus-yunzai/account";
import type { ZzzHollowChallenge, ZzzHollowProgress, ZzzHollowSnapshot, ZzzShiyuPortrait } from "@lotus-yunzai/hoyo-client";
import type { CanvasRenderingContext2D as Context, Image } from "skia-canvas";
import { artwork, box, cover, drawZzzCardPlayer, label, loadZzzCardPlayer, openZzzCardTheme, zzzCardFooter,
  type ZzzCardOptions } from "./card-theme.ts";
import { contain, drawPortrait, fillRound, loadChallengePortrait, renderZzzBattlePng, type ZzzChallengeArt } from "./challenge-card.ts";
import { fetchZzzOfficialArtwork } from "./tuning-artwork.ts";

const width = 840;
const start = 229;
const talentIcon = "https://act-webstatic.mihoyo.com/darkmatter/nap/prod_gf_cn/item_icon_uc45id/3ae6457d965f876adb61a1bdfb2384b8.png";
const collectionNames = {
  withered: [$t("hollow-zero-card.text_c4d2b6ba33"), $t("hollow-zero-card.text_67993a8cad"), $t("hollow-zero-card.text_0999acf598"), $t("hollow-zero-card.text_3cbda1f9dc"), $t("hollow-zero-card.text_2c11232e16")],
  lost: [$t("hollow-zero-card.text_ab5cd65cb6"), $t("hollow-zero-card.text_266427d0b7"), $t("hollow-zero-card.text_b062420b77"), $t("hollow-zero-card.text_3cbda1f9dc"), $t("hollow-zero-card.text_2c11232e16"), $t("hollow-zero-card.text_7e4f5dd200"), $t("hollow-zero-card.text_1fc7e0527b")],
};
export const zzzHollowTitles = { withered: $t("hollow-zero-card.text_e865364b94"), lost: $t("hollow-zero-card.text_fc57224a51") } as const;
type Row = readonly [label: string, value: string, icon?: string];
type Section = { readonly title: string; readonly rows: readonly Row[] };

function duration(seconds?: number) {
  if (seconds === undefined) return "—";
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, "0")).join(":");
}

function progress(value?: ZzzHollowProgress) {
  return `${value?.current ?? "—"} / ${value?.maximum ?? "—"}`;
}

function challenge(data?: ZzzHollowChallenge): readonly Row[] {
  return [
    [$t("hollow-zero-card.text_296e43e755"), $t("hollow-zero-card.text_c438f4deb2", { "value1": data?.name || "—", "value2": data?.heat ?? "—" })],
    [$t("hollow-zero-card.text_76e4d3ade7"), String(data?.count ?? "—")],
    [$t("hollow-zero-card.text_7b38d6db69"), duration(data?.seconds)],
  ];
}

function sections(snapshot: ZzzHollowSnapshot): Section[] {
  const license: Row = [$t("hollow-zero-card.text_adb3e21f4f"), progress(snapshot.license), snapshot.license?.icon];
  const basic: Section = { title: "", rows: snapshot.hollowMode === "withered" ?
    [license, [$t("hollow-zero-card.text_662048e98b"), progress(snapshot.talent), talentIcon]] :
    [license, [$t("hollow-zero-card.text_d974ddea26"), progress(snapshot.duty)], [$t("hollow-zero-card.text_4fc1daa882"), progress(snapshot.task)]] };
  const collection: Section = { title: $t("hollow-zero-card.text_9fe5d5a19e"), rows: collectionNames[snapshot.hollowMode]
    .map((name, index) => [name, progress(snapshot.collection[index])] as const) };
  if (snapshot.hollowMode === "withered") return [basic, collection, { title: $t("hollow-zero-card.text_24ec01f42b"), rows: [
    [$t("hollow-zero-card.text_127d116c3e"), duration(snapshot.throne?.seconds)],
    [$t("hollow-zero-card.text_b8feeec1ee"), String(snapshot.throne?.damage ?? snapshot.maxDamage ?? "—")],
  ] }];
  return [basic, collection, { title: $t("hollow-zero-card.text_46c327c914"), rows: challenge(snapshot.matrix) },
    { title: $t("hollow-zero-card.text_c2f77bfcc7"), rows: challenge(snapshot.taskForce) },
    ...(snapshot.specialMission?.seconds === undefined ? [] : [
      { title: $t("hollow-zero-card.text_63904a0cad"), rows: [[$t("hollow-zero-card.text_020043149d"), duration(snapshot.specialMission.seconds)]] } satisfies Section,
    ])];
}

export function zzzHollowText(snapshot: ZzzHollowSnapshot) {
  const groups = sections(snapshot).map(section =>
    [section.title, ...section.rows.map(([name, value]) => `${name} ${value}`)].filter(Boolean).join("\n"));
  if (snapshot.hollowMode === "withered" && snapshot.throne) {
    const team = [...snapshot.throne.avatars, snapshot.throne.buddy].flatMap(entry => entry ? [
      `${entry.name ?? (entry === snapshot.throne?.buddy ? $t("hollow-zero-card.text_aa46a7c35b") : $t("hollow-zero-card.text_5aea7d747f"))} · Lv.${entry.level ?? "—"}${entry.damageRate ? ` · ${entry.damageRate}%` : ""}`,
    ] : []);
    if (team.length) groups.push([$t("hollow-zero-card.text_d626448021"), ...team].join("\n"));
  }
  return [zzzHollowTitles[snapshot.hollowMode], ...groups].join("\n\n");
}

export async function renderZzzHollowZero(snapshot: ZzzHollowSnapshot, role: GameRole, options: ZzzCardOptions = {}) {
  const local = await openZzzCardTheme(options);
  const groups = sections(snapshot);
  const throne = snapshot.hollowMode === "withered" ? snapshot.throne : undefined;
  const portraits = new Map<ZzzShiyuPortrait, Image | undefined>();
  const official = (url: string) => artwork(fetchZzzOfficialArtwork(url, options.signal));
  const sources = ["S", "A", "B"].map(rarity => `common/images/RANK_${rarity}.png`);
  const [background, player, badges, basicIcons] = await Promise.all([
    local("common/images/bg.jpg"), loadZzzCardPlayer(local, options, role.avatar),
    Promise.all(sources.map(async path => [path, await local(path)] as const)),
    Promise.all(groups[0]!.rows.map(row => row[2] ? official(row[2]) : undefined)),
    Promise.all([...(throne?.avatars ?? []).map(entry => loadChallengePortrait(entry, false, local, official, portraits)),
      loadChallengePortrait(throne?.buddy, true, local, official, portraits)]),
  ]);
  const art: ZzzChallengeArt = { local: new Map(badges), portraits };
  options.signal?.throwIfAborted();
  const teamHeight = throne ? 234 : 0;
  const groupHeights = groups.map((group, i) => i === 0 && snapshot.hollowMode === "withered" ? 143 :
    69 + group.rows.length * 55 + (group.title === "刀耕火焚" ? teamHeight : 0));
  const height = start + groupHeights.reduce((sum, h) => sum + h + 20, 0) + 49;
  return renderZzzBattlePng(width, height, context => {
    box(context, "#1d1a24", 0, 0, width, height);
    if (background) cover(context, background, 0, 0, width, height);
    drawZzzCardPlayer(context, role, snapshot.region, player);
    title(context, zzzHollowTitles[snapshot.hollowMode], width / 2, 184, 44, "center");
    let y = start;
    for (const [i, group] of groups.entries()) {
      const h = groupHeights[i]!;
      fillRound(context, "#0009", 29, y, 782, h, 20, "#444");
      if (!group.title && snapshot.hollowMode === "withered") {
        for (const [j, [name, value]] of group.rows.entries()) {
          const x = 52 + j * 370;
          fillRound(context, "#0006", x, y + 21, 357, 100, 15);
          label(context, name, x + 21, y + 50, 23, { color: "#e6e6e6" });
          title(context, value, x + 21, y + 88, 29);
          const icon = basicIcons[j];
          if (icon) contain(context, icon, x + 257, y + 35, 77, 72);
        }
      } else {
        if (group.title) title(context, group.title, 58, y + 38, 29);
        const offset = group.title ? 78 : 61;
        for (const [j, [name, value]] of group.rows.entries()) {
          const row = y + offset + j * 55;
          const icon = !group.title && basicIcons[j];
          if (icon) contain(context, icon, 60, row - 17, 34, 34);
          label(context, name, icon ? 105 : 64, row, 23, { color: "#979797" });
          title(context, value, 778, row, 25, "right", 455);
        }
        if (group.title === "刀耕火焚" && throne) {
          fillRound(context, "#0006", 53, y + 175, 734, 214, 15);
          title(context, $t("hollow-zero-card.text_d626448021"), 75, y + 201, 26);
          for (let n = 0; n < 4; n++) {
            const entry = n === 3 ? throne.buddy : throne.avatars[n];
            const x = 76 + n * 181, size = n === 3 ? 115 : 148, row = y + 224 + (148 - size);
            if (entry) {
              drawPortrait(context, art, entry, x, row, size, n === 3);
              fillRound(context, "#000b", x + 3, row + size - 29, size - 6, 25, 6);
              label(context, `LV.${entry.level ?? "—"}`, x + 8, row + size - 16, 16);
              if (n !== 3) label(context, entry.damageRate ? `${entry.damageRate}%` : "—", x + size - 8,
                row + size - 16, 16, { align: "right", maxWidth: 70 });
            } else if (n !== 3) fillRound(context, "#18181a", x, row, size, size, 11, "#343534");
          }
        }
      }
      y += h + 20;
    }
    label(context, zzzCardFooter, width / 2, height - 33, 17, { align: "center", color: "#fff" });
  }, 4, options.inlineImageByteLimit, { allowHalfScale: true });
}

function title(context: Context, value: string, x: number, y: number, size: number, align: CanvasTextAlign = "left", maxWidth?: number) {
  label(context, value, x + 2, y + 3, size, { align, maxWidth, weight: 700, color: "#383434" });
  label(context, value, x, y, size, { align, maxWidth, weight: 700, color: "#e6e6e6" });
}
