import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModule } from "./index.ts";

// Run the registered command consumers, not an isolated API helper. No requests
// leave this test, and a missing transport injection fails the request assertions.
test("模块国际服战绩与月报使用宿主注入的米游社传输", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-zzz-transport-"));
  const previousDirectory = Bun.env.LOTUS_PROFILE_DIR;
  const originalFetch = globalThis.fetch;
  const cookie = "ltuid_v2=42; ltoken_v2=fixture-token; ltmid_v2=fixture-mid";
  const calls: string[] = [];
  try {
    Bun.env.LOTUS_PROFILE_DIR = root;
    await writeFile(join(root, "42.yaml"), JSON.stringify({ profile: { id: 1 }, user: { qq: "42" },
      account: { stuid: "62", stoken: "fixture", cookie: "ltoken=domestic-fixture", current_uid: { zzz: "1300000002" } },
      device: { id: "fixture-device", fp: "fixture-fp" },
      games: { os: { verified_account_id: "42", verified_realm: "SG", verified_activity_cookie: cookie, lang: "zh-cn" } },
    }));
    globalThis.fetch = Object.assign(async () => { throw new Error("不得走默认fetch"); },
      { preconnect: originalFetch.preconnect });
    const controller = new AbortController();
    const module = createModule({ signal: controller.signal,
      lockFile: async () => { throw new Error("失败的只读请求不应写入档案"); },
      async hoyoTransport(url, init) {
        calls.push(url.href);
        expect(init.method).toBe("GET");
        expect(init.redirect).toBe("error");
        expect(new Headers(init.headers).get("Cookie")).toBe(cookie);
        if (url.hostname === "api-account-os.hoyolab.com") {
          expect(url.searchParams.get("game_biz")).toBe("nap_global");
          return Response.json({ retcode: 0, data: { list: [
            { game_uid: "1300000002", region: "prod_gf_jp", game_biz: "nap_global" },
          ] } });
        }
        // An explicit fixture rejection ends before rendering or persistence.
        return Response.json({ retcode: -100, message: "fixture-only" });
      },
    });
    for (const normalizedMessage of ["#绝区零卡片", "#绝区零月报"]) {
      const before = calls.length;
      await module.fallback(normalizedMessage, { normalizedMessage, self_id: 99, user_id: 42, message_type: "private",
        privateCredentialSignal: controller.signal, reply: () => true });
      expect(calls.length - before).toBe(2);
    }
    expect(calls[1]).toStartWith("https://sg-act-public-api.hoyolab.com/event/game_record_zzz/api/zzz/index?");
    expect(calls[3]).toStartWith("https://sg-public-api.hoyolab.com/event/nap_ledger/month_info?");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousDirectory === undefined) delete Bun.env.LOTUS_PROFILE_DIR;
    else Bun.env.LOTUS_PROFILE_DIR = previousDirectory;
    await rm(root, { recursive: true, force: true });
  }
});
