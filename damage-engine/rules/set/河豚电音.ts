// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, set/河豚电音.js.
import type { BuffRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    type: '增伤',
    value: 0.2,
    range: ['RZ'],
    check: 4
  },
  {
    type: '攻击力',
    value: 0.15,
    check: 4
  }
]
