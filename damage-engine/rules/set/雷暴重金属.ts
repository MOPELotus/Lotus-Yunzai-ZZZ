// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, set/雷暴重金属.js.
import type { BuffRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    type: '增伤',
    value: 0.1,
    check: 2,
    element: 'Electric'
  },
  {
    type: '攻击力',
    value: 0.28,
    check: 4
  }
]
