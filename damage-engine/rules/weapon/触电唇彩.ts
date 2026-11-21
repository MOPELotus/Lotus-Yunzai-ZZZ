// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/触电唇彩.js.
import type { BuffRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    type: '攻击力',
    value: [0.1, 0.115, 0.13, 0.145, 0.16]
  },
  {
    type: '增伤',
    value: [0.15, 0.175, 0.2, 0.225, 0.25]
  }
]