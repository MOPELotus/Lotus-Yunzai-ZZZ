// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/「残响」-Ⅱ型.js.
import type { BuffRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    type: '异常掌控',
    teamTarget: true,
    stackable: false,
    value: [10, 12, 13, 15, 16]
  },
  {
    type: '异常精通',
    teamTarget: true,
    stackable: false,
    value: [10, 12, 13, 15, 16]
  }
]