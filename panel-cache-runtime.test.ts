import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { createProfileStore, ProfileRequestContext } from "@lotus-yunzai/account";
import type { createProfileHoyoClient, ZzzPanelAvatar } from "@lotus-yunzai/hoyo-client";
import { lockFile } from "../../lib/file-lock.ts";
import { createZzzPanelCacheRefresh } from "./panel-cache-runtime.ts";
import { createZzzCachedGroupPanels } from "./panel-rank-official.ts";

test("绝区零面板缓存：查询零远程请求及后台刷新去重、限频与失败保留旧缓存", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-zzz-cache-"));
  const signal = new AbortController().signal;
  let clock = 1_000_000, calls = 0, requests = 0, fail = false, loggedIn = true;
  const role = (qq: string) => ({ uid: String(10000000 + Number(qq)), region: "prod_gf_cn", gameBiz: "nap_cn", nickname: "", chosen: true });
  const profiles = {
    async listCheckinProfiles() { return [{ qq: "42", profileId: 1, loggedIn }, { qq: "42", profileId: 2, loggedIn }, { qq: "43", profileId: 1, loggedIn }]; },
    async savedRole(qq: string) { return role(qq); },
    async requestContext(qq: string, profileId: number) {
      requests++;
      if (!loggedIn) throw Error("logged out");
      return { qq, profileId, game: "zzz", role: role(qq), revision: "r1" } as ProfileRequestContext;
    },
  } as unknown as ReturnType<typeof createProfileStore>;
  const client = { async fetchZzzPanel(source: ProfileRequestContext) {
    calls++;
    await Bun.sleep(10);
    if (fail && source.qq === "43") throw Error("upstream offline");
    const avatar: ZzzPanelAvatar = { id: 1011, name_mi18n: "安比", rarity: "A", rank: 0, level: fail ? 60 : 30 };
    return { uid: source.role.uid, region: source.role.region, avatars: [avatar], missingIds: [], revision: source.revision };
  } } as unknown as ReturnType<typeof createProfileHoyoClient>;
  const options = { directory: join(root, "state"), panelDirectory: join(root, "panels"), now: () => clock };
  try {
    const refresh = createZzzPanelCacheRefresh(profiles, client, lockFile, signal, options);
    const first = refresh();
    expect(refresh()).toBe(first);
    expect(await first).toEqual({ refreshed: 2, failed: 0, skipped: 0 });
    expect(calls).toBe(2);
    expect(await refresh()).toEqual({ refreshed: 0, failed: 0, skipped: 2 });
    clock += 3_600_000; fail = true;
    expect(await refresh()).toEqual({ refreshed: 1, failed: 1, skipped: 0 });
    const restart = createZzzPanelCacheRefresh(profiles, client, lockFile, signal, options);
    expect(await restart()).toEqual({ refreshed: 0, failed: 0, skipped: 2 });
    const cached = createZzzCachedGroupPanels(profiles, client, lockFile, options.panelDirectory);
    const entries = await cached.list(new Set([42, 43]), signal);
    const before = { calls, requests };
    loggedIn = false;
    const rows = await Promise.all(entries.map(entry => cached.read(entry, signal, async () => {})));
    expect(rows.map(row => row[0]?.level)).toEqual([60, 30]);
    expect({ calls, requests }).toEqual(before);
  } finally { await rm(root, { recursive: true, force: true }); }
});
