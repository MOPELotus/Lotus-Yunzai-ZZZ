import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withGameCommandProfiles } from "@lotus-yunzai/account";
import { rankCommand } from "./challenge-rank-model.ts";
import { zzzChallengeReminderCommand } from "./challenge-reminder.ts";
import { createModule } from "./index.ts";
import { zzzPanelCommand } from "./panel-command.ts";
import { zzzPanelRankCommand } from "./panel-rank-model.ts";

const user = 42;
const scope = { user, profiles: { gs: 8, sr: 9, zzz: 4 }, isCurrent: () => true };

test("绝区零面板、挑战状态和群榜本人档案采用绝区零默认，显式档号优先", () => {
  const entries = [
    [zzzPanelCommand, "%面板列表", "%面板列表1"],
    [zzzPanelCommand, "%艾莲面板", "%艾莲面板1"],
    [zzzPanelCommand, "%艾莲展柜面板", "%艾莲展柜面板1"],
    [zzzPanelCommand, "%更新艾莲面板", "%更新艾莲面板1"],
    [zzzPanelCommand, "%展板更新面板", "%展板更新面板1"],
    [zzzPanelCommand, "%展柜练度统计", "%展柜练度统计1"],
    [zzzPanelCommand, "%艾莲伤害技能2", "%艾莲伤害2 档案1"],
    [zzzChallengeReminderCommand, "%查询挑战状态", "%查询挑战状态1"],
    [rankCommand, "%显示危局排名", "%显示危局排名1"],
    [zzzPanelRankCommand, "%开启角色面板排名", "%开启角色面板排名1"],
    [zzzPanelRankCommand, "%最强安比", "%最强安比 1"],
    [zzzPanelRankCommand, "%安比综合榜 页2", "%安比综合榜1 页2"],
  ] as const;
  for (const [match, implicit, explicit] of entries) {
    expect(match(implicit)).toMatchObject({ profileId: 1 });
    withGameCommandProfiles(scope, () => {
      expect(match(implicit)).toMatchObject({ profileId: 4 });
      expect(match(explicit)).toMatchObject({ profileId: 1 });
    });
  }
  withGameCommandProfiles(scope, () => {
    expect(zzzPanelCommand("%艾莲伤害2")).toMatchObject({ profileId: 2, skill: undefined });
    expect(zzzPanelRankCommand("%显示国际服角色面板排名")).toMatchObject({ profileId: 1, international: true });
    expect(zzzPanelRankCommand("%显示国际服角色面板排名2")).toMatchObject({ profileId: 2, international: true });
    expect(rankCommand("%危局排名")).toEqual({ kind: "board", mode: "DEADLY" });
    expect(zzzPanelCommand("%原图")).toEqual({ kind: "original" });
  });
});

test("本人战绩和调频从模块实际聊天派发读取默认档号", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-zzz-command-default-"));
  const previous = Bun.env.LOTUS_PROFILE_DIR;
  const { signal } = new AbortController();
  try {
    Bun.env.LOTUS_PROFILE_DIR = directory;
    const { fallback } = createModule({ signal, lockFile: async () => { throw new Error("没有档案时不应写入"); } });
    const reply = (entry: string, message_type = "private") => fallback(entry, {
      normalizedMessage: entry, self_id: 100, user_id: user, message_type,
      privateCredentialSignal: signal, reply() { throw new Error("无登录档案不应发起网络请求"); },
    });
    const entries = ["#绝区零母带", "#绝区零邦布", "#绝区零卡片", "#绝区零区域收集",
      "#绝区零迷宫战绩", "#绝区零枯萎苗圃", "#绝区零迷失之地", "#绝区零爬塔", "#绝区零危局",
      "#绝区零式舆", "#绝区零拟境", "#绝区零临界", "#绝区零获取抽卡链接", "#绝区零抽卡链接",
      "#绝区零逐抽记录", "#绝区零抽卡记录", "#绝区零更新抽卡记录"];
    for (const entry of entries) {
      await withGameCommandProfiles(scope, async () => {
        expect(JSON.stringify(await reply(entry))).toContain("profile 4");
        expect(JSON.stringify(await reply(entry + "1"))).toContain("profile 1");
      });
    }
    await withGameCommandProfiles(scope, async () => {
      for (const alias of ["zzz角色", "/zzz角色", "/绝区零角色"]) expect(await reply(alias)).toContain("profile 4");
      expect(await reply("#绝区零月报 页2")).toContain("%月报统计4 页 2");
      expect(await reply("#绝区零月报1 页2")).toContain("%月报统计1 页 2");
      expect(await reply("#绝区零迷宫1 页2")).toContain("%迷宫战绩1 页 2");
      expect(JSON.stringify(await reply("#绝区零抽卡链接1", "group"))).toContain("%抽卡链接1");
    });
    expect(await withGameCommandProfiles({ ...scope, isCurrent: () => false }, () => reply("#绝区零卡片"))).toContain("profile 1");
    expect(await reply("#绝区零卡片")).toContain("profile 1");
  } finally {
    if (previous === undefined) delete Bun.env.LOTUS_PROFILE_DIR;
    else Bun.env.LOTUS_PROFILE_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
