import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import { rankGroup, rankMembership, type ChallengeRankContext } from "./challenge-rank.ts";
import { zzzPrefixedCommand } from "./panel-command.ts";
import { ownsZzzManagement } from "./role-alias-command.ts";

const installation = new URL("../../", import.meta.url);

export function zzzPanelIntervalCommand(message: string,
  context: ChallengeRankContext & { readonly groupActivitySignal?: AbortSignal }, signal: AbortSignal, root = installation) {
  const command = zzzPrefixedCommand(message);
  if (!command) return;
  if (/^刷新面板间隔\s*\d+$/u.test(command)) {
    return $t("panel-interval-command.text_cee1266877");
  }
  const match = /^刷新角色间隔\s*(\d+)$/u.exec(command);
  if (!match) return;
  const connection = context.message_type === "group" ? context.groupActivitySignal : context.privateCredentialSignal;
  const active = () => connection?.aborted === false && ownsZzzManagement(context, signal);
  if (!connection || !active()) return $t("panel-interval-command.text_c4a86edeab");

  const roleInterval = Number(match[1]);
  if (!Number.isSafeInteger(roleInterval) || roleInterval < 100 || roleInterval > 10000) {
    return $t("panel-interval-command.text_8bb988250b");
  }
  const operation = AbortSignal.any([signal, connection]);
  const group = rankGroup(context);
  return (async () => {
    if (group && !await rankMembership(context, group.actor)) return $t("panel-interval-command.text_f9fd277d3d");
    if (!active()) return $t("panel-interval-command.text_c4a86edeab");
    try {
      const { updateZzzPanelIntervals } = await import("../../lib/panel-zzz-settings.ts");
      const values = await updateZzzPanelIntervals(root, { roleInterval }, active, operation);
      if (operation.aborted) return [];
      return $t("panel-interval-command.text_b960d43924", { "roleInterval": values.roleInterval });
    } catch {
      if (operation.aborted) return [];
      return active() ? $t("panel-interval-command.text_aa3658a370") : $t("panel-interval-command.text_c4a86edeab");
    }
  })();
}
