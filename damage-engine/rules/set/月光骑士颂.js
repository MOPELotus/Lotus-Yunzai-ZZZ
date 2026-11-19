// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, set/月光骑士颂.js.
/** @type {import('#interface').buff[]} */
export const buffs = [
  {
    type: '增伤',
    value: 0.18,
    teamTarget: true,
    stackable: false,
    check: ({ avatar, buffM, runtime }) => buffM.setCount.月光骑士颂 >= 4 && avatar.avatar_profession === runtime.professionEnum.支援 // 仅支援角色
  }
]
