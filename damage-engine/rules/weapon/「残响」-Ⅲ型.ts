// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/「残响」-Ⅲ型.js.
import type { BuffRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    type: '攻击力',
    teamTarget: true,
    stackable: false,
    value: [0.08, 0.09, 0.1, 0.11, 0.12]
  }
]