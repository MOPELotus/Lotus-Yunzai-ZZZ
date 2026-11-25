import { zzzResourceDirectory } from "./card-theme.ts";
import { builtinResourceDirectory } from "../../lib/builtin-resources.ts";
import { fileURLToPath } from "node:url";
import { MAX_PROFILE_ID, ProfileError, type createProfileStore } from "@lotus-yunzai/account";
import { HoyoRequestError, ZzzTuningRateLimitError, type createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import type { MessageFallbackContext } from "../../lib/commands.ts";
import { sameZzzTuningProfile, zzzTuningProfile } from "./tuning-profile.ts";
import { inventoryFields, renderZzzInventoryCard } from "./tuning-inventory-card.ts";

const usage = "发送 #母带、#绝区零存货 或 %母带2 查询自己的实时调频库存。";
export const zzzInventoryCommand = /^#*(?:(?:绝区零|zzz)?母带|(?:绝区零|zzz)(?:存货|存量|囤货))\s*([1-9]\d{0,2})?$/iu;
const localTheme = builtinResourceDirectory("games/zzz-inventory");

type Context = Pick<MessageFallbackContext, "user_id" | "self_id" | "message" | "isDelegated" |
  "inlineImageByteLimit" | "privateCredentialSignal" | "groupActivitySignal"> & { readonly message_type?: string };

export function createZzzInventoryQuery(
  profiles: Pick<ReturnType<typeof createProfileStore>, "requestSelectedContext">,
  client: Pick<ReturnType<typeof createProfileHoyoClient>, "fetchZzzTuningInventory">,
  lifetime: AbortSignal,
  render = renderZzzInventoryCard,
) {
  return async (profileId: number, context: Context) => {
    if (lifetime.aborted) return;
    const { user_id: user, self_id: bot, message_type, message } = context;
    const connection = message_type === "group" ? context.groupActivitySignal
      : message_type === "private" ? context.privateCredentialSignal : undefined;
    if (!connection || context.isDelegated || !bot || !Number.isSafeInteger(bot) || bot < 1 ||
        !user || !Number.isSafeInteger(user) || user < 1 || user === bot) {
      return "请从自己的已连接 QQ 会话查询绝区零调频库存。";
    }
    if (Array.isArray(message) && message.some(segment => segment.type === "at" && String(segment.qq) !== String(bot))) {
      return "只能查询自己选中的绝区零档案。" + usage;
    }
    if (profileId > MAX_PROFILE_ID) return "档案编号须在 1 到 255 之间。";
    const signal = AbortSignal.any([lifetime, connection]);
    const qq = String(user);
    const changed = "绝区零档案已变化，请重新查询调频库存。";
    try {
      if (signal.aborted) return;
      const source = await profiles.requestSelectedContext(qq, profileId, "zzz");
      const identity = zzzTuningProfile(source);
      const result = await client.fetchZzzTuningInventory(source, { signal });
      signal.throwIfAborted();
      const latest = await profiles.requestSelectedContext(qq, profileId, "zzz").catch(() => undefined);
      if (!latest || result.uid !== identity.uid || !sameZzzTuningProfile(latest, identity, result.revision)) return changed;
      if (!inventoryFields.some(([field]) => result.inventory[field] !== undefined)) {
        return "米游社未返回该角色的实时调频库存。";
      }

      const rows = inventoryFields.map(([field, name]) => ({
        name, value: result.inventory[field]?.toLocaleString("zh-CN") ?? "—",
      }));
      const { uid, nickname, level } = latest.role;
      const text = ["绝区零调频库存", `档案 ${profileId} · UID ${uid}`, ...rows.map(({ name, value }) => `${name}：${value}`)].join("\n");
      const configured = Bun.env.LOTUS_SKIA_MODE;
      const inlineImageByteLimit = context.inlineImageByteLimit ?? 16 * 1024 * 1024;
      const output = await render({ qq, uid, nickname, level, rows }, {
        themeDirectory: Bun.env.LOTUS_ZZZ_INVENTORY_THEME_DIR?.trim() || localTheme,
        legacyResources: zzzResourceDirectory(), signal, inlineImageByteLimit,
        mode: configured === "gpu" || configured === "cpu" ? configured : "auto",
      }).catch(() => undefined);
      signal.throwIfAborted();
      const current = await profiles.requestSelectedContext(qq, profileId, "zzz").catch(() => undefined);
      if (signal.aborted) return;
      if (!sameZzzTuningProfile(current, identity, latest.revision)) return changed;
      if (output && output.png.byteLength <= inlineImageByteLimit) {
        return { type: "image" as const, file: output.png };
      }
      return text;
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "missing" || error.code === "login-required") return `请先登录档案 ${profileId}。`;
        if (error.code === "role-missing") return `档案 ${profileId} 未选中已认证的绝区零 UID。`;
        if (error.code === "changed") return changed;
      }
      if (error instanceof ZzzTuningRateLimitError) return "读取调频库存过于频繁，请稍后再试。";
      if (error instanceof HoyoRequestError) {
        if (error.code === "profile-changed") return changed;
        if (error.code === "invalid-input" || error.code === "refresh") return error.message;
      }
      return "绝区零调频库存暂时无法查询。";
    }
  };
}
