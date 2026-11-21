import { expect, test } from "bun:test";
import type { ProfileRequestContext } from "@lotus-yunzai/account";
import { createZzzInventoryQuery, zzzInventoryCommand } from "./tuning-inventory-command.ts";

const uid = "123456789";
const actor = { message_type: "group", user_id: 42, self_id: 99, groupActivitySignal: new AbortController().signal };
const source = {
  qq: "42", profileId: 2, game: "zzz", revision: "before",
  role: { uid, region: "prod_gf_cn", gameBiz: "nap_cn", chosen: true, nickname: "样本", level: 60 },
  account: {}, device: {},
} as ProfileRequestContext;

test("旧母带与存货命令有档案编号，其他游戏和文本不会进入", () => {
  for (const command of ["母带", "#母带", "#绝区零母带", "#绝区零存量", "zzz囤货", "#绝区零存货2"]) {
    expect(zzzInventoryCommand.test(command)).toBe(true);
  }
  expect(zzzInventoryCommand.exec("#绝区零母带 2")?.[1]).toBe("2");
  for (const command of ["我的母带", "#原神母带", "#存货", "#母带0", "#母带123456789"]) {
    expect(zzzInventoryCommand.test(command)).toBe(false);
  }
});

test("只查询当前 QQ 和档案，续签后仍以新版本复核，缺值与零值区分", async () => {
  let current = source;
  let requestCount = 0;
  const query = createZzzInventoryQuery({
    async requestSelectedContext(...keys) {
      expect(keys).toEqual(["42", 2, "zzz"]);
      return current;
    },
  }, {
    async fetchZzzTuningInventory(selected) {
      expect(selected).toBe(source);
      requestCount++;
      current = { ...source, revision: "after-refresh" };
      return { uid, inventory: { monochrome: 0, polychrome: 3123, encryptedMasterTape: 4, boopon: 7 },
        revision: current.revision, fetchedAt: "", refreshedCookie: true };
    },
  }, new AbortController().signal, async (model) => {
    expect(model).toMatchObject({ qq: "42", uid, nickname: "样本", level: 60, rows: [
      { name: "菲林底片", value: "0" }, { name: "菲林", value: "3,123" },
      { name: "加密母带", value: "4" }, { name: "原装母带", value: "—" }, { name: "邦布券", value: "7" },
    ] });
    throw Error("测试渲染失败后的同数据文字");
  });
  expect(await query(2, { ...actor, isDelegated: true })).toContain("已连接");
  expect(await query(2, { ...actor, groupActivitySignal: undefined })).toContain("已连接");
  expect(await query(2, { ...actor, message: [{ type: "at", qq: 43 }] })).toContain("只能查询自己");
  expect(await query(256, actor)).toContain("档案编号");
  expect(requestCount).toBe(0);
  expect(await query(2, { ...actor, message: [{ type: "at", qq: 99 }] })).toContain("原装母带：—");
  expect(requestCount).toBe(1);
});

test("渲染期间档案换绑或断开会丢弃旧库存", async () => {
  for (const change of ["换绑", "断开"]) {
    let current = source;
    const connection = new AbortController();
    const result = createZzzInventoryQuery({ async requestSelectedContext() { return current; } }, {
      async fetchZzzTuningInventory() {
        return { uid, inventory: { polychrome: 1234 }, revision: source.revision, fetchedAt: "", refreshedCookie: false };
      },
    }, new AbortController().signal, async (_model, options) => {
      if (change === "换绑") current = { ...source, revision: "different", role: { ...source.role, uid: "223456789" } };
      else {
        connection.abort();
        expect(options?.signal?.aborted).toBe(true);
      }
      throw Error("测试兜底亦不得发陈旧数据");
    });
    const received = await result(2, { ...actor, groupActivitySignal: connection.signal });
    if (change === "断开") expect(received).toBeUndefined();
    else expect(received).toContain("档案已变化");
  }
});
