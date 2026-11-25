import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("zzz", messageCatalog.messages);
import { ProfileError, type GameRole } from "@lotus-yunzai/account";
import {
  HoyoRequestError, isZzzGachaLinkMessage, parseZzzGachaLink, resolveZzzGachaLinkRole, ZzzGachaLinkError,
  type ZzzGachaLink,
} from "@lotus-yunzai/hoyo-client";
import { zzzCommandProfileSuffix } from "./profile-command.ts";

const timeout = 120_000;

interface LinkContext {
  readonly adapter?: string;
  readonly self_id?: number;
  readonly user_id?: number;
  readonly message_type?: string;
  readonly normalizedMessage: string;
  reply(message: string): unknown;
}

interface LinkRequest {
  readonly qq: string;
  readonly profileId: number;
  readonly role: Promise<ZzzGachaLink>;
  readonly expires: number;
}

type LinkReply = string | { readonly type: "forward"; readonly nodes: readonly string[] };

function validId(id: number | undefined): id is number {
  return id !== undefined && Number.isSafeInteger(id) && id > 0;
}

function describeFailure(error: unknown, profileId: number): string {
  if (error instanceof ProfileError) {
    if (error.code === "missing" || error.code === "login-required") return $t("gacha-link-session.text_76720712c8", { "profileId": profileId });
    if (error.code === "role-missing") return $t("gacha-link-session.text_4ea60872c8", { "profileId": profileId });
    if (error.code === "changed") return $t("gacha-link-session.text_a6f714ae2a");
  }
  if (error instanceof ZzzGachaLinkError) {
    switch (error.reason) {
      case "expired": return $t("gacha-link-session.text_84933c56ba");
      case "rate-limited": return $t("gacha-link-session.text_734d34b4a0");
      case "risk": return $t("gacha-link-session.text_25409baeb5");
      case "empty-unverified": return $t("gacha-link-session.text_c06b58c722");
    }
  }
  if (error instanceof HoyoRequestError && error.code === "invalid-input") return error.message;
  return $t("gacha-link-session.text_e14ef27403");
}

export function createZzzGachaLinkSession({ signal, savedRole, importLink }: {
  readonly signal: AbortSignal;
  readonly savedRole: (qq: string, profileId: number) => Promise<GameRole>;
  readonly importLink: (qq: string, profileId: number, link: ZzzGachaLink,
    verifyProfile: () => Promise<void>) => Promise<LinkReply>;
}) {
  const pending = new Map<string, LinkRequest>();
  const active = new Set<string>();
  signal.addEventListener("abort", () => pending.clear(), { once: true });

  async function roleFor(qq: string, profileId: number) {
    return resolveZzzGachaLinkRole(await savedRole(qq, profileId));
  }

  return async (context: LinkContext, profileId?: number): Promise<LinkReply | undefined> => {
    if (signal.aborted) return;
    const { message_type, user_id, self_id, adapter } = context;
    if (message_type !== "private" || !validId(user_id) || !validId(self_id)) {
      if (profileId !== undefined) {
        const alias = `%抽卡链接${zzzCommandProfileSuffix(profileId)}`;
        return $t("gacha-link-session.text_04a02a3f55", { "alias": alias });
      }
      return;
    }
    const qq = String(user_id);
    const scope = `${adapter ?? "onebot"}:${self_id}:${qq}`;
    if (profileId !== undefined) {
      const role = roleFor(qq, profileId);
      const request = { qq, profileId, role, expires: performance.now() + timeout };
      pending.set(scope, request);
      try {
        await role;
        if (!signal.aborted && pending.get(scope) === request) {
          setTimeout(() => {
            if (pending.get(scope) === request) pending.delete(scope);
          }, timeout).unref();
          return $t("gacha-link-session.text_c28a0d76bd");
        }
      } catch (error) {
        if (!signal.aborted && pending.get(scope) === request) {
          pending.delete(scope);
          return describeFailure(error, profileId);
        }
      }
      return;
    }

    const text = context.normalizedMessage.trim();
    const cancel = text === "取消";
    if (!cancel && !isZzzGachaLinkMessage(text)) return;
    const request = pending.get(scope);
    if (!request) return cancel ? undefined : $t("gacha-link-session.text_f2b2daacb1");
    pending.delete(scope);
    if (request.expires <= performance.now()) return cancel ? undefined : $t("gacha-link-session.text_09b1c8b938");
    if (cancel) return $t("gacha-link-session.text_69625c0aab");

    const { qq: requestQq, profileId: requestProfileId } = request;
    const key = `${requestQq}/${requestProfileId}`;
    if (active.has(key)) return $t("gacha-link-session.text_18e77de7a6");
    active.add(key);
    try {
      const role = await request.role;
      async function verifyProfile() {
        signal.throwIfAborted();
        const latest = await roleFor(requestQq, requestProfileId).catch(() => undefined);
        if (latest?.uid !== role.uid || latest.region !== role.region || latest.gameBiz !== role.gameBiz) {
          throw new ProfileError("changed", $t("gacha-link-session.text_9cf98a9cde"));
        }
        signal.throwIfAborted();
      }
      await verifyProfile();
      const link = parseZzzGachaLink(text, role);
      await context.reply($t("gacha-link-session.text_490548e6bc"));
      const result = await importLink(requestQq, requestProfileId, link, verifyProfile);
      if (!signal.aborted) return result;
    } catch (error) {
      if (!signal.aborted) return describeFailure(error, requestProfileId);
    } finally {
      active.delete(key);
    }
  };
}
