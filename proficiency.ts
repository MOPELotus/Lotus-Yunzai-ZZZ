import type { ZzzPanelAvatar } from "@lotus-yunzai/hoyo-client";
import { buildZzzPanelDetail } from "./panel-detail.ts";
import { buildZzzPanelScore } from "./panel-score.ts";

const rarityWeight = { S: 5, A: 4, B: 3 } as const;

function entry(avatar: ZzzPanelAvatar) {
  const panel = buildZzzPanelDetail(avatar);
  const discs = buildZzzPanelScore(avatar, panel);
  const weapon = panel.weapon;
  // Original proficiency_score combines drive-disc score, six skills, level, mindscapes and W-Engine.
  const rarity = rarityWeight[avatar.rarity];
  const skills = panel.skills.reduce<number>((total, level) => total + (level ?? 0) * rarity, 0);
  const weaponRarity = weapon?.rarity === "S" ? 5 : weapon?.rarity === "A" ? 4 : 3;
  const weaponTraining = weapon
    ? (weapon.level ?? 0) * 2 + (weapon.star ?? 0) * 2 * weaponRarity
    : 0;
  const score = (discs?.total ?? 0) * 2 + skills + avatar.level * 2 + avatar.rank * rarity * 2 + weaponTraining;
  return { avatar, weapon, score, skills: panel.skills, element: panel.element, driveDiscGrade: discs?.grade,
    withDriveDiscs: panel.discs.some(disc => disc !== undefined),
    highGrades: discs?.discs.filter(disc => disc?.grade === "SSS" || disc?.grade === "ACE" || disc?.grade === "MAX").length ?? 0,
  };
}

export function buildZzzProficiency(avatars: readonly ZzzPanelAvatar[]) {
  // Array sort is stable, preserving the stored roster order for equal proficiency scores.
  const rows = avatars.map(entry).sort((left, right) => right.score - left.score);
  const equippedEngines = rows.filter(row => row.weapon);
  const total = rows.length;
  return { rows, total,
    agentS: rows.filter(({ avatar }) => avatar.rarity === "S").length,
    sWeaponRate: equippedEngines.length
      ? equippedEngines.filter(row => row.weapon?.rarity === "S").length / equippedEngines.length * 100 : undefined,
    highRank: rows.filter(({ avatar }) => avatar.rank > 4).length,
    highGrades: rows.reduce((total, row) => total + row.highGrades, 0),
  };
}
