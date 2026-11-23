import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { sendCommandReply } from "../../lib/commands.ts";
import { createModule } from "./index.ts";
import { createZzzRecallSettings } from "./recall-settings.ts";

test("绝区零撤回时间继承旧设置，主人写入后即时生效且保留面板字段", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-zzz-recall-settings-"));
  const lifecycle = new AbortController();
  const connection = new AbortController();
  const current = join(root, "config", "zzz-panel.yaml");
  const legacyResources = join(root, "legacy", "resources");
  const legacy = join(root, "legacy", "config", "config.yaml");
  const owner = { self_id: 99, user_id: 42, adapter: "onebot", message_type: "private", isMaster: true,
    privateCredentialSignal: connection.signal, isBotMaster: (id: number) => id === 42 };
  try {
    await mkdir(join(root, "config"));
    await mkdir(join(root, "legacy", "config"), { recursive: true });
    await writeFile(legacy, "recallMsg: 7\n");
    const config = createZzzRecallSettings(lifecycle.signal, pathToFileURL(root + "/"), legacyResources);
    expect(await config.transient("临时回执")).toEqual({ type: "recallable", message: "临时回执", seconds: 7 });
    await writeFile(current, "# 旧注释\nroleInterval: 305\n");
    expect(await config.setting("%设置撤回时间8", { ...owner, user_id: 43 })).toMatchObject({ type: "recallable", seconds: 7 });
    expect(await config.setting("%设置撤回时间121", owner)).toMatchObject({ type: "recallable", seconds: 7 });
    expect(await readFile(current, "utf8")).toBe("# 旧注释\nroleInterval: 305\n");
    expect(await config.setting("%设置撤回时间120", owner)).toContain("120 秒");
    expect(await config.transient("临时回执")).toMatchObject({ type: "recallable", seconds: 120 });
    expect(await readFile(current, "utf8")).toBe("# 旧注释\nroleInterval: 305\nrecallMsg: 120\n");
    expect(await readFile(legacy, "utf8")).toBe("recallMsg: 7\n");
    expect(await config.setting("#绝区零设置撤回时间0", owner)).toContain("关闭自动撤回");
    expect(await config.transient("保留回执")).toBe("保留回执");
    const board = { type: "image" as const, file: new Uint8Array([1]) };
    expect(await config.transient(board)).toBe(board);
    connection.abort();
    expect(await config.setting("%设置撤回时间8", owner)).toBe("仅限当前机器人的主人设置。");
    expect(await readFile(current, "utf8")).toContain("recallMsg: 0");
  } finally {
    lifecycle.abort();
    await rm(root, { recursive: true, force: true });
  }
});

test("绝区零抽卡提示实际派发带撤回期限，仅撤回机器人回复", async () => {
  const previous = Bun.env.LOTUS_ZZZ_PANEL_CONFIG;
  const root = await mkdtemp(join(tmpdir(), "lotus-zzz-recall-host-"));
  const lifecycle = new AbortController();
  try {
    const file = join(root, "panel.yaml");
    Bun.env.LOTUS_ZZZ_PANEL_CONFIG = file;
    const plugin = createModule({ signal: lifecycle.signal, lockFile: async () => { throw new Error("群内链接提示无需写档"); } });
    const normalizedMessage = "#绝区零抽卡链接2";
    const context = { normalizedMessage, message_type: "group", group_id: 77, user_id: 42, self_id: 99, reply() {} };
    const defaultReply = await plugin.fallback(normalizedMessage, context);
    expect(defaultReply).toMatchObject({ type: "recallable", seconds: 100, message: expect.stringContaining("私聊") });
    await writeFile(file, "recallMsg: 12\n");
    const reply = await plugin.fallback(normalizedMessage, context);
    const requests: unknown[][] = [];
    if (reply === undefined) throw new Error("绝区零未派发录入提示");
    await sendCommandReply({ reply(...args) { requests.push(args); return true; } }, reply);
    expect(requests).toEqual([[expect.stringContaining("%抽卡链接2"), false, { recallMsg: 12, recallOriginal: false }]]);
  } finally {
    lifecycle.abort();
    if (previous === undefined) delete Bun.env.LOTUS_ZZZ_PANEL_CONFIG;
    else Bun.env.LOTUS_ZZZ_PANEL_CONFIG = previous;
    await rm(root, { recursive: true, force: true });
  }
});
