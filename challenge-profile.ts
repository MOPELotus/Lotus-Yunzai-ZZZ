import type { createProfileStore } from '@lotus-yunzai/account';
import { domesticRegion, rankIdentity } from './challenge-rank-model.ts';

/** Preserve domestic requirements; overseas requests need the verified OS identity. */
export async function readChallengeReminderContext(profiles: ReturnType<typeof createProfileStore>, qq: string, profileId: number) {
  const source = await profiles.requestSelectedContext(qq, profileId, 'zzz');
  if (!rankIdentity(source.role.uid, source.role.region)) return;
  if (domesticRegion(source.role.region)) return source.role.gameBiz === 'nap_cn' ? source : undefined;
  if (source.role.gameBiz === 'nap_global' && source.international &&
      /^[1-9]\d{0,19}$/u.test(source.international.accountId)) return source;
}
