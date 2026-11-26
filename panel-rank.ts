import type { OfficialGroupPanels, GroupPanelAccount } from "../../lib/group-panel-accounts.ts";
import type { ZzzPanelAvatar } from "@lotus-yunzai/hoyo-client";
import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import { zzzResourceDirectory } from "./card-theme.ts";
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

type RegisteredPanel = ZzzPanelRankIdentity & { readonly field: string; readonly qq: string; readonly profileId: number; readonly owner?: GroupPanelAccount };
type StrongestRenderer = (...args: Parameters<typeof renderZzzPanelDetail>) => Promise<{ readonly png: Uint8Array }>;

export function createZzzPanelRanks(profiles: ReturnType<typeof createProfileStore>,
  openHoYoLabZzzCheckin: ZzzPanelRankRoleReader, signal: AbortSignal, showcase: ReturnType<typeof createZzzShowcaseClient>,
  { renderStrongest = renderZzzPanelDetail, official }: { readonly renderStrongest?: StrongestRenderer; readonly official?: OfficialGroupPanels<ZzzPanelAvatar[]> } = {}) {
  // Enka uses a single request slot across public panel updates and all group queries.
  const refresh = createGroupRankRefresh(official ? 3 : 1);

  return async (context: ChallengeRankContext, command: NonNullable<ReturnType<typeof zzzPanelRankCommand>>) => {
    const scope = rankGroup(context);
    if (!scope) return $t("panel-rank.text_dc4e925566");
    const redis = globalThis.redis;
    if (!redis) return $t("panel-rank.text_b82cead464");
    const { group, actor } = scope;
    const key = rankKey(group);
    const participant = `${actor}:${command.profileId}`;
    const resources = zzzResourceDirectory();
    const roleFor = createPanelRankIdentityReader(profiles, { openHoYoLabZzzCheckin }, signal);
    try {
      const settings = await readRankConfig(group);
      if (!settings.allowed && (command.kind !== "visibility" || command.enable)) return $t("panel-rank.text_866216e6ce");
      const members = await rankMembership(context, actor);
      if (!members) return $t("panel-rank.text_f9fd277d3d");

      if (command.kind === "visibility" && !command.enable) {
        if (signal.aborted) return;
        if (command.international) {
          await redis.eval(hideInternational, { keys: [key], arguments: [participant] });
          return $t("panel-rank.text_54f686811a");
        }
        if (official) await redis.hSet(key, participant, "hidden");
        else await redis.hDel(key, participant);
        return $t("panel-rank.text_895076daad");
      }
      if (command.kind === "visibility") {
        const viewer = await roleFor(actor, command.profileId, command.international ? "international" : undefined);
        if (!viewer) return command.international ?
          $t("panel-rank.text_1fa16ed1f2") :
          $t("panel-rank.text_ad858b391d");
        if (signal.aborted) return;
        await redis.hSet(key, participant, viewer.value);
        const label = panelRankMode(viewer!.value) === "cn" ? $t("panel-rank.text_a98f99ed89") : $t("panel-rank.text_3b488823cb", { "uid": viewer.uid });
        return $t("panel-rank.text_4baf68b300", { "label": label, "value2": command.international ? $t("panel-rank.text_970d688dd6") : "", "profileId": command.profileId });
      }

      const localViewer = official ? undefined : await roleFor(actor, command.profileId, "cn");
      const viewerRegistration = official || localViewer ? undefined : await redis.hGet(key, participant);
      const viewer = official ? undefined : localViewer ?? (viewerRegistration
        ? await roleFor.registered(actor, command.profileId, viewerRegistration)
        : await roleFor(actor, command.profileId, "selected") ?? await roleFor(actor, command.profileId, "international"));
      if (!official && !viewer) return $t("panel-rank.text_ad858b391d");
      const verifyViewer = () => viewerRegistration
        ? redis.hGet(key, participant).then(value => value === viewerRegistration
          ? roleFor.registered(actor, command.profileId, viewerRegistration, viewer!.revision) : undefined)
        : roleFor(actor, command.profileId, panelRankMode(viewer!.value), viewer!.revision);

      const aliases = await readZzzRoleAliases(resources).catch(() => undefined);
      const name = zzzRoleName(zzzRoleAlias(aliases, command.name) ?? command.name);
      const registered: RegisteredPanel[] = [];
      if (!official) {
      for await (const { field, value } of redis.hScanIterator(key, { COUNT: 100 })) {
        if (signal.aborted) return;
        const owner = /^([1-9]\d{0,15}):([1-9]\d{0,2})$/u.exec(field);
        if (!owner || !members.has(owner[1]!) || Number(owner[2]) > MAX_PROFILE_ID) continue;
        const [qq, profileId] = [owner[1]!, Number(owner[2])];
        const identity = await roleFor.registered(qq, profileId, value);
        if (identity) registered.push({ ...identity, field, qq, profileId });
      }
      }
      if (official) {
        registered.length = 0;
        for (const owner of await official.list(new Set([...members].map(Number)), signal)) {
          const qq = String(owner.qq), field = `${qq}:${owner.profileId}`;
          if (await redis.hGet(key, field) === "hidden") continue;
          registered.push({ owner, qq, field, profileId: owner.profileId, uid: owner.role.uid,
            region: owner.role.region, value: `${owner.role.region}:${owner.role.uid}`, revision: "" });
        }
      }
      if (!registered.length) return $t("panel-rank.text_0dbaeff610");
      const tables = await loadEnkaPanelTables(resources);
      if (!tables) return $t("panel-rank.text_bf3e1ea9a3");

      const characterIds = new Set(Object.entries(tables.partners).flatMap(([id, raw]) => {
        const { name: primary, full_name: full } = panelObject(raw);
        return [primary, full].some(value => typeof value === "string" && zzzRoleName(value) === name) ? [id] : [];
      }));
      if (!characterIds.size) return $t("panel-rank.text_3f2718ee46");

      const byOwner = (a: RegisteredPanel, b: RegisteredPanel) => a.qq.localeCompare(b.qq, "en") || a.profileId - b.profileId;
      const seen = new Set<string>();
      const entries = registered.sort(byOwner).filter(({ uid, region }) => {
        const identity = `${region}:${uid}`;
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      });
      if (official) await Promise.resolve().then(() => context.reply?.($t("group-rank.refreshing", { count: entries.length }))).catch(() => {});
      const verify = async (entry: RegisteredPanel) => {
        if (official && entry.owner) {
          const [role, currentMembers, policy, visible] = await Promise.all([
            profiles.savedRole(entry.qq, entry.profileId, "zzz"), rankMembership(context, actor), readRankConfig(group), redis.hGet(key, entry.field),
          ]);
          if (!policy.allowed || !currentMembers?.has(entry.qq) || visible === "hidden" || role.uid !== entry.uid ||
              role.region !== entry.owner.role.region || role.gameBiz !== entry.owner.role.gameBiz) throw new Error("group-panel-account-changed");
          return;
        }
        const [current, currentMembers, visible, policy] = await Promise.all([
          roleFor.registered(entry.qq, entry.profileId, entry.value, entry.revision),
          rankMembership(context, actor), redis.hGet(key, entry.field), readRankConfig(group),
        ]);
        if (!policy.allowed || !currentMembers?.has(entry.qq) || visible !== entry.value || current?.value !== entry.value) {
          throw new Error($t("panel-rank.text_58dcbef92f"));
        }
      };
      const results = await refresh(entries, async (entry, requestSignal) => {
        if (official && entry.owner) {
          const rows = await official.read(entry.owner, requestSignal, () => verify(entry), undefined);
          const matched = rows.filter(row => characterIds.has(String(row.id)));
          if (!matched.length) return;
          return matched.map(avatar => ({ ...buildZzzPanelRankRow(avatar), ...entry }));
        }
        const publicData = await showcase.forGroupRank(entry, requestSignal, () => verify(entry));
        await verify(entry);
        const matched = publicData?.rows.filter(raw => characterIds.has(String(raw.Id)));
        if (!matched?.length) return;
        return matched.map(raw => {
          const avatar = formatEnkaPanel(raw, tables);
          if (!avatar) throw new Error($t("panel-rank.text_7183b53f9b"));
          return { ...buildZzzPanelRankRow(avatar), ...entry };
        });
      }, signal);
      const unique = results.flatMap(result => result.status === "fresh" ? result.value : []);
      const missing = results.filter(result => result.status === "not-listed").length;
      const failed = results.filter(result => result.status === "failed").length;
      const overview = $t("panel-rank.text_63ace66ab0", { "value1": results.length - missing - failed, "missing": missing, "failed": failed });
      if (new Set(unique.map(row => row.avatar.id)).size > 1) return $t("panel-rank.text_79ddd1a4ad");
      if (!unique.length) return $t("panel-rank.text_6c424aa2fc", { "overview": overview });
      const mode = command.weighted ? "weighted" : "drive";
      unique.sort((a, b) => b[mode] - a[mode] || byOwner(a, b));
      const maxPage = Math.ceil(unique.length / settings.maximum);
      if (command.page > maxPage) return $t("panel-rank.text_b6a3984d7d", { "maxPage": maxPage });
      const first = (command.page - 1) * settings.maximum;
      const strongest = command.kind === "strongest" ? unique[0]! : undefined;
      const selected = strongest ? [strongest] : unique.slice(first, first + settings.maximum);
      const leader = strongest && $t("panel-rank.text_a005ac788c", { "name_mi18n": strongest.avatar.name_mi18n, "uid": strongest.uid, "value3": strongest.drive.toFixed(2) });
      const title = `${selected[0]!.avatar.name_mi18n}${command.weighted ? $t("panel-rank.text_a885a22d16") : $t("panel-rank.text_6570a98f28")}`;
      const example = `%${command.name}${command.weighted ? $t("panel-rank.text_a885a22d16") : $t("panel-rank.text_6570a98f28")}${zzzCommandProfileSuffix(command.profileId)}`;
      const next = command.page < maxPage ? $t("panel-rank.text_65394218f3", { "example": example, "value2": command.page + 1 }) : undefined;
      const image = await (strongest
        ? renderStrongest(strongest.avatar, strongest.uid, { showcase: !official, legacyResources: resources, signal,
          inlineImageByteLimit: context.inlineImageByteLimit })
        : renderZzzPanelRank(title, selected,
          { offset: first, weighted: command.weighted, overview, next, legacyResources: resources, signal,
            inlineImageByteLimit: context.inlineImageByteLimit }))
        .catch(() => undefined);
      if (signal.aborted) return;
      const [currentMembers, currentRequester, currentSettings, activeRows] = await Promise.all([
        rankMembership(context, actor), official ? undefined : verifyViewer(), readRankConfig(group),
        Promise.all(selected.map(row => official ? verify(row).then(() => row).catch(() => undefined) : roleFor.registered(row.qq, row.profileId, row.value, row.revision))),
      ]);
      if (!currentMembers || (!official && currentRequester?.value !== viewer!.value) || !currentSettings.allowed ||
          selected.some((row, index) => !currentMembers.has(row.qq) || row.value !== activeRows[index]?.value)) return changed;
      const visible = await redis.hmGet(key, selected.map(row => row.field));
      if (visible.some((value, index) => official ? value === "hidden" : value !== selected[index]!.value)) return changed;
      if (signal.aborted) return;
      if (leader) return image ? [`${leader}\n${overview}`, { type: "image" as const, file: image.png }] : $t("panel-rank.text_0bcdffed52", { "leader": leader, "overview": overview });
      if (image) return [overview, { type: "image" as const, file: image.png }];
      return [title, overview, ...selected.map((row, index) => `${first + index + 1}. ${row.uid} · ${row[mode].toFixed(2)}`),
        ...(next ? [$t("panel-rank.text_2cb43eac24", { "next": next })] : [])].join("\n");
    } catch {
      if (!signal.aborted) return $t("panel-rank.text_b82cead464");
    }
  };
}

const changed = $t("panel-rank.text_bc0c8082f8");
