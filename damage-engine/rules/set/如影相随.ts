// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, set/如影相随.js.
import type { BuffRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    type: '增伤',
    value: 0.15,
    check: 2,
    range: ['CC', '追加攻击']
  },
  {
    type: '攻击力',
    value: 0.04 * 3,
    check: 4
  },
  {
    type: '暴击率',
    value: 0.04 * 3,
    check: 4
  }
]
