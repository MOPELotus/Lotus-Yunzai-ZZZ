import { rankGroup, rankMembership, type ChallengeRankContext } from "./challenge-rank.ts";
import { zzzPrefixedCommand } from "./panel-command.ts";
import { ownsZzzManagement } from "./role-alias-command.ts";

const installation = new URL("../../", import.meta.url);

export function zzzPanelIntervalCommand(message: string,
  context: ChallengeRankContext & { readonly groupActivitySignal?: AbortSignal }, signal: AbortSignal, root = installation) {
  const command = zzzPrefixedCommand(message);
  if (!command) return;
  if (/^刷新面板间隔\s*\d+$/u.test(command)) {
    return "绝区零全量和指定角色的面板更新没有整次冷却。使用 %刷新角色间隔100 设置同一次更新中逐角色请求的间隔（毫秒）。";
  }
  const match = /^刷新角色间隔\s*(\d+)$/u.exec(command);
  if (!match) return;
  const connection = context.message_type === "group" ? context.groupActivitySignal : context.privateCredentialSignal;
  const active = () => connection?.aborted === false && ownsZzzManagement(context, signal);
  if (!connection || !active()) return "仅限当前机器人的主人设置。";

  const roleInterval = Number(match[1]);
  if (!Number.isSafeInteger(roleInterval) || roleInterval < 100 || roleInterval > 10000) {
    return "刷新角色间隔须在 100 到 10000 毫秒之间。";
  }
  const operation = AbortSignal.any([signal, connection]);
  const group = rankGroup(context);
  return (async () => {
    if (group && !await rankMembership(context, group.actor)) return "暂无法核对当前群成员，请稍后重试。";
    if (!active()) return "仅限当前机器人的主人设置。";
    try {
      const { updateZzzPanelIntervals } = await import("../../lib/panel-zzz-settings.ts");
      const values = await updateZzzPanelIntervals(root, { roleInterval }, active, operation);
      if (operation.aborted) return [];
      return `绝区零刷新角色间隔已设置为 ${values.roleInterval} 毫秒，适用于同一次更新中的连续角色请求。`;
    } catch {
      if (operation.aborted) return [];
      return active() ? "绝区零刷新间隔未保存，请稍后再试。" : "仅限当前机器人的主人设置。";
    }
  })();
}
