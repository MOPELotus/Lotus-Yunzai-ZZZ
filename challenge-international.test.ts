import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProfileStore } from '@lotus-yunzai/account';
import { normalizeZzzVoidFront, type ZzzShiyuSnapshot } from '@lotus-yunzai/hoyo-client';
import { readChallengeReminderContext } from './challenge-profile.ts';
import { ownedRankRole } from './challenge-rank.ts';
import { currentPeriod, rankIdentity, sortedRankRows, type RankRow } from './challenge-rank-model.ts';
import { zzzChallengeTime } from './challenge-time.ts';
import { renderZzzChallengeStatus } from './challenge-reminder.ts';

const regions = [ ['1000000001','prod_gf_us'], ['1500000001','prod_gf_eu'], ['1300000001','prod_gf_jp'], ['1700000001','prod_gf_sg'] ] as const;
const period = { start:'2026-11-20 04:00:00', end:'2026-11-30 04:00:00' };

function snapshot(uid: string, region: string): ZzzShiyuSnapshot {
 return {uid,region,status:'available',scheduleType:1,period,layers:[],clearedSRanks:0};
}

test('international challenge identities and periods use all four server clocks',()=>{
 for(const [uid,region] of regions)expect(rankIdentity(uid,region)).toBe(`${region}:${uid}`);
 expect(rankIdentity('12345678','prod_gf_us')).toBeUndefined();
 expect(rankIdentity('1000000001','prod_gf_cn')).toBeUndefined();
 expect(rankIdentity('1000000001','prod_gf_unknown')).toBeUndefined();
 const reset=Date.parse('2026-11-20T00:00:00Z');
 expect(currentPeriod(snapshot('1000000001','prod_gf_us'),reset)).toBeUndefined();
 expect(currentPeriod(snapshot('1500000001','prod_gf_eu'),reset)).toBeUndefined();
 expect(currentPeriod(snapshot('1300000001','prod_gf_jp'),reset)).toBe(Date.parse('2026-11-30T04:00:00+08:00'));
 expect(zzzChallengeTime(period.start,'prod_gf_us')).toBe(Date.parse('2026-11-20T04:00:00-05:00'));
 expect(zzzChallengeTime(period.start,'prod_gf_eu')).toBe(Date.parse('2026-11-20T04:00:00+01:00'));
 expect(zzzChallengeTime(period.start,'unknown')).toBeUndefined();
});

test('international mixed-region boards never mix an old and new official calendar period',()=>{
 const row:RankRow={qq:'42',profileId:1,uid:'1000000001',region:'prod_gf_us',nickname:'fixture',score:100,bonus:0,latest:1,expiresAt:Number.MAX_SAFE_INTEGER,teams:[],source:'current',periodKey:period.start};
 const newer={...row,uid:'1300000001',region:'prod_gf_jp' as const,score:1,periodKey:'2026-12-01 04:00:00'};
 expect(sortedRankRows('ABYSS',[row,newer])).toEqual([newer]);
 expect(sortedRankRows('ABYSS',[row,{...row,uid:'1700000001',region:'prod_gf_sg',score:200}]).length).toBe(2);
});

test('overseas challenge visibility and reminders require verified account-owned directory',async()=>{
 const root=await mkdtemp(join(tmpdir(),'lotus-zzz-os-challenge-'));
 const file=join(root,'42.yaml');
 function profile(uid:string,region:string,verified=true,owned=true){return [
  'user: { qq: "42" }','profile: { id: 1 }','account:',
  `  current_uid: { zzz: "${uid}" }`,
  `  game_roles: { zzz: [{ uid: "${uid}", region: ${region}, game_biz: nap_global }] }`,
  'games:','  os:', '    cookie: "account_id=81; cookie_token=fixture-cookie"',
  '    enable: false','    zzz: { checkin: false }',
  ...(verified?['    verified_account_id: "81"','    verified_realm: SG','    verified_activity_cookie: "ltuid=81; ltoken=fixture-activity"']:[]),
  `    current_uid: { zzz: "${uid}" }`,
  ...(owned?[`    game_roles: { zzz: [{ uid: "${uid}", region: ${region}, game_biz: nap_global }] }`]:[]),
 ].join('\n')}
 try{
  const profiles=createProfileStore(root);
  for(const [uid,region] of regions){
   await writeFile(file,profile(uid,region));
   expect((await ownedRankRole(profiles,'42',1))?.role).toMatchObject({uid,region,gameBiz:'nap_global'});
   expect((await readChallengeReminderContext(profiles,'42',1))?.international?.accountId).toBe('81');
   expect((await profiles.internationalCheckin('42',1,'zzz')).status).toBe('disabled');
  }
  await writeFile(file,profile(regions[0][0],regions[0][1],false));
  await expect(ownedRankRole(profiles,'42',1)).rejects.toThrow();
  await expect(readChallengeReminderContext(profiles,'42',1)).rejects.toThrow();
  await writeFile(file,profile(regions[0][0],regions[0][1],true,false));
  expect(await ownedRankRole(profiles,'42',1)).toBeUndefined();
  expect(await readChallengeReminderContext(profiles,'42',1)).toBeUndefined();
 }finally{await rm(root,{recursive:true,force:true})}
});

test('reminder completion filtering respects overseas period rather than China reset',()=>{
 const now=Date.parse('2026-11-20T00:00:00Z');
 const status=(region:string)=>({revision:'fixture',shiyu:{status:'fulfilled' as const,value:snapshot('1000000001',region)},deadly:{status:'skipped' as const}});
 expect(renderZzzChallengeStatus(status('prod_gf_us'),{abyssCheckLevel:5,deadlyStars:0},now,true)).toBe('');
 expect(renderZzzChallengeStatus(status('prod_gf_jp'),{abyssCheckLevel:5,deadlyStars:0},now,true)).not.toBe('');
});

test('void-front validates global and domestic game biz separately',()=>{
 const global={uid:'1000000001',region:'prod_gf_us',scheduleType:1 as const};
 expect(normalizeZzzVoidFront({game_biz:'nap_global'},global)).toMatchObject({...global,status:'empty'});
 expect(()=>normalizeZzzVoidFront({game_biz:'nap_cn'},global)).toThrow();
 expect(()=>normalizeZzzVoidFront({game_biz:'nap_global'},{...global,region:'prod_gf_cn'})).toThrow();
});

const valkey = Bun.which('valkey-server');
test.skipIf(!valkey)('international rank storage and scheduled reminders preserve authorization, dedupe and restart behavior',async()=>{
 const {connectStorage,closeStorage}=await import('@lotus-yunzai/storage');
 const {normalizeZzzHoloBoss}=await import('@lotus-yunzai/hoyo-client');
 const {createChallengeRankStore}=await import('./challenge-rank-store.ts');
 const {createZzzChallengeReminderStore}=await import('./challenge-reminder-store.ts');
 const {startZzzChallengeReminders}=await import('./challenge-reminder-runtime.ts');
 const root=await mkdtemp(join(tmpdir(),'lotus-zzz-os-runtime-'));
 const listener=Bun.listen({hostname:'127.0.0.1',port:0,socket:{data(){}}});const port=listener.port;listener.stop(true);
 const password=crypto.randomUUID();
 const server=Bun.spawn([valkey!,'--bind','127.0.0.1','--port',String(port),'--requirepass',password,'--save','','--appendonly','no','--dir',root],{stdout:'pipe',stderr:'ignore'});
 const before=globalThis.redis;
 try{
  const reader=server.stdout.getReader();let text='';
  while(!text.includes('Ready to accept connections')){const chunk=await reader.read();if(chunk.done)throw Error('valkey failed');text+=new TextDecoder().decode(chunk.value)}reader.releaseLock();
  const redis=await connectStorage(`redis://:${password}@127.0.0.1:${port}`);globalThis.redis=redis;
  const ranks=createChallengeRankStore(redis,join(root,'absent-legacy'));
  const start={year:2026,month:11,day:20,hour:4,minute:0,second:0};const end={...start,day:30};
  for(const [uid,region] of regions){
   const profile={qq:'42',profileId:1,uid,region,nickname:'fixture'};
   const record=normalizeZzzHoloBoss({unlock:true,start_time:start,end_time:end,game_biz:'nap_global',list:[{star:4,challenge_time:{minute:1,second:2}}]},{uid,region,scheduleType:1});
   expect(await ranks.remember('77','HOLO_BOSS',profile,record,Date.now())).toBe(false);
   await ranks.setVisibility('77',['HOLO_BOSS'],uid,region,true,profile);
   expect(await ranks.remember('77','HOLO_BOSS',profile,record,Date.now())).toBe(true);
  }
  const rows=await ranks.rows('77','HOLO_BOSS',new Set(['42']),Date.now());
  expect(rows).toHaveLength(4);
  expect(new Set(rows.map(row=>row.region))).toEqual(new Set(regions.map(row=>row[1])));
  expect(await ranks.rows('77','HOLO_BOSS',new Set(['43']),Date.now())).toEqual([]);
  await ranks.setVisibility('77',['HOLO_BOSS'],regions[0][0],regions[0][1],false,{qq:'42',profileId:1});
  expect((await ranks.rows('77','HOLO_BOSS',new Set(['42']),Date.now())).length).toBe(3);
  const uid=regions[0][0],region=regions[0][1];
  await writeFile(join(root,'42.yaml'),[
   'user: { qq: "42" }','profile: { id: 1 }',`account: { current_uid: { zzz: "${uid}" } }`,
   'games:','  os:', '    cookie: "account_id=81; cookie_token=fixture-cookie"','    verified_account_id: "81"','    verified_realm: SG',
   '    verified_activity_cookie: "ltuid=81; ltoken=fixture-activity"',`    current_uid: { zzz: "${uid}" }`,
   `    game_roles: { zzz: [{ uid: "${uid}", region: ${region}, game_biz: nap_global }] }`,
  ].join('\n'));
  const profiles=createProfileStore(root);const reminders=createZzzChallengeReminderStore(redis,join(root,'absent.yaml'));
  await reminders.updateGlobal('enable',true);await reminders.updateGlobal('remindTime','每日20时');
  const defaults=await reminders.global();await reminders.updateUser('42',current=>({...current,enable:true,botId:99}),defaults);
  let calls=0;const sent:string[]=[];let run:()=>Promise<void>=async()=>{};
  const client={async fetchZzzChallengeStatus(source:Awaited<ReturnType<typeof profiles.requestSelectedContext>>){
   calls++;expect(source.role.gameBiz).toBe('nap_global');expect(source.international?.accountId).toBe('81');
   return {revision:source.revision,shiyu:{status:'fulfilled' as const,value:snapshot(uid,region)},deadly:{status:'skipped' as const}};
  }} as unknown as Parameters<typeof startZzzChallengeReminders>[1];
  const runtime={disconnect:new AbortController().signal,registerTask(callback:()=>Promise<void>){run=callback;return async()=>{}},async route(){return {botId:99,async send(text:string){sent.push(text);return 'confirmed' as const}}}};
  const now=()=>Date.parse('2026-11-28T12:00:00Z');
  startZzzChallengeReminders(profiles,client,runtime,new AbortController().signal,now);
  await run();expect(calls).toBe(1);expect(sent).toHaveLength(1);
  startZzzChallengeReminders(profiles,client,runtime,new AbortController().signal,now);
  await run();expect(calls).toBe(1);expect(sent).toHaveLength(1);
 }finally{globalThis.redis=before;await closeStorage();server.kill();await server.exited;await rm(root,{recursive:true,force:true})}
});
