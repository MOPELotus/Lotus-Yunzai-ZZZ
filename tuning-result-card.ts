import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import { renderStatusCard, type StatusCardOptions } from "@lotus-yunzai/skia/status-card";
import type { createZzzTuningSync } from "./tuning-sync.ts";

type SyncResult = Awaited<ReturnType<ReturnType<typeof createZzzTuningSync>["sync"]>>;
type TuningCardResult = Pick<SyncResult, "uid" | "profileId" | "pools"> & {
  readonly stats: Pick<SyncResult["stats"], "updatedAt">;
};

const title = $t("tuning-result-card.text_8efe873b92");
const failureMessages = {
  "rate-limited": $t("tuning-result-card.text_3f341e6635"),
  "network-failed": $t("tuning-result-card.text_aef566e1e7"),
  "service-unavailable": $t("tuning-result-card.text_45f501d999"),
  "profile-changed": $t("tuning-result-card.text_e77f1910c7"),
  "request-failed": $t("tuning-result-card.text_2abe38ab62"),
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
  const lead = $t("tuning-result-card.text_e747eddef9", { "qq": qq, "profileId": profileId, "uid": uid });
  const contents = pools.length ? pools.map(({ name, totalDraws, total, added, pity }) =>
    $t("tuning-result-card.text_dc7677bc1d", { "name": name, "totalDraws": totalDraws, "total": total, "added": added, "value5": pity ?? "—" })) : [$t("tuning-result-card.text_be8582ff79")];
  return renderStatusCard(title, lead, contents, new Date(stats.updatedAt), options);
}

export function renderZzzTuningFailure(
  { qq, profileId, reason = "request-failed", at = new Date() }: TuningCardFailure, options?: StatusCardOptions,
) {
  const lead = $t("tuning-result-card.text_7a351db5c1", { "qq": qq, "profileId": profileId, "value3": failureMessages[reason] });
  return renderStatusCard(title, lead, [], at, options);
}
