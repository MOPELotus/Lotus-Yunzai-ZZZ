// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/心弦夜响.js.
import type { BuffRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    type: '暴击伤害',
    value: [0.5, 0.575, 0.65, 0.725, 0.8]
  },
  {
    type: '无视抗性',
    value: [0.125, 0.145, 0.165, 0.185, 0.2].map(v => v * 2),
    element: 'Fire',
    range: ['RL', 'RZ']
  }
]