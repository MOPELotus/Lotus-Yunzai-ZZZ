import { profileCookieAccountId, type ProfileRequestContext } from "@lotus-yunzai/account";
import { HoyoRequestError, resolveZzzTuningRegion } from "@lotus-yunzai/hoyo-client";

export function zzzTuningProfile(source: ProfileRequestContext) {
  const accountId = profileCookieAccountId(source.account);
  if (!accountId) {
    throw new HoyoRequestError("invalid-input", "绝区零官方调频需要当前档案的有效登录账号，请重新登录。");
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
