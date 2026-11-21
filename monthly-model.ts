import { zzzMonthlyKey, type ZzzMonthlyRecord } from "@lotus-yunzai/hoyo-client";

const calendar = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" });
const names: Record<string, string> = {
  daily_activity_rewards: "日常活跃奖励", growth_rewards: "成长奖励", event_rewards: "活动奖励", hollow_rewards: "零号空洞奖励",
  shiyu_rewards: "式舆防卫战奖励", mail_rewards: "邮件奖励", other_rewards: "其他奖励",
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
  return `${key.slice(0, 4)}年${Number(key.slice(-2))}月`;
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
    label: Object.hasOwn(names, row.action) ? names[row.action]! : "未知奖励", count: row.num, percent: row.percent,
  }));
}
