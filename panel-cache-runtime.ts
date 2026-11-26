import { fileURLToPath } from "node:url";
import type { createProfileStore } from "@lotus-yunzai/account";
import type { createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { createZzzOfficialGroupPanels } from "./panel-rank-official.ts";
import { panelObject } from "./panel-detail.ts";

export function createZzzPanelCacheRefresh(profiles: ReturnType<typeof createProfileStore>,
  client: ReturnType<typeof createProfileHoyoClient>, lock: AcquireRoleArchiveLock, signal: AbortSignal,
  { directory = fileURLToPath(new URL("../../data/zzz-panel-refresh/", import.meta.url)), panelDirectory,
    now = Date.now }: { readonly directory?: string; readonly panelDirectory?: string; readonly now?: () => number } = {}) {
  const source = createZzzOfficialGroupPanels(profiles, client, lock, panelDirectory);
  const state = createRoleJsonArchive(directory, lock, { subject: "zzz-panel-refresh", lockSuffix: "panel-refresh", maxBytes: 4096 });
  let running: Promise<{ refreshed: number; failed: number; skipped: number }> | undefined;
  return () => {
    if (running) return running;
    const task = async () => {
      const counts = { refreshed: 0, failed: 0, skipped: 0 };
      signal.throwIfAborted();
      const slots = (await profiles.listCheckinProfiles()).filter(row => row.loggedIn);
      const loggedIn = new Set(slots.map(row => `${row.qq}:${row.profileId}`));
      const members = new Set(slots.map(row => Number(row.qq)));
      const entries = (await source.list(members, signal)).filter(row => loggedIn.has(`${row.qq}:${row.profileId}`));
      let next = 0;
      const worker = async () => {
        while (next < entries.length && !signal.aborted) {
          const entry = entries[next++]!;
          const identity = { qq: String(entry.qq), uid: entry.role.uid };
          const before = panelObject(await state.read(identity.qq, identity.uid));
          const success = Number(before.refreshedAt) || 0;
          const attempted = Number(before.attemptedAt) || 0;
          if ((success && now() - success < 3_600_000) || (attempted && now() - attempted < 900_000)) {
            counts.skipped++;
            continue;
          }
          let refreshedAt = success;
          try {
            await source.read(entry, signal, async () => { signal.throwIfAborted(); }, undefined);
            refreshedAt = now();
            counts.refreshed++;
          } catch {
            if (signal.aborted) break;
            counts.failed++;
          }
          await state.update(identity, async () => { signal.throwIfAborted(); }, () => ({
            document: { attemptedAt: now(), refreshedAt }, result: undefined,
          }));
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, entries.length) }, worker));
      return counts;
    };
    running = task().finally(() => { running = undefined; });
    return running;
  };
}
