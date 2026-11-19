import { ProfileError, type GameRole } from "@lotus-yunzai/account";
import {
  HoyoRequestError, isZzzGachaLinkMessage, parseZzzGachaLink, resolveZzzGachaLinkRole, ZzzGachaLinkError,
  type ZzzGachaLink,
} from "@lotus-yunzai/hoyo-client";

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
    if (error.code === "missing" || error.code === "login-required") return `[荷花插件]请先登录 profile ${profileId}。`;
    if (error.code === "role-missing") return `[荷花插件]profile ${profileId} 没有同步绝区零 UID。`;
    if (error.code === "changed") return "绝区零档案角色已变化，请重新录入。";
  }
  if (error instanceof ZzzGachaLinkError) {
    switch (error.reason) {
      case "expired": return "绝区零抽卡链接已过期，请重新获取后录入。";
      case "rate-limited": return "绝区零抽卡记录访问频繁，请稍后再试。";
      case "risk": return "绝区零抽卡服务要求验证，请在官方客户端处理后再试。";
      case "empty-unverified": return "官方链接暂无可核验的逐抽记录，旧档案已保留。";
    }
  }
  if (error instanceof HoyoRequestError && error.code === "invalid-input") return error.message;
  return "绝区零抽卡链接录入失败，旧档案已保留。";
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
        const alias = `%抽卡链接${profileId === 1 ? "" : profileId}`;
        return `请私聊发送 ${alias}，再按提示录入。`;
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
          return "请发送完整的绝区零官方抽卡链接。发送「取消」即可结束，输入在两分钟内有效。";
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
    if (!request) return cancel ? undefined : "请先私聊发送 %抽卡链接。";
    pending.delete(scope);
    if (request.expires <= performance.now()) return cancel ? undefined : "录入已超时，请重新发送 %抽卡链接。";
    if (cancel) return "已取消绝区零抽卡链接录入。";

    const { qq: requestQq, profileId: requestProfileId } = request;
    const key = `${requestQq}/${requestProfileId}`;
    if (active.has(key)) return "该档案的抽卡链接正在处理，请稍后再试。";
    active.add(key);
    try {
      const role = await request.role;
      async function verifyProfile() {
        signal.throwIfAborted();
        const latest = await roleFor(requestQq, requestProfileId).catch(() => undefined);
        if (latest?.uid !== role.uid || latest.region !== role.region || latest.gameBiz !== role.gameBiz) {
          throw new ProfileError("changed", "绝区零档案角色已变化。");
        }
        signal.throwIfAborted();
      }
      await verifyProfile();
      const link = parseZzzGachaLink(text, role);
      await context.reply("正在读取绝区零逐抽记录，请稍候。");
      const result = await importLink(requestQq, requestProfileId, link, verifyProfile);
      if (!signal.aborted) return result;
    } catch (error) {
      if (!signal.aborted) return describeFailure(error, requestProfileId);
    } finally {
      active.delete(key);
    }
  };
}
