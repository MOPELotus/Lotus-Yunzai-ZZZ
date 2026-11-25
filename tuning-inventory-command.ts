import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import { zzzResourceDirectory } from "./card-theme.ts";
import { builtinResourceDirectory } from "../../lib/builtin-resources.ts";
import { fileURLToPath } from "node:url";
import { MAX_PROFILE_ID, ProfileError, type createProfileStore } from "@lotus-yunzai/account";
import { HoyoRequestError, ZzzTuningRateLimitError, type createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import type { MessageFallbackContext } from "../../lib/commands.ts";
import { sameZzzTuningProfile, zzzTuningProfile } from "./tuning-profile.ts";
import { inventoryFields, renderZzzInventoryCard } from "./tuning-inventory-card.ts";

const usage = $t("tuning-inventory-command.text_6c985534ba");
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
      return $t("tuning-inventory-command.text_c088f123b0");
    }
    if (Array.isArray(message) && message.some(segment => segment.type === "at" && String(segment.qq) !== String(bot))) {
      return $t("tuning-inventory-command.text_eed183658b") + usage;
    }
    if (profileId > MAX_PROFILE_ID) return $t("tuning-inventory-command.text_3dd62228d2");
    const signal = AbortSignal.any([lifetime, connection]);
    const qq = String(user);
    const changed = $t("tuning-inventory-command.text_70768e9155");
    try {
      if (signal.aborted) return;
      const source = await profiles.requestSelectedContext(qq, profileId, "zzz");
      const identity = zzzTuningProfile(source);
      const result = await client.fetchZzzTuningInventory(source, { signal });
      signal.throwIfAborted();
      const latest = await profiles.requestSelectedContext(qq, profileId, "zzz").catch(() => undefined);
      if (!latest || result.uid !== identity.uid || !sameZzzTuningProfile(latest, identity, result.revision)) return changed;
      if (!inventoryFields.some(([field]) => result.inventory[field] !== undefined)) {
        return $t("tuning-inventory-command.text_959fa848a6");
      }

      const rows = inventoryFields.map(([field, name]) => ({
        name, value: result.inventory[field]?.toLocaleString("zh-CN") ?? "—",
      }));
      const { uid, nickname, level } = latest.role;
      const text = [$t("tuning-inventory-command.text_367fe81399"), $t("tuning-inventory-command.text_1397b2ffaf", { "profileId": profileId, "uid": uid }), ...rows.map(({ name, value }) => `${name}：${value}`)].join("\n");
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
        if (error.code === "missing" || error.code === "login-required") return $t("tuning-inventory-command.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") return $t("tuning-inventory-command.text_f4a9dc8367", { "profileId": profileId });
        if (error.code === "changed") return changed;
      }
      if (error instanceof ZzzTuningRateLimitError) return $t("tuning-inventory-command.text_c04ba77a99");
      if (error instanceof HoyoRequestError) {
        if (error.code === "profile-changed") return changed;
        if (error.code === "invalid-input" || error.code === "refresh") return error.message;
      }
      return $t("tuning-inventory-command.text_b4eff6df29");
    }
  };
}
