import { gameCommandProfileId } from "@lotus-yunzai/account";

export function zzzCommandProfileSuffix(profileId: number) {
  return profileId === 1 && gameCommandProfileId("zzz") === 1 ? "" : String(profileId);
}
