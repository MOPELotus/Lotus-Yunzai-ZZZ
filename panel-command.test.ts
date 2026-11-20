import { expect, test } from "bun:test";
import { zzzPanelCommand, zzzPanelCommandHint } from "./panel-command.ts";

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
