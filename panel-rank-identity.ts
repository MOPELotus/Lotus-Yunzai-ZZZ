import { createHash } from "node:crypto";
import { ProfileError, type createProfileStore } from "@lotus-yunzai/account";
import type { createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import { rankIdentity } from "./challenge-rank-model.ts";
import { ownedRankRole } from "./challenge-rank.ts";
import { zzzPanelRegion } from "./panel-storage.ts";

type InternationalMode = "selected" | "international";
type Mode = "cn" | InternationalMode;
const internationalRankValue = /^(selected|international):(prod_gf_(?:jp|us|eu|sg)):([1-9]\d{9}):([a-f0-9]{64})$/u;
type InternationalContext = NonNullable<Awaited<ReturnType<ReturnType<typeof createProfileStore>["internationalRoleContext"]>>>;
type OpenZzzCheckin = ReturnType<typeof createProfileHoyoClient>["openHoYoLabZzzCheckin"];
export type ZzzPanelRankRoleReader = (...args: Parameters<OpenZzzCheckin>) => Promise<Pick<Awaited<ReturnType<OpenZzzCheckin>>, "roles">>;

export interface ZzzPanelRankIdentity {
  readonly uid: string;
  readonly region: string;
  readonly revision: string;
  readonly value: string;
}

export function panelRankMode(value: string): Mode | undefined {
  if (/^prod_(?:gf|qd)_cn:[1-9]\d{7,8}$/u.test(value)) return "cn";
  const match = internationalRankValue.exec(value);
  if (match) return match[1] as InternationalMode;
}

function accountFingerprint({ realm, accountId }: Pick<InternationalContext, "realm" | "accountId">) {
  return createHash("sha256").update(JSON.stringify([realm, accountId])).digest("hex");
}

export function createPanelRankIdentityReader(profiles: ReturnType<typeof createProfileStore>,
  client: { openHoYoLabZzzCheckin: ZzzPanelRankRoleReader }, signal: AbortSignal) {
  const catalogues = new Map<string, ReturnType<ZzzPanelRankRoleReader>>();

  function catalogue(qq: string, profileId: number, source: InternationalContext) {
    const key = `${qq}:${profileId}:${source.revision}`;
    let pending = catalogues.get(key);
    if (!pending) {
      pending = client.openHoYoLabZzzCheckin(source, {
        signal,
        async verifyProfile() {
          const latest = await profiles.internationalRoleContext(qq, profileId, "zzz");
          if (latest?.revision !== source.revision) throw new ProfileError("changed", "国际服账号档案已变化。");
        },
      });
      catalogues.set(key, pending);
    }
    return pending;
  }

  async function international(qq: string, profileId: number, mode: InternationalMode, expected?: string): Promise<ZzzPanelRankIdentity | undefined> {
    const source = await profiles.internationalRoleContext(qq, profileId, "zzz");
    if (!source || (expected !== undefined && source.revision !== expected) || signal.aborted ||
        (mode === "selected" && !/^[1-9]\d{9}$/u.test(source.selectedUid))) return;
    const { roles } = await catalogue(qq, profileId, source);
    // Reject ambiguous server claims even if the account's cookie is valid.
    const valid = roles.filter(role => zzzPanelRegion(role.uid, role.region, role.gameBiz) === role.region);
    const wanted = mode === "selected" ? valid.filter(role => role.uid === source.selectedUid) :
      roles.length === 1 ? valid : valid.filter(role => role.chosen);
    const role = wanted.length === 1 ? wanted[0] : undefined;
    if (!role || signal.aborted) return;
    const fingerprint = accountFingerprint(source);
    return { uid: role.uid, region: role.region, revision: source.revision,
      value: `${mode}:${role.region}:${role.uid}:${fingerprint}` };
  }

  async function authorize(qq: string, profileId: number, mode?: Mode, expected?: string): Promise<ZzzPanelRankIdentity | undefined> {
    if (mode === "international" || mode === "selected") return international(qq, profileId, mode, expected).catch(() => undefined);
    const source = await ownedRankRole(profiles, qq, profileId).catch(() => undefined);
    if (source) {
      if (expected !== undefined && source.revision !== expected) return;
      const { uid, region } = source.role;
      const value = rankIdentity(uid, region)!;
      return { uid, region, revision: source.revision, value };
    }
    if (mode !== "cn") return international(qq, profileId, "selected", expected).catch(() => undefined);
  }

  async function registered(qq: string, profileId: number, value: string, expected?: string): Promise<ZzzPanelRankIdentity | undefined> {
    if (signal.aborted) return;
    if (panelRankMode(value) === "cn") {
      const current = await authorize(qq, profileId, "cn", expected);
      return !signal.aborted && current?.value === value ? current : undefined;
    }

    const match = internationalRankValue.exec(value);
    if (!match) return;
    const [, mode, region, uid, fingerprint] = match;
    if (!uid || !region || zzzPanelRegion(uid, region, "nap_global") !== region) return;
    // Registration already proved the role against the owner's account directory.
    const source = await profiles.internationalRoleContext(qq, profileId, "zzz").catch(() => undefined);
    if (!source || signal.aborted || (expected !== undefined && source.revision !== expected) ||
        accountFingerprint(source) !== fingerprint || (mode === "selected" && source.selectedUid !== uid)) return;
    return { uid, region, revision: source.revision, value };
  }

  return Object.assign(authorize, { registered });
}
