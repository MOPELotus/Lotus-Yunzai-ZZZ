import { renderStatusCard, type StatusCardOptions } from "@lotus-yunzai/skia/status-card";
import type { createZzzTuningSync } from "./tuning-sync.ts";

type SyncResult = Awaited<ReturnType<ReturnType<typeof createZzzTuningSync>["sync"]>>;
type TuningCardResult = Pick<SyncResult, "uid" | "profileId" | "pools"> & {
  readonly stats: Pick<SyncResult["stats"], "updatedAt">;
};

const title = "绝区零抽卡记录";
const failureMessages = {
  "rate-limited": "访问过于频繁，请稍后再试。",
  "profile-changed": "保存绝区零调频历史时档案已变更，请重新发起请求。",
  "request-failed": "绝区零抽卡记录更新失败。",
} as const;

interface TuningCardFailure {
  readonly qq: string;
  readonly profileId: number;
  readonly reason?: keyof typeof failureMessages;
  readonly at?: Date;
}

export function renderZzzTuningResult(
  qq: string, { uid, profileId, pools, stats }: TuningCardResult, options?: StatusCardOptions,
) {
  const lead = `QQ ${qq} · Profile ${profileId} · UID ${uid}\n已同步米游社全历史调频统计与 S 级记录。`;
  const contents = pools.length ? pools.map(({ name, totalDraws, total, added, pity }) =>
    `${name}：共 ${totalDraws} 抽 · S 级 ${total}（新增 ${added}）· 当前垫 ${pity ?? "—"}`) : ["卡池：无新增记录"];
  return renderStatusCard(title, lead, contents, new Date(stats.updatedAt), options);
}

export function renderZzzTuningFailure(
  { qq, profileId, reason = "request-failed", at = new Date() }: TuningCardFailure, options?: StatusCardOptions,
) {
  const lead = `QQ ${qq} · Profile ${profileId}\n${failureMessages[reason]}`;
  return renderStatusCard(title, lead, [
    "阶段：绝区零调频记录同步",
    "建议：检查 profile 的绝区零 UID 和米游社登录状态。",
  ], at, options);
}
