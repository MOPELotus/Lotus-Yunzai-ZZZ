import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import { readChallengeReminderContext } from "./challenge-profile.ts";
import type { createProfileStore } from "@lotus-yunzai/account";
import type { createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import { challengeReminderWindow, createZzzChallengeReminderStore, type ChallengeReminderDefaults } from "./challenge-reminder-store.ts";
import { effectiveChallengeReminder, renderZzzChallengeStatus } from "./challenge-reminder.ts";

export interface ZzzReminderRuntime {
  readonly disconnect: AbortSignal;
  registerTask(run: () => Promise<void>): () => Promise<void>;
  registerPanelCacheTask?(run: () => Promise<import("../../lib/runtime-trace.ts").PanelCacheSummary | void>): () => Promise<void>;
  route(userId: number, botId: number | undefined, signal: AbortSignal): Promise<{
    readonly botId: number;
    send(text: string): Promise<"confirmed" | "rejected" | "unknown">;
  } | undefined>;
}

type ReminderStore = ReturnType<typeof createZzzChallengeReminderStore>;

export function startZzzChallengeReminders(profiles: ReturnType<typeof createProfileStore>,
  client: ReturnType<typeof createProfileHoyoClient>, runtime: ZzzReminderRuntime, signal: AbortSignal,
  now: () => number = Date.now) {
  const active = AbortSignal.any([signal, runtime.disconnect]);
  let running = false;
  return runtime.registerTask(async () => {
    if (running || active.aborted || !globalThis.redis) return;
    running = true;
    try {
      const store = createZzzChallengeReminderStore(globalThis.redis);
      const defaults = await store.global();
      if (!defaults.enable) return;
      for await (const qq of store.subscriberIds()) {
        if (active.aborted) return;
        await processUser(store, qq, defaults).catch(() => undefined);
      }
    } finally {
      running = false;
    }
  });

  async function readPlan(store: ReminderStore, qq: string, snapshot?: ChallengeReminderDefaults) {
    if (active.aborted) return;
    const [global, user] = await Promise.all([snapshot ?? store.global(), store.user(qq)]);
    if (!global.enable || !user?.enable || active.aborted) return;
    const preferences = effectiveChallengeReminder(global, user);
    const day = challengeReminderWindow(preferences.remindTime, now());
    if (day && (preferences.abyssCheckLevel > 0 || preferences.deadlyStars > 0)) {
      return { day, botId: user.botId, preferences };
    }
  }

  async function processUser(store: ReminderStore, qq: string, defaults: ChallengeReminderDefaults) {
    const plan = await readPlan(store, qq, defaults);
    if (!plan) return;
    const samePlan = (current: Awaited<ReturnType<typeof readPlan>>) => current?.day === plan.day &&
      current.botId === plan.botId && current.preferences.remindTime === plan.preferences.remindTime &&
      current.preferences.abyssCheckLevel === plan.preferences.abyssCheckLevel &&
      current.preferences.deadlyStars === plan.preferences.deadlyStars;
    const claim = await store.claim(qq, plan.day);
    if (!claim) return;
    let finished = false;
    try {
      const userId = Number(qq);
      const route = await runtime.route(userId, plan.botId, active);
      if (!route || active.aborted || !samePlan(await readPlan(store, qq))) return;
      const source = await readChallengeReminderContext(profiles, qq, 1);
      if (!source || active.aborted) return;
      const result = await client.fetchZzzChallengeStatus(source, { signal: active,
        skipShiyu: plan.preferences.abyssCheckLevel === 0, skipDeadly: plan.preferences.deadlyStars === 0 });
      if (active.aborted) return;
      const text = renderZzzChallengeStatus(result, plan.preferences, now(), true);
      if (!text && (result.shiyu.status === "rejected" || result.deadly.status === "rejected")) return;

      const stillActive = async () => {
        if (!samePlan(await readPlan(store, qq))) return false;
        const current = await profiles.requestSelectedContext(qq, 1, "zzz");
        return !active.aborted && current.revision === result.revision && current.role.uid === source.role.uid &&
          current.role.region === source.role.region && challengeReminderWindow(plan.preferences.remindTime, now()) === plan.day;
      };
      const delivery = text ? await runtime.route(userId, plan.botId, active) : undefined;
      if ((text && delivery?.botId !== route.botId) || !await stillActive()) return;
      finished = await claim.finish();
      if (!finished || !delivery || !await stillActive()) return;
      // Seal the day before invoking the gateway. A lost response cannot trigger a second delivery.
      await delivery.send($t("challenge-reminder-runtime.text_6e20127c91", { "text": text }));
    } finally {
      if (!finished) await claim.release().catch(() => undefined);
    }
  }
}
