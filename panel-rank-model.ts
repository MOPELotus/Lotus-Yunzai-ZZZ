import { MAX_PROFILE_ID } from "@lotus-yunzai/account";
import type { ZzzPanelAvatar } from "@lotus-yunzai/hoyo-client";
import { zzzPrefixedCommand } from "./panel-command.ts";
import { buildZzzPanelDetail, panelInteger, panelObject } from "./panel-detail.ts";
import { buildZzzPanelScore } from "./panel-score.ts";

const visibility = /^(显示|隐藏|取消显示|关闭|开启)(?:群(?:内)?)?(国际服|海外服)?角色面板排名\s*([1-9]\d{0,2})?$/u;
const query = /^([^\p{Cc}\p{Cf}]{1,80}?)(?:(?:面板|圣遗物|驱动盘)?(排名|排行|综合榜)|(?:圣遗物|驱动盘))\s*([1-9]\d{0,2})?(?:\s*页\s*([1-9]\d{0,3}))?$/u;

export function zzzPanelRankCommand(raw: string) {
  const body = zzzPrefixedCommand(raw);
  if (!body || /^(?:更新|刷新)/u.test(body)) return;
  const action = visibility.exec(body);
  if (action) {
    const profileId = Number(action[3] ?? 1);
    if (profileId <= MAX_PROFILE_ID) return { kind: "visibility", enable: action[1] === "显示" || action[1] === "开启",
      profileId, ...(action[2] && { international: true as const }) } as const;
    return;
  }
  const match = query.exec(body);
  if (!match) return;
  const name = match[1]!.trim();
  const profileId = Number(match[3] ?? 1);
  if (name && profileId <= MAX_PROFILE_ID) return {
    kind: "board", name, weighted: match[2] === "综合榜", profileId, page: Number(match[4] ?? 1),
  } as const;
}

export function buildZzzPanelRankRow(avatar: ZzzPanelAvatar) {
  const detail = buildZzzPanelDetail(avatar);
  const drive = buildZzzPanelScore(avatar, detail)?.total ?? 0;
  const weapon = panelObject(avatar.weapon);
  const profession = avatar.avatar_profession;
  const sets = new Set<number>();
  const discs = Array.isArray(avatar.equip) ? avatar.equip.slice(0, 24) : [avatar.equip];
  for (const value of discs) {
    const { equip_suit: suit } = panelObject(value);
    if (!Array.isArray(suit)) continue;
    for (const entry of suit.slice(0, 6)) {
      const row = panelObject(entry);
      const id = panelInteger(row.suit_id || row.id, 1, 999_999);
      if (id) sets.add(id);
    }
  }
  const weaponRank = weapon.rarity === "S" ? 10 : weapon.rarity === "A" ? 4 : 0;
  const levelBonus = Math.floor((detail.weapon?.level ?? 0) / 10);
  const refinements = Math.max(0, (detail.weapon?.star ?? 1) - 1);
  const fit = weapon.profession && profession && weapon.profession === profession ? 6 : 0;
  const weighted = detail.weapon ? drive + weaponRank + levelBonus + refinements + fit + Math.min(3, sets.size) * 2 : drive;
  return { avatar, drive, weighted, skills: detail.skills, weapon: detail.weapon };
}
export type ZzzPanelRankRow = ReturnType<typeof buildZzzPanelRankRow> & { readonly uid: string };
