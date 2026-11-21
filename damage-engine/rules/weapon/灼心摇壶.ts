// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/灼心摇壶.js.
import type { BuffRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    type: '增伤',
    value: [0.035, 0.044, 0.052, 0.061, 0.07].map(v => v * 10)
  },
  {
    type: '异常精通',
    value: [50, 62, 75, 87, 100]
  }
]