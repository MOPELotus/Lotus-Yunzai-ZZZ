import { expect, test } from "bun:test";
import { zzzRegionName } from "./card-theme.ts";

test("显示区服名称并拦截档案内的区服代码", () => {
  expect(zzzRegionName("prod_gf_cn")).toBe("国服");
  expect(zzzRegionName("prod_qd_cn")).toBe("渠道服");
  expect(zzzRegionName("prod_gf_cn", " 新艾利都 ")).toBe("新艾利都");
  expect(zzzRegionName("prod_qd_cn", "prod_gf_cn")).toBe("渠道服");
  expect(zzzRegionName("prod_unlisted")).toBe("未知区服");
});
