import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import { zzzMonthlyKey, type ZzzMonthlyRecord } from "@lotus-yunzai/hoyo-client";

const calendar = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" });
const names: Record<string, string> = {
  daily_activity_rewards: $t("monthly-model.text_f206a13c33"), growth_rewards: $t("monthly-model.text_1decad6eb8"), event_rewards: $t("monthly-model.text_ebcbb4b06f"), hollow_rewards: $t("monthly-model.text_8ea44f94b4"),
  shiyu_rewards: $t("monthly-model.text_ede98fcb79"), mail_rewards: $t("monthly-model.text_479d6bc50d"), other_rewards: $t("monthly-model.text_89f2284dc4"),
};
const currency = ["PolychromesData", "MatserTapeData", "BooponsData"] as const;

export function zzzMonthlyDate(year?: string, month?: string, now = new Date()) {
  if (!month) return "";
  const parts = calendar.formatToParts(now);
  const currentYear = Number(parts.find(item => item.type === "year")?.value);
  const currentMonth = Number(parts.find(item => item.type === "month")?.value);
  const current = currentYear * 100 + currentMonth;
  if (month === "上") return zzzMonthlyKey(currentMonth === 1 ? (currentYear - 1) * 100 + 12 : current - 1);
  const value = (year ? Number(year) : currentYear) * 100 + Number(month);
  return value <= current ? zzzMonthlyKey(value) : undefined;
}

export function zzzMonthlyDateLabel(key: string) {
  return $t("monthly-model.text_c85dda8b58", { "value1": key.slice(0, 4), "value2": Number(key.slice(-2)) });
}

export function zzzMonthlyOverview(record: ZzzMonthlyRecord) {
  return currency.map(type => record.month_data.list.find(row => row.data_type === type)?.count);
}

export function zzzMonthlyTotals(records: readonly ZzzMonthlyRecord[]) {
  const entries = records.map(zzzMonthlyOverview);
  return currency.map((_, index) => {
    const reported = entries.flatMap(row => row[index] ?? []);
    return reported.length ? reported.reduce((sum, count) => sum + count, 0) : undefined;
  });
}

export function zzzMonthlyIncome(record: ZzzMonthlyRecord) {
  return record.month_data.income_components.map(row => ({
    label: Object.hasOwn(names, row.action) ? names[row.action]! : $t("monthly-model.text_25c3a86575"), count: row.num, percent: row.percent,
  }));
}
