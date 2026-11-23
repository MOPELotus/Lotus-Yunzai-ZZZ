import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseDocument } from "yaml";
import type { RecallableCommandReply } from "../../lib/commands.ts";
import { updateLocalConfiguration } from "../../lib/lotus-global-config-write.ts";
import { rankGroup, rankMembership, type ChallengeRankContext } from "./challenge-rank.ts";
import { zzzPanelConfigFile, zzzPrefixedCommand } from "./panel-command.ts";
import { ownsZzzManagement } from "./role-alias-command.ts";

const installation = new URL("../../", import.meta.url);
const maximum = 120;
const fallbackSeconds = 100;

async function configured(file: string) {
  try {
    const value = Bun.YAML.parse(await readFile(file, "utf8")) as { recallMsg?: unknown } | undefined;
    return value?.recallMsg;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export function createZzzRecallSettings(signal: AbortSignal, root = installation,
  legacyResources = Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR?.trim()) {
  const file = zzzPanelConfigFile(root);
  async function seconds() {
    const value = await configured(file) ?? (legacyResources && await configured(join(dirname(legacyResources), "config", "config.yaml")));
    const number = typeof value === "number" || (typeof value === "string" && value.trim()) ? Number(value) : NaN;
    return Number.isFinite(number) && number >= 0 ? Math.min(Math.floor(number), maximum) : fallbackSeconds;
  }

  async function transient<T>(reply: T | Promise<T>): Promise<T | RecallableCommandReply> {
    const value = await reply;
    if (typeof value !== "string" || !value) return value;
    const delay = await seconds().catch(() => fallbackSeconds);
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
    if (!Number.isSafeInteger(next) || next > maximum) return transient(`撤回时间须在 0 到 ${maximum} 秒之间。`);

    const operation = AbortSignal.any([signal, connection]);
    const group = rankGroup(context);
    return (async () => {
      if (group && !await rankMembership(context, group.actor)) return transient("暂无法核对当前群成员，请稍后再试。");
      try {
        await updateLocalConfiguration(root, "zzz-panel", { override: file, signal: operation, canWrite: allowed, canCommit: allowed,
          prepare(current) {
            const yaml = parseDocument(current);
            if (yaml.errors.length) throw yaml.errors[0];
            yaml.set("recallMsg", next);
            return { yaml: yaml.toString(), value: undefined };
          },
        });
        return next ? `绝区零提示消息撤回时间已设置为 ${next} 秒。` : "绝区零提示消息已关闭自动撤回。";
      } catch {
        if (!operation.aborted) return transient(allowed() ? "绝区零撤回时间未保存，请稍后再试。" : "仅限当前机器人的主人设置。");
        return [];
      }
    })();
  }

  return { transient, setting };
}
