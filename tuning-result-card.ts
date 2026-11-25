import { renderStatusCard, type StatusCardOptions } from "@lotus-yunzai/skia/status-card";
import type { createZzzTuningSync } from "./tuning-sync.ts";

type SyncResult = Awaited<ReturnType<ReturnType<typeof createZzzTuningSync>["sync"]>>;
type TuningCardResult = Pick<SyncResult, "uid" | "profileId" | "pools"> & {
  readonly stats: Pick<SyncResult["stats"], "updatedAt">;
};

const title = "绝区零抽卡记录";
const failureMessages = {
  "rate-limited": "访问过于频繁。",
  "network-failed": "网络连接失败。",
  "service-unavailable": "官方服务暂时不可用。",
  "profile-changed": "档案已变更，请重新更新抽卡记录。",
  "request-failed": "绝区零抽卡记录更新失败。",
} as const;

export function zzzTuningFailureText(reason: keyof typeof failureMessages) {
  return failureMessages[reason];
}

interface TuningCardFailure {
  readonly qq: string;
  readonly profileId: number;
  readonly reason?: keyof typeof failureMessages;
  readonly at?: Date;
}

export function renderZzzTuningResult(
  qq: string, { uid, profileId, pools, stats }: TuningCardResult, options?: StatusCardOptions,
) {
  const lead = `QQ ${qq} · 档案 ${profileId} · UID ${uid}`;
  const contents = pools.length ? pools.map(({ name, totalDraws, total, added, pity }) =>
    `${name}：共 ${totalDraws} 抽 · S 级 ${total}（新增 ${added}）· 当前垫 ${pity ?? "—"}`) : ["卡池：无新增记录"];
  return renderStatusCard(title, lead, contents, new Date(stats.updatedAt), options);
}

export function renderZzzTuningFailure(
  { qq, profileId, reason = "request-failed", at = new Date() }: TuningCardFailure, options?: StatusCardOptions,
) {
  const lead = `QQ ${qq} · 档案 ${profileId}\n${failureMessages[reason]}`;
  return renderStatusCard(title, lead, [], at, options);
}
