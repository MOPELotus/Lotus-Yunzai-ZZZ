import { isDeepStrictEqual } from "node:util";
import { ProfileError, type createProfileStore } from "@lotus-yunzai/account";
import { resolveZzzTuningRegion, type createHoyoClient, type ZzzTuningOptions } from "@lotus-yunzai/hoyo-client";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { prepareZzzTuningUpdate, readZzzTuningHistory, type ZzzTuningIdentity } from "./tuning-history.ts";

export class ZzzTuningHistoryChangedError extends Error {
  constructor() {
    super("绝区零调频历史已更新，请重新发起请求。");
  }
}

export function createZzzTuningSync(
  profiles: Pick<ReturnType<typeof createProfileStore>, "requestContext">,
  client: Pick<ReturnType<typeof createHoyoClient>, "fetchZzzTuning">,
  directory: string,
  acquireLock: AcquireRoleArchiveLock,
  retiredDirectories: readonly string[] = [],
) {
  const history = createRoleJsonArchive(directory, acquireLock, { subject: "绝区零调频历史", lockSuffix: "lotus-tuning" });
  const retired = retiredDirectories.map(directory => createRoleJsonArchive(directory, acquireLock,
    { subject: "绝区零旧调频汇总", lockSuffix: "lotus-tuning", maxBytes: 32 * 1024 * 1024, rejectNull: true }));

  async function readRetired(qq: string, role: Omit<ZzzTuningIdentity, "profileId">) {
    const snapshots = await Promise.all(retired.map(async archive =>
      readZzzTuningHistory(await archive.read(qq, role.uid), role)));
    const available = snapshots.filter(snapshot => snapshot !== null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const newest = available[0];
    if (newest && available.some(item => item.updatedAt === newest.updatedAt && !isDeepStrictEqual(item, newest))) {
      throw new Error("两处绝区零旧调频汇总内容冲突。");
    }
    return newest ?? null;
  }

  return {
    async read(qq: string, role: Omit<ZzzTuningIdentity, "profileId">) {
      const current = await history.read(qq, role.uid);
      return readZzzTuningHistory(current, role) ?? await readRetired(qq, role);
    },
    async sync(qq: string, profileId = 1, options: ZzzTuningOptions = {}) {
      const original = await profiles.requestContext(qq, profileId, "zzz");
      const uid = original.role.uid;
      const current = await history.read(qq, uid);
      const role = { uid, region: resolveZzzTuningRegion(original) };
      const observed = current ?? await readRetired(qq, role);
      const latest = await client.fetchZzzTuning(original, options);
      if (latest.uid !== uid) throw new Error("绝区零调频快照与请求角色不一致。");

      async function verifyProfile() {
        options.signal?.throwIfAborted();
        const current = await profiles.requestContext(qq, profileId, "zzz", uid).catch(() => undefined);
        if (current?.revision !== latest.revision || current?.role.uid !== uid) {
          throw new ProfileError("changed", "保存绝区零调频历史时档案已变更，请重新发起请求。");
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
