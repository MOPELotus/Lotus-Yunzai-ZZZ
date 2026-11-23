import { rankGroup, rankMembership, type ChallengeRankContext } from "./challenge-rank.ts";
import { zzzPrefixedCommand } from "./panel-command.ts";
import { ownsZzzManagement } from "./role-alias-command.ts";

const installation = new URL("../../", import.meta.url);
const intervals = {
  面板: { key: "interval", minimum: 0, maximum: 1000, unit: "秒" },
  角色: { key: "roleInterval", minimum: 100, maximum: 10000, unit: "毫秒" },
} as const;

export function zzzPanelIntervalCommand(message: string,
  context: ChallengeRankContext & { readonly groupActivitySignal?: AbortSignal }, signal: AbortSignal, root = installation) {
  const command = zzzPrefixedCommand(message);
  const match = command && /^刷新(面板|角色)间隔\s*(\d+)$/u.exec(command);
  if (!match) return;
  const label = match[1]!;
  const { key, minimum, maximum, unit } = label === "面板" ? intervals.面板 : intervals.角色;
  const connection = context.message_type === "group" ? context.groupActivitySignal : context.privateCredentialSignal;
  const active = () => connection?.aborted === false && ownsZzzManagement(context, signal);
  if (!connection || !active()) return "仅限当前机器人的主人设置。";

  const value = Number(match[2]);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    return `刷新${label}间隔须在 ${minimum} 到 ${maximum} ${unit}之间。`;
  }
  const operation = AbortSignal.any([signal, connection]);
  const group = rankGroup(context);
  return (async () => {
    if (group && !await rankMembership(context, group.actor)) return "暂无法核对当前群成员，请稍后重试。";
    if (!active()) return "仅限当前机器人的主人设置。";
    try {
      const { updateZzzPanelIntervals } = await import("../../lib/panel-zzz-settings.ts");
      const values = await updateZzzPanelIntervals(root, { [key]: value }, active, operation);
      if (operation.aborted) return [];
      return `绝区零刷新${label}间隔已设置为 ${values[key]} ${unit}。`;
    } catch {
      if (operation.aborted) return [];
      return active() ? "绝区零刷新间隔未保存，请稍后再试。" : "仅限当前机器人的主人设置。";
    }
  })();
}
