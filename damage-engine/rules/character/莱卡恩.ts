// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, character/莱卡恩/calc.js.
import type { BuffRule, SkillRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    name: '6影',
    type: '增伤',
    value: 0.1 * 5
  },
  {
    name: '核心被动：金属狼足',
    type: '无视抗性',
    value: 0.25,
    teamTarget: true,
    element: 'Ice'
  },
  {
    name: '额外能力：优雅猎群',
    type: '失衡易伤',
    teamTarget: true,
    value: 0.35
  }
]

export const skills: SkillRule[] = [
  { name: '蓄力普攻：五段一级', type: 'AX51' },
  { name: '蓄力普攻：五段二级', type: 'AX52' },
  { name: '闪避反击：保持清洁', type: 'CF' },
  { name: '蓄力强化特殊技：狂猎时刻', isMain: true, type: 'EQX' },
  { name: '连携技：遵命', type: 'RL' },
  { name: '终结技：不辱使命', type: 'RZ' }
]