import { ProfileError, type createProfileStore } from "@lotus-yunzai/account";
import type { createHoyoClient, ZzzTuningOptions } from "@lotus-yunzai/hoyo-client";
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
) {
  const history = createRoleJsonArchive(directory, acquireLock, { subject: "绝区零调频历史", lockSuffix: "lotus-tuning" });
  return {
    async read(qq: string, role: Omit<ZzzTuningIdentity, "profileId">) {
      return readZzzTuningHistory(await history.read(qq, role.uid), role);
    },
    async sync(qq: string, profileId = 1, options: ZzzTuningOptions = {}) {
      const original = await profiles.requestContext(qq, profileId, "zzz");
      const uid = original.role.uid;
      const observed = JSON.stringify(await history.read(qq, uid));
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

      return history.update({ qq, uid }, verifyProfile, (previous) => {
        // An earlier request can finish later with older official data. Publish only against the snapshot it started from.
        if (JSON.stringify(previous) !== observed) throw new ZzzTuningHistoryChangedError();
        const result = prepareZzzTuningUpdate(previous, latest, { uid, region: latest.region, profileId });
        return { document: result.stats, result: { ...result, refreshedCookie: latest.refreshedCookie } };
      });
    },
  };
}
