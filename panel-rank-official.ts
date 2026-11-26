import type { createProfileStore } from "@lotus-yunzai/account";
import type { createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import type { AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { createOfficialGroupPanels } from "../../lib/group-panel-accounts.ts";
import { createZzzPanelStorage, zzzPanelRegion } from "./panel-storage.ts";
import { parseZzzPanelConfig, readZzzPanelConfigDocument } from "./panel-command.ts";
import { zzzResourceDirectory } from "./card-theme.ts";

export function createZzzOfficialGroupPanels(profiles: ReturnType<typeof createProfileStore>,
  client: ReturnType<typeof createProfileHoyoClient>, lock: AcquireRoleArchiveLock, directory?: string) {
  const archive = createZzzPanelStorage(lock, { managed: directory });
  return createOfficialGroupPanels(profiles, "zzz", async (source, signal) => {
    const { roleInterval } = parseZzzPanelConfig(await readZzzPanelConfigDocument(zzzResourceDirectory()));
    return client.fetchZzzPanel(source, { signal, roleInterval });
  }, async (result, entry, verify) => {
    const region = zzzPanelRegion(entry.role.uid, entry.role.region, entry.role.gameBiz);
    if (result.uid !== entry.role.uid || result.region !== region) throw new Error("group-panel-role-changed");
    const rows = await archive.merge({ qq: String(entry.qq), uid: entry.role.uid, region: result.region }, result.avatars, verify);
    const fresh = new Set(result.avatars.map(row => row.id));
    return rows.filter(row => fresh.has(row.id));
  });
}

export function createZzzCachedGroupPanels(profiles: ReturnType<typeof createProfileStore>,
  client: ReturnType<typeof createProfileHoyoClient>, lock: AcquireRoleArchiveLock, directory?: string) {
  const accounts = createZzzOfficialGroupPanels(profiles, client, lock, directory);
  const archive = createZzzPanelStorage(lock, { managed: directory });
  return {
    list: accounts.list,
    async read(entry: import("../../lib/group-panel-accounts.ts").GroupPanelAccount, signal: AbortSignal,
      verifyAuthority: () => Promise<void>) {
      const verify = async () => {
        signal.throwIfAborted();
        await verifyAuthority();
        const role = await profiles.savedRole(String(entry.qq), entry.profileId, "zzz");
        if (role.uid !== entry.role.uid || role.region !== entry.role.region || role.gameBiz !== entry.role.gameBiz) {
          throw new Error("group-panel-role-changed");
        }
      };
      await verify();
      const region = zzzPanelRegion(entry.role.uid, entry.role.region, entry.role.gameBiz);
      if (!region) throw new Error("group-panel-region-changed");
      const rows = await archive.read({ qq: String(entry.qq), uid: entry.role.uid, region });
      await verify();
      return rows;
    },
  };
}
