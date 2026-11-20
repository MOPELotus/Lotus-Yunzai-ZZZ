import { expect, test } from "bun:test";
import { createProfileStore } from "@lotus-yunzai/account";
import { createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import { createZzzPanelCommands, zzzPanelCommand, zzzPanelCommandHint } from "./panel-command.ts";

test("旧的全部更新前置和后置写法沿用档案号选择整份官方面板", () => {
  expect(zzzPanelCommand("%更新全部面板")).toEqual({ kind: "update", profileId: 1, names: [] });
  expect(zzzPanelCommand("#绝区零全部面板更新2")).toEqual({ kind: "update", profileId: 2, names: [] });
  expect(zzzPanelCommand("/zzz更新全部面板 255")).toEqual({ kind: "update", profileId: 255, names: [] });
  expect(zzzPanelCommand("%更新艾莲、安比面板2")).toEqual({ kind: "update", profileId: 2, names: ["艾莲", "安比"] });
  for (const raw of ["全部面板更新2", "%全部面板更新0", "%更新全部面板256", "%更新全部面板12345678"]) {
    expect(zzzPanelCommand(raw)).toBeUndefined();
  }
});

test("旧版指定角色展柜更新收到提示，展柜全量与官方单角色仍正常分流", () => {
  expect(zzzPanelCommandHint("%更新客服展柜面板2")).toBe("展柜更新不支持指定角色，请使用%更新展柜面板");
  for (const raw of ["%更新展柜面板2", "更新客服展柜面板2", "%更新客服展柜面板256", "%更新客服面板2"]) {
    expect(zzzPanelCommandHint(raw)).toBeUndefined();
  }
  expect(zzzPanelCommand("%更新展柜面板2")).toEqual({ kind: "showcase-update", profileId: 2 });
});

test("旧品牌前缀不再触发面板，现行命令仍保留角色和档案", () => {
  for (const raw of [
    "#ZZZ-Plugin面板列表", "%荷花插件面板列表2", "#绝区零荷花面板列表", "%Lotus-Plugin面板列表",
    "％Ｌｏｔｕｓ－Ｐｌｕｇｉｎ面板列表", "%[Lotus-Plugin]面板列表", "%荷花更新客服展柜面板2",
  ]) {
    expect(zzzPanelCommand(raw)).toBeUndefined();
    expect(zzzPanelCommandHint(raw)).toBeUndefined();
  }
  expect(zzzPanelCommand("#zzz面板列表2")).toEqual({ kind: "list", profileId: 2 });
  expect(zzzPanelCommand("%角色面板列表")).toEqual({ kind: "list", profileId: 1 });
  expect(zzzPanelCommand("%琉音面板")).toEqual({ kind: "detail", profileId: 1, name: "琉音" });
});

test("通用原图只在群聊识别，游戏原图保留两类会话的入口", () => {
  for (const raw of ["原图", "#原图"]) {
    expect(zzzPanelCommand(raw)).toBeUndefined();
    expect(zzzPanelCommand(raw, true)).toEqual({ kind: "original", sharedCommand: true });
  }
  expect(zzzPanelCommand("原图2", true)).toBeUndefined();
  expect(zzzPanelCommand("%原图", true)).toEqual({ kind: "original" });
  expect(zzzPanelCommand("%原图")).toEqual({ kind: "original" });
});

test("通用原图需宿主会话许可和单条引用，失败时留给其他路由", async () => {
  const profiles = createProfileStore();
  const handle = createZzzPanelCommands(profiles, createProfileHoyoClient(profiles),
    async () => { throw new Error("查原图无需锁定档案"); }, new AbortController().signal);
  const reference = { type: "reply", id: "9" };
  let lookups = 0;
  const context = {
    adapter: "milky", message_type: "group", self_id: 99, group_id: 77, user_id: 42,
    reply_id: "9", message: [reference],
    async lookupReply() { lookups++; return undefined; },
    reply() { throw new Error("查原图由宿主发送"); },
  };
  const command = zzzPanelCommand("#原图", true)!;
  expect(await handle(command, context)).toBeUndefined();
  expect(await handle(command, { ...context, groupOriginalSignal: AbortSignal.abort() })).toBeUndefined();
  const active = { ...context, groupOriginalSignal: new AbortController().signal };
  expect(await handle(command, { ...active, message: [reference, reference] })).toBeUndefined();
  expect(await handle(command, { ...active, reply_id: "10" })).toBeUndefined();
  expect(await handle(zzzPanelCommand("%原图")!, { ...context, message: [reference, reference] })).toMatch(/引用/u);
  expect(lookups).toBe(0);
});
