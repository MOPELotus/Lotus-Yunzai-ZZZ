import { createGroupRankRefresh, MAX_PROFILE_ID, type createProfileStore } from "@lotus-yunzai/account";
import { rankGroup, rankMembership, type ChallengeRankContext } from "./challenge-rank.ts";
import { readRankConfig } from "./challenge-rank-store.ts";
import { createPanelRankIdentityReader, panelRankMode, type ZzzPanelRankIdentity, type ZzzPanelRankRoleReader } from "./panel-rank-identity.ts";
import { renderZzzPanelDetail } from "./panel-detail-card.ts";
import { renderZzzPanelRank } from "./panel-rank-card.ts";
import { buildZzzPanelRankRow, type zzzPanelRankCommand } from "./panel-rank-model.ts";
import { formatEnkaPanel, loadEnkaPanelTables } from "./enka-panel-data.ts";
import { panelObject } from "./panel-detail.ts";
import type { createZzzShowcaseClient } from "./enka-showcase.ts";
import { readZzzRoleAliases, zzzRoleAlias, zzzRoleName } from "./role-alias.ts";
import { zzzCommandProfileSuffix } from "./profile-command.ts";

const rankKey = (group: string) => `lotus-yunzai:zzz-panel-ranks:${group}:owners`;
const hideInternational = `
local value = redis.call('HGET', KEYS[1], ARGV[1])
if value and (value:match('^selected:') or value:match('^international:')) then
  return redis.call('HDEL', KEYS[1], ARGV[1])
end
return 0
`;

type RegisteredPanel = ZzzPanelRankIdentity & { readonly field: string; readonly qq: string; readonly profileId: number };
type StrongestRenderer = (...args: Parameters<typeof renderZzzPanelDetail>) => Promise<{ readonly png: Uint8Array }>;

export function createZzzPanelRanks(profiles: ReturnType<typeof createProfileStore>,
  openHoYoLabZzzCheckin: ZzzPanelRankRoleReader, signal: AbortSignal, showcase: ReturnType<typeof createZzzShowcaseClient>,
  { renderStrongest = renderZzzPanelDetail }: { readonly renderStrongest?: StrongestRenderer } = {}) {
  // Enka uses a single request slot across public panel updates and all group queries.
  const refresh = createGroupRankRefresh(1);

  return async (context: ChallengeRankContext, command: NonNullable<ReturnType<typeof zzzPanelRankCommand>>) => {
    const scope = rankGroup(context);
    if (!scope) return "请在群聊中使用该命令！";
    const redis = globalThis.redis;
    if (!redis) return "角色面板排名暂时不可用。";
    const { group, actor } = scope;
    const key = rankKey(group);
    const participant = `${actor}:${command.profileId}`;
    const resources = Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR;
    const roleFor = createPanelRankIdentityReader(profiles, { openHoYoLabZzzCheckin }, signal);
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
      if (command.kind === "visibility") {
        const viewer = await roleFor(actor, command.profileId, command.international ? "international" : undefined);
        if (!viewer) return command.international ?
          "请先在私聊绑定已核验的国际服 Cookie，再在 HoYoLAB 选择要展示的绝区零角色。" :
          "请先登录并选择已认证的绝区零角色。";
        if (signal.aborted) return;
        await redis.hSet(key, participant, viewer.value);
        const label = panelRankMode(viewer.value) === "cn" ? "角色面板排名" : `国际服角色面板排名（UID ${viewer.uid}）`;
        return `本群已显示该档案的${label}。查榜时仅将游戏 UID 发给 Enka 请求公开展柜。发送 %隐藏${command.international ? "国际服" : ""}角色面板排名${command.profileId} 可撤回。`;
      }

      const localViewer = await roleFor(actor, command.profileId, "cn");
      const viewerRegistration = localViewer ? undefined : await redis.hGet(key, participant);
      const viewer = localViewer ?? (viewerRegistration
        ? await roleFor.registered(actor, command.profileId, viewerRegistration)
        : await roleFor(actor, command.profileId, "selected") ?? await roleFor(actor, command.profileId, "international"));
      if (!viewer) return "请先登录并选择已认证的绝区零角色。";
      const verifyViewer = () => viewerRegistration
        ? redis.hGet(key, participant).then(value => value === viewerRegistration
          ? roleFor.registered(actor, command.profileId, viewerRegistration, viewer.revision) : undefined)
        : roleFor(actor, command.profileId, panelRankMode(viewer.value), viewer.revision);

      const aliases = await readZzzRoleAliases(resources).catch(() => undefined);
      const name = zzzRoleName(zzzRoleAlias(aliases, command.name) ?? command.name);
      const registered: RegisteredPanel[] = [];
      for await (const { field, value } of redis.hScanIterator(key, { COUNT: 100 })) {
        if (signal.aborted) return;
        const owner = /^([1-9]\d{0,15}):([1-9]\d{0,2})$/u.exec(field);
        if (!owner || !members.has(owner[1]!) || Number(owner[2]) > MAX_PROFILE_ID) continue;
        const [qq, profileId] = [owner[1]!, Number(owner[2])];
        const identity = await roleFor.registered(qq, profileId, value);
        if (identity) registered.push({ ...identity, field, qq, profileId });
      }
      if (!registered.length) return "本群暂无已授权的角色面板。发送 %显示角色面板排名 可加入。";
      const tables = await loadEnkaPanelTables(resources);
      if (!tables) return "绝区零公开展柜所需的本地游戏资料不可用。";

      const characterIds = new Set(Object.entries(tables.partners).flatMap(([id, raw]) => {
        const { name: primary, full_name: full } = panelObject(raw);
        return [primary, full].some(value => typeof value === "string" && zzzRoleName(value) === name) ? [id] : [];
      }));
      if (!characterIds.size) return "本地游戏资料暂无法核验该代理人。";

      const byOwner = (a: RegisteredPanel, b: RegisteredPanel) => a.qq.localeCompare(b.qq, "en") || a.profileId - b.profileId;
      const seen = new Set<string>();
      const entries = registered.sort(byOwner).filter(({ uid, region }) => {
        const identity = `${region}:${uid}`;
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      });
      const verify = async (entry: RegisteredPanel) => {
        const [current, currentMembers, visible, policy] = await Promise.all([
          roleFor.registered(entry.qq, entry.profileId, entry.value, entry.revision),
          rankMembership(context, actor), redis.hGet(key, entry.field), readRankConfig(group),
        ]);
        if (!policy.allowed || !currentMembers?.has(entry.qq) || visible !== entry.value || current?.value !== entry.value) {
          throw new Error("榜单成员、档案或可见状态已变化。");
        }
      };
      const results = await refresh(entries, async (entry, requestSignal) => {
        const publicData = await showcase.forGroupRank(entry, requestSignal, () => verify(entry));
        await verify(entry);
        const matched = publicData?.rows.filter(raw => characterIds.has(String(raw.Id)));
        if (!matched?.length) return;
        return matched.map(raw => {
          const avatar = formatEnkaPanel(raw, tables);
          if (!avatar) throw new Error("本地游戏资料无法核验所查角色的公开展柜。");
          return { ...buildZzzPanelRankRow(avatar), ...entry };
        });
      }, signal);
      const unique = results.flatMap(result => result.status === "fresh" ? result.value : []);
      const missing = results.filter(result => result.status === "not-listed").length;
      const failed = results.filter(result => result.status === "failed").length;
      const overview = `Enka 公开展柜：${results.length - missing - failed} 个 UID 入榜，${missing} 个未公开展示该角色，${failed} 个刷新未确认。`;
      if (new Set(unique.map(row => row.avatar.id)).size > 1) return "有多个同名代理人，请输入完整名称。";
      if (!unique.length) return `${overview}\n本次没有确认可入榜的角色面板。`;
      const mode = command.weighted ? "weighted" : "drive";
      unique.sort((a, b) => b[mode] - a[mode] || byOwner(a, b));
      const maxPage = Math.ceil(unique.length / settings.maximum);
      if (command.page > maxPage) return `当前榜单共 ${maxPage} 页。`;
      const first = (command.page - 1) * settings.maximum;
      const strongest = command.kind === "strongest" ? unique[0]! : undefined;
      const selected = strongest ? [strongest] : unique.slice(first, first + settings.maximum);
      const leader = strongest && `本群最强${strongest.avatar.name_mi18n} · UID ${strongest.uid} · 驱动盘 ${strongest.drive.toFixed(2)} 分`;
      const title = `${selected[0]!.avatar.name_mi18n}${command.weighted ? "综合榜" : "排名"}`;
      const example = `%${command.name}${command.weighted ? "综合榜" : "排名"}${zzzCommandProfileSuffix(command.profileId)}`;
      const next = command.page < maxPage ? `${example} 页${command.page + 1}` : undefined;
      const image = await (strongest
        ? renderStrongest(strongest.avatar, strongest.uid, { showcase: true, legacyResources: resources, signal,
          inlineImageByteLimit: context.inlineImageByteLimit })
        : renderZzzPanelRank(title, selected,
          { offset: first, weighted: command.weighted, overview, next, legacyResources: resources, signal,
            inlineImageByteLimit: context.inlineImageByteLimit }))
        .catch(() => undefined);
      if (signal.aborted) return;
      const [currentMembers, currentRequester, currentSettings, activeRows] = await Promise.all([
        rankMembership(context, actor), verifyViewer(), readRankConfig(group),
        Promise.all(selected.map(row => roleFor.registered(row.qq, row.profileId, row.value, row.revision))),
      ]);
      if (!currentMembers || currentRequester?.value !== viewer.value || !currentSettings.allowed ||
          selected.some((row, index) => !currentMembers.has(row.qq) || row.value !== activeRows[index]?.value)) return changed;
      const visible = await redis.hmGet(key, selected.map(row => row.field));
      if (visible.some((value, index) => value !== selected[index]!.value)) return changed;
      if (signal.aborted) return;
      if (leader) return image ? [`${leader}\n${overview}`, { type: "image" as const, file: image.png }] : `${leader}\n${overview}\n角色面板图片暂时无法发送。`;
      if (image) return [overview, { type: "image" as const, file: image.png }];
      return [title, overview, ...selected.map((row, index) => `${first + index + 1}. ${row.uid} · ${row[mode].toFixed(2)}`),
        ...(next ? [`下一页 ${next}`] : [])].join("\n");
    } catch {
      if (!signal.aborted) return "角色面板排名暂时不可用。";
    }
  };
}

const changed = "榜单成员、档案或可见状态已变化，请重新查询。";
