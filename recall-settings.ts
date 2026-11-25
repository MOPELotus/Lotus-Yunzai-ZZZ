import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
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
    if (!connection || !allowed()) return transient($t("recall-settings.text_c4a86edeab"));
    const next = Number(match[1]);
    if (!Number.isSafeInteger(next) || next > maxZzzRecallSeconds) return transient($t("recall-settings.text_29a1b7bb7b", { "maxZzzRecallSeconds": maxZzzRecallSeconds }));

    const operation = AbortSignal.any([signal, connection]);
    const group = rankGroup(context);
    return (async () => {
      if (group && !await rankMembership(context, group.actor)) return transient($t("recall-settings.text_52871380fe"));
      try {
        const { updateZzzPanelIntervals } = await import("../../lib/panel-zzz-settings.ts");
        await updateZzzPanelIntervals(root, { recallMsg: next }, allowed, operation, undefined, legacyResources);
        return next ? $t("recall-settings.text_0d86667f23", { "next": next }) : $t("recall-settings.text_aa614ea32a");
      } catch {
        if (!operation.aborted) return transient(allowed() ? $t("recall-settings.text_e8ff6be601") : $t("recall-settings.text_c4a86edeab"));
        return [];
      }
    })();
  }

  return { transient, setting };
}
