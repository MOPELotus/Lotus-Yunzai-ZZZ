import { MAX_PROFILE_ID, type createProfileStore } from "@lotus-yunzai/account";
import type { AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import type { createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import { rankGroup, rankMembership, type ChallengeRankContext } from "./challenge-rank.ts";
import { readRankConfig } from "./challenge-rank-store.ts";
import { createPanelRankIdentityReader, panelRankMode } from "./panel-rank-identity.ts";
import { renderZzzPanelRank } from "./panel-rank-card.ts";
import { buildZzzPanelRankRow, type zzzPanelRankCommand } from "./panel-rank-model.ts";
import { createZzzPanelStorage } from "./panel-storage.ts";
import { readZzzRoleAliases, zzzRoleAlias, zzzRoleName } from "./role-alias.ts";

const rankKey = (group: string) => `lotus-yunzai:zzz-panel-ranks:${group}:owners`;
const hideInternational = `
local value = redis.call('HGET', KEYS[1], ARGV[1])
if value and (value:match('^selected:') or value:match('^international:')) then
  return redis.call('HDEL', KEYS[1], ARGV[1])
end
return 0
`;

export function createZzzPanelRanks(profiles: ReturnType<typeof createProfileStore>, client: ReturnType<typeof createProfileHoyoClient>,
  lock: AcquireRoleArchiveLock, signal: AbortSignal) {
  const archive = createZzzPanelStorage(lock);

  return async (context: ChallengeRankContext, command: NonNullable<ReturnType<typeof zzzPanelRankCommand>>) => {
    const scope = rankGroup(context);
    if (!scope) return "请在群聊中使用该命令！";
    const redis = globalThis.redis;
    if (!redis) return "角色面板排名暂时不可用。";
    const { group, actor } = scope;
    const key = rankKey(group);
    const participant = `${actor}:${command.profileId}`;
    const resources = Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR;
    const roleFor = createPanelRankIdentityReader(profiles, client, signal);
    try {
      const settings = await readRankConfig(group);
      if (!settings.allowed && (command.kind !== "visibility" || command.enable)) return "当前群角色面板排名功能已关闭！";
      const members = await rankMembership(context, actor);
      if (!members) return "暂无法核对当前群成员，请稍后重试。";

      if (command.kind === "visibility" && !command.enable) {
        if (signal.aborted) return;
        if (command.international) {
          await redis.eval(hideInternational, { keys: [key], arguments: [participant] });
          return "本群已隐藏该档案的国际服角色面板排名。";
        }
        await redis.hDel(key, participant);
        return "本群已隐藏该档案的角色面板排名。";
      }
      const requester = await (command.kind === "visibility" && command.international
        ? roleFor(actor, command.profileId, "international")
        : roleFor(actor, command.profileId));
      const viewer = requester ?? (command.kind === "board" ? await roleFor(actor, command.profileId, "international") : undefined);
      if (!viewer) return command.kind === "visibility" && command.international ?
        "请先在私聊绑定已核验的国际服 Cookie，再在 HoYoLAB 选择要展示的绝区零角色。" :
        "请先登录并选择已认证的绝区零角色。";

      if (command.kind === "visibility") {
        if (signal.aborted) return;
        await redis.hSet(key, participant, viewer.value);
        const label = panelRankMode(viewer.value) === "cn" ? "角色面板排名" : `国际服角色面板排名（UID ${viewer.uid}）`;
        return `本群已显示该档案的${label}。发送 %隐藏角色面板排名${command.profileId === 1 ? "" : command.profileId} 可撤回。`;
      }

      const aliases = await readZzzRoleAliases(resources).catch(() => undefined);
      const name = zzzRoleName(zzzRoleAlias(aliases, command.name) ?? command.name);
      const matches = new Set<number>();
      const rows = [];
      for await (const { field, value } of redis.hScanIterator(key, { COUNT: 100 })) {
        if (signal.aborted) return;
        const owner = /^([1-9]\d{0,15}):([1-9]\d{0,2})$/u.exec(field);
        if (!owner || !members.has(owner[1]!) || Number(owner[2]) > MAX_PROFILE_ID) continue;
        const [qq, profileId] = [owner[1]!, Number(owner[2])];
        const mode = panelRankMode(value);
        if (!mode) continue;
        const source = await roleFor(qq, profileId, mode);
        if (!source || source.value !== value) continue;
        const { uid, region } = source;
        const avatars = await archive.read({ qq, uid, region }).catch(() => []);
        for (const avatar of avatars) {
          const names = [avatar.name_mi18n, avatar.full_name_mi18n];
          if (!names.some(candidate => candidate && zzzRoleName(candidate) === name)) continue;
          matches.add(avatar.id);
          rows.push({ ...buildZzzPanelRankRow(avatar), uid, qq, profileId, value, field, region, revision: source.revision });
        }
      }
      if (matches.size > 1) return "有多个同名代理人，请输入完整名称。";
      const mode = command.weighted ? "weighted" : "drive";
      rows.sort((a, b) => b[mode] - a[mode] || a.qq.localeCompare(b.qq, "en") || a.profileId - b.profileId);
      const seen = new Set<string>();
      const unique = rows.filter(row => {
        const identity = `${row.region}:${row.uid}`;
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      });
      if (!unique.length) return "本群暂无已授权的该角色面板。发送 %显示角色面板排名 可加入。";
      const maxPage = Math.ceil(unique.length / settings.maximum);
      if (command.page > maxPage) return `当前榜单共 ${maxPage} 页。`;
      const first = (command.page - 1) * settings.maximum;
      const selected = unique.slice(first, first + settings.maximum);
      const title = `${selected[0]!.avatar.name_mi18n}${command.weighted ? "综合榜" : "排名"}`;
      const example = `%${command.name}${command.weighted ? "综合榜" : "排名"}${command.profileId === 1 ? "" : command.profileId}`;
      const next = command.page < maxPage ? `${example} 页${command.page + 1}` : undefined;
      const image = await renderZzzPanelRank(title, selected,
        { offset: first, weighted: command.weighted, next, legacyResources: resources, signal }).catch(() => undefined);
      if (signal.aborted) return;
      const [currentMembers, currentRequester, currentSettings, activeRows] = await Promise.all([
        rankMembership(context, actor), roleFor(actor, command.profileId, panelRankMode(viewer.value), viewer.revision), readRankConfig(group),
        Promise.all(selected.map(row => roleFor(row.qq, row.profileId, panelRankMode(row.value), row.revision))),
      ]);
      if (!currentMembers || currentRequester?.value !== viewer.value || !currentSettings.allowed ||
          selected.some((row, index) => !currentMembers.has(row.qq) || row.value !== activeRows[index]?.value)) return changed;
      const visible = await redis.hmGet(key, selected.map(row => row.field));
      if (visible.some((value, index) => value !== selected[index]!.value)) return changed;
      if (signal.aborted) return;
      if (image) return { type: "image" as const, file: image.png };
      return [title, ...selected.map((row, index) => `${first + index + 1}. ${row.uid} · ${row[mode].toFixed(2)}`),
        ...(next ? [`下一页 ${next}`] : [])].join("\n");
    } catch {
      if (!signal.aborted) return "角色面板排名暂时不可用。";
    }
  };
}

const changed = "榜单成员、档案或可见状态已变化，请重新查询。";
