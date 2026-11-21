// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/轰鸣座驾.js.
import type { BuffRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    type: '攻击力',
    value: [0.08, 0.092, 0.104, 0.116, 0.128]
  },
  {
    type: '异常精通',
    value: [40, 46, 52, 58, 64]
  }
]