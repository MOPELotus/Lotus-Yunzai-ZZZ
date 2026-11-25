import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import { profileCookieAccountId, type ProfileRequestContext } from "@lotus-yunzai/account";
import { HoyoRequestError, resolveZzzTuningRegion } from "@lotus-yunzai/hoyo-client";

export function zzzTuningProfile(source: ProfileRequestContext) {
  const accountId = profileCookieAccountId(source.account);
  if (!accountId) {
    throw new HoyoRequestError("invalid-input", $t("tuning-profile.text_17af6f3e46"));
  }
  return { accountId, uid: source.role.uid, region: resolveZzzTuningRegion(source) };
}

export function sameZzzTuningProfile(
  source: ProfileRequestContext | undefined, expected: ReturnType<typeof zzzTuningProfile>, revision: string,
) {
  if (!source || source.revision !== revision || source.role.uid !== expected.uid) return false;
  try {
    const current = zzzTuningProfile(source);
    return current.accountId === expected.accountId && current.region === expected.region;
  } catch {
    return false;
  }
}
