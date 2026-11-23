import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { createZzzShowcaseClient } from "./enka-showcase.ts";
import { createModule } from "./index.ts";
import { createZzzPanelRanks } from "./panel-rank.ts";
import { buildZzzPanelRankRow, zzzPanelRankCommand } from "./panel-rank-model.ts";

test("绝区零最强角色的两种前缀进入群榜分派，私聊拒绝", async () => {
  const module = createModule({ signal: new AbortController().signal, lockFile: async () => ({ close() {} }) });
  for (const name of ["%最强安比", "#绝区零最强安比", "%群内最强安比面板"]) {
    expect(zzzPanelRankCommand(name)).toEqual({ kind: "strongest", name: "安比", weighted: false, profileId: 1, page: 1 });
    expect(await module.fallback(name, { normalizedMessage: name, user_id: 42, message_type: "private", reply() {} }))
      .toBe("请在群聊中使用该命令！");
  }
  expect(zzzPanelRankCommand("#最强安比")).toBeUndefined();
  expect(zzzPanelRankCommand("%最强")).toBeUndefined();
});

test("最强角色每次重查已授权群成员的 UID，只渲染当次榜首，撤回后不发送", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-zzz-strongest-"));
  const profileDirectory = join(root, "profiles");
  const config = join(root, "rank.yaml");
  const previous = Object.fromEntries(["LOTUS_ZZZ_LEGACY_RESOURCES_DIR", "LOTUS_ZZZ_RANK_CONFIG",
    "LOTUS_ATLAS_THEME_DIR", "LOTUS_PASSPORT_QR_RESOURCES"].map(key => [key, Bun.env[key]]));
  const previousRedis = globalThis.redis;
  try {
    const first = "12345678", second = "23456789", outsider = "34567890", region = "prod_gf_cn";
    const owners = new Map([["42:1", `${region}:${first}`], ["43:1", `${region}:${second}`], ["44:1", `${region}:${outsider}`]]);
    let enabled = true;
    globalThis.redis = {
      async mGet(keys: string[]) {
        return keys.map(key => key === "lotus-yunzai:zzz-challenge-ranks:allow-group" ? (enabled ? "1" : "0") : null);
      },
      async *hScanIterator() { for (const [field, value] of owners) yield { field, value }; },
      async hGet(_key: string, field: string) { return owners.get(field) ?? null; },
      async hmGet(_key: string, fields: readonly string[]) { return fields.map(field => owners.get(field) ?? null); },
    } as unknown as NonNullable<typeof globalThis.redis>;
    delete Bun.env.LOTUS_ZZZ_LEGACY_RESOURCES_DIR;
    Bun.env.LOTUS_ZZZ_RANK_CONFIG = config;
    Bun.env.LOTUS_ATLAS_THEME_DIR = root;
    Bun.env.LOTUS_PASSPORT_QR_RESOURCES = root;
    await Promise.all([mkdir(profileDirectory), writeFile(config, "allow_group: true\n")]);
    await Promise.all([
      ...([[42, first], [43, second], [44, outsider]] as const).map(([qq, uid]) =>
        writeFile(join(profileDirectory, `${qq}.yaml`), Bun.YAML.stringify({
          user: { qq: String(qq) }, profile: { id: 1 }, enabled: true,
          account: {
            stuid: String(qq), stoken: "rank-fixture-stoken", cookie: `account_id=${qq}; cookie_token=rank-fixture`,
            game_roles: { zzz: [{ uid, region, game_biz: "nap_cn" }] }, current_uid: { zzz: uid },
          },
        }), { mode: 0o600 })),
    ]);
    const queried: string[] = [], rendered: string[] = [];
    let currentWinner = second, now = 1000, withdrawDuringRender = false;
    const showcase = createZzzShowcaseClient(async (url, init) => {
      const uid = url.pathname.split("/").at(-1)!;
      queried.push(uid);
      now += 1000;
      expect(new Headers(init.headers).has("cookie")).toBe(false);
      const row = {
        Id: 1011, Level: 60, TalentLevel: 2,
        Weapon: { Id: uid === first ? 13101 : 13004, Level: 60, UpgradeLevel: 1, BreakLevel: 5 },
        EquippedList: [{ Slot: 1, Equipment: { Id: 31041, Level: 15,
          MainPropertyList: [{ PropertyId: 11103, PropertyValue: 550 }],
          RandomPropertyList: [{ PropertyId: 20103, PropertyValue: 240, PropertyLevel: uid === currentWinner ? 5 : 1 }],
        } }],
      };
      return Response.json({ uid, region, ttl: 120, PlayerInfo: {
        SocialDetail: { ProfileDetail: { Uid: uid } }, ShowcaseDetail: { AvatarList: [row] },
      } });
    }, () => now);
    const png = Buffer.from("synthetic output");
    const ranks = createZzzPanelRanks(createProfileStore(profileDirectory), async () => { throw new Error("Unexpected HoYoLAB request"); },
      new AbortController().signal, showcase, {
        async renderStrongest(avatar, uid, options) {
          rendered.push(uid);
          expect(avatar.name_mi18n).toBe("安比");
          const score = buildZzzPanelRankRow(avatar);
          expect(score.weighted - score.drive).toBeCloseTo(uid === first ? 16 : 10, 10);
          expect(options).toMatchObject({ showcase: true, inlineImageByteLimit: 1000 });
          expect(options?.qq).toBeUndefined();
          if (withdrawDuringRender) owners.delete("42:1");
          return { png };
        },
      });
    const context = { user_id: 42, group_id: 99, message_type: "group", adapter: "milky", inlineImageByteLimit: 1000,
      async listCheckinGroupMembers() { return [{ id: 42 }, { id: 43 }]; } };
    const query = zzzPanelRankCommand("%最强安比")!;
    const expected = (uid: string) => [expect.stringContaining(`本群最强安比 · UID ${uid}`), { type: "image", file: png }];
    expect(await ranks(context, query)).toEqual(expected(second));
    currentWinner = first;
    expect(await ranks(context, query)).toEqual(expected(first));
    expect(queried).toEqual([first, second, first, second]);
    expect(rendered).toEqual([second, first]);

    withdrawDuringRender = true;
    expect(await ranks(context, query)).toMatch(/可见状态已变化/u);
    expect(rendered).toEqual([second, first, first]);
    enabled = false;
    expect(await ranks(context, query)).toBe("当前群角色面板排名功能已关闭！");
    expect(queried).toEqual([first, second, first, second, first, second]);
    enabled = true;
    owners.set("42:1", `${region}:${first}`);
    for (const command of ["%安比排名", "%安比综合榜"]) {
      const reply = await ranks(context, zzzPanelRankCommand(command)!);
      expect(reply).toEqual([expect.stringContaining("2 个 UID 入榜"), { type: "image", file: expect.any(Uint8Array) }]);
      const file = Array.isArray(reply) && typeof reply[1] === "object" ? reply[1].file : undefined;
      expect(file && Buffer.from(file).readUInt32BE(16)).toBe(3280);
    }
    expect(queried.slice(-4)).toEqual([first, second, first, second]);
  } finally {
    globalThis.redis = previousRedis;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete Bun.env[key];
      else Bun.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});
