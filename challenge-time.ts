const offsets: Readonly<Record<string, string>> = {
  prod_gf_cn: '+08:00', prod_qd_cn: '+08:00',
  prod_gf_jp: '+08:00', prod_gf_sg: '+08:00', prod_gf_us: '-05:00', prod_gf_eu: '+01:00',
};

/** Official challenge calendar strings use the game server's fixed clock. */
export function zzzChallengeTime(value: unknown, region: string): number | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u.test(value)) return;
  const offset = offsets[region];
  if (!offset) return;
  const result = Date.parse(value.replace(' ', 'T') + offset);
  if (Number.isFinite(result)) return result;
}
