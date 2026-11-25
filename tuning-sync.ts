import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import { isDeepStrictEqual } from "node:util";
import { ProfileError, type createProfileStore } from "@lotus-yunzai/account";
import { resolveZzzTuningRegion, type createHoyoClient, type ZzzTuningOptions } from "@lotus-yunzai/hoyo-client";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { prepareZzzTuningUpdate, readZzzTuningHistory, type ZzzTuningIdentity } from "./tuning-history.ts";

export class ZzzTuningHistoryChangedError extends Error {
  constructor() {
    super($t("tuning-sync.text_8ab3d9e0c7"));
  }
}

export function createZzzTuningSync(
  profiles: Pick<ReturnType<typeof createProfileStore>, "requestSelectedContext">,
  client: Pick<ReturnType<typeof createHoyoClient>, "fetchZzzTuning">,
  directory: string,
  acquireLock: AcquireRoleArchiveLock,
  retiredDirectories: readonly string[] = [],
) {
  const history = createRoleJsonArchive(directory, acquireLock, { subject: $t("tuning-sync.text_43a385001a"), lockSuffix: "lotus-tuning" });
  const retired = retiredDirectories.map(directory => createRoleJsonArchive(directory, acquireLock,
    { subject: $t("tuning-sync.text_239befcbb1"), lockSuffix: "lotus-tuning", maxBytes: 32 * 1024 * 1024, rejectNull: true }));

  async function readRetired(qq: string, role: Omit<ZzzTuningIdentity, "profileId">) {
    const snapshots = await Promise.all(retired.map(async archive =>
      readZzzTuningHistory(await archive.read(qq, role.uid), role)));
    const available = snapshots.filter(snapshot => snapshot !== null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const newest = available[0];
    if (newest && available.some(item => item.updatedAt === newest.updatedAt && !isDeepStrictEqual(item, newest))) {
      throw new Error($t("tuning-sync.text_1142b81c02"));
    }
    return newest ?? null;
  }

  return {
    async read(qq: string, role: Omit<ZzzTuningIdentity, "profileId">) {
      const current = await history.read(qq, role.uid);
      return readZzzTuningHistory(current, role) ?? await readRetired(qq, role);
    },
    async sync(qq: string, profileId = 1, options: ZzzTuningOptions = {}) {
      const original = await profiles.requestSelectedContext(qq, profileId, "zzz");
      const uid = original.role.uid;
      const current = await history.read(qq, uid);
      const role = { uid, region: resolveZzzTuningRegion(original) };
      const observed = current ?? await readRetired(qq, role);
      const latest = await client.fetchZzzTuning(original, options);
      if (latest.uid !== uid || latest.region !== role.region) throw new Error($t("tuning-sync.text_30ed134dfa"));

      async function verifyProfile() {
        options.signal?.throwIfAborted();
        const current = await profiles.requestSelectedContext(qq, profileId, "zzz").catch(() => undefined);
        if (current?.revision !== latest.revision || current?.role.uid !== uid) {
          throw new ProfileError("changed", $t("tuning-sync.text_0de5760ae7"));
        }
        options.signal?.throwIfAborted();
      }

      return history.update({ qq, uid }, verifyProfile, async (previous) => {
        // An earlier request can finish later with older official data. Publish only against the snapshot it started from.
        const baseline = previous ?? await readRetired(qq, role);
        if ((current === null) !== (previous === null) || !isDeepStrictEqual(baseline, observed)) {
          throw new ZzzTuningHistoryChangedError();
        }
        const result = prepareZzzTuningUpdate(baseline, latest, { uid, region: latest.region, profileId });
        return { document: result.stats, result: { ...result, refreshedCookie: latest.refreshedCookie } };
      });
    },
  };
}
