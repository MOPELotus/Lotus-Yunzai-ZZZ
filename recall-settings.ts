import { zzzResourceDirectory } from "./card-theme.ts";
import type { RecallableCommandReply } from "../../lib/commands.ts";
import { defaultZzzRecallSeconds, maxZzzRecallSeconds, readZzzRecallSeconds } from "../../lib/zzz-recall-config.ts";
import { rankGroup, rankMembership, type ChallengeRankContext } from "./challenge-rank.ts";
import { zzzPanelConfigFile, zzzPrefixedCommand } from "./panel-command.ts";
import { ownsZzzManagement } from "./role-alias-command.ts";

const installation = new URL("../../", import.meta.url);

export function createZzzRecallSettings(signal: AbortSignal, root = installation,
  legacyResources = zzzResourceDirectory()?.trim()) {
  const file = zzzPanelConfigFile(root);

  async function transient<T>(reply: T | Promise<T>): Promise<T | RecallableCommandReply> {
    const value = await reply;
    if (typeof value !== "string" || !value) return value;
    const delay = await readZzzRecallSeconds(file, legacyResources).catch(() => defaultZzzRecallSeconds);
    return delay > 0 ? { type: "recallable", message: value, seconds: delay } : value;
  }

  function setting(message: string, context: ChallengeRankContext & { readonly groupActivitySignal?: AbortSignal }) {
    const command = zzzPrefixedCommand(message);
    const match = command && /^设置撤回时间\s*(\d+)$/u.exec(command);
    if (!match) return;
    const connection = context.message_type === "group" ? context.groupActivitySignal : context.privateCredentialSignal;
    const allowed = () => connection?.aborted === false && ownsZzzManagement(context, signal);
    if (!connection || !allowed()) return transient("仅限当前机器人的主人设置。");
    const next = Number(match[1]);
    if (!Number.isSafeInteger(next) || next > maxZzzRecallSeconds) return transient(`撤回时间须在 0 到 ${maxZzzRecallSeconds} 秒之间。`);

    const operation = AbortSignal.any([signal, connection]);
    const group = rankGroup(context);
    return (async () => {
      if (group && !await rankMembership(context, group.actor)) return transient("暂无法核对当前群成员，请稍后再试。");
      try {
        const { updateZzzPanelIntervals } = await import("../../lib/panel-zzz-settings.ts");
        await updateZzzPanelIntervals(root, { recallMsg: next }, allowed, operation, undefined, legacyResources);
        return next ? `绝区零提示消息撤回时间已设置为 ${next} 秒。` : "绝区零提示消息已关闭自动撤回。";
      } catch {
        if (!operation.aborted) return transient(allowed() ? "绝区零撤回时间未保存，请稍后再试。" : "仅限当前机器人的主人设置。");
        return [];
      }
    })();
  }

  return { transient, setting };
}
