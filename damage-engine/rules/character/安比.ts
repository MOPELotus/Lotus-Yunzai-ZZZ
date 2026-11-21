// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, character/安比/calc.js.
import type { BuffRule, SkillRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    name: '6影',
    type: '增伤',
    value: 0.45,
    range: ['A', 'CC']
  }
]

export const skills: SkillRule[] = [
  { name: '感电每段', type: '感电' },
  { name: '普攻：落雷', type: 'AX' },
  { name: '闪避反击：迅雷', type: 'CF' },
  { name: '强化特殊技：苍雷斩', type: 'EQ' },
  { name: '连携技：电磁引擎', type: 'RL' },
  { name: '终结技：过载引擎', type: 'RZ' }
]
