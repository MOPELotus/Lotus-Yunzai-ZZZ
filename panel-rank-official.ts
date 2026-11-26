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
