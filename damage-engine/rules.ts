// AGPL-3.0-only. Supported rule modules from ZZZure/ZZZ-Plugin bf47b77.
import type { DamageRule } from "./rule-types.ts";
import * as character1 from "./rules/character/安比.ts";
import * as character2 from "./rules/character/安东.ts";
import * as character3 from "./rules/character/莱卡恩.ts";
import * as character4 from "./rules/character/艾莲.ts";
import * as character5 from "./rules/character/朱鸢.ts";
import * as character6 from "./rules/character/比利.ts";
import * as character7 from "./rules/character/可琳.ts";
import * as character8 from "./rules/character/猫又.ts";
import * as character9 from "./rules/character/派派.ts";
import * as character10 from "./rules/character/格莉丝.ts";
import * as character11 from "./rules/character/妮可.ts";
import * as character12 from "./rules/character/露西.ts";
import * as character13 from "./rules/character/仪玄.ts";
import character14 from "./rules/character/狛野真斗.ts";
import * as character15 from "./rules/character/丽娜.ts";
import * as character16 from "./rules/character/星见雅.ts";
import * as character17 from "./rules/character/11号.ts";
import * as character18 from "./rules/character/凯撒.ts";
import * as character19 from "./rules/character/珂蕾妲.ts";
import * as character20 from "./rules/character/本.ts";
import * as character21 from "./rules/character/悠真.ts";
import * as character22 from "./rules/character/月城柳.ts";
import * as character23 from "./rules/character/青衣.ts";
import * as character24 from "./rules/character/赛斯.ts";
import * as character25 from "./rules/character/苍角.ts";
import * as character26 from "./rules/character/柏妮思.ts";
import * as character27 from "./rules/character/简.ts";
import * as character28 from "./rules/character/耀嘉音.ts";
import * as character29 from "./rules/character/薇薇安.ts";
import * as character30 from "./rules/character/波可娜.ts";
import * as character31 from "./rules/character/柚叶.ts";
import * as character32 from "./rules/character/潘引壶.ts";
import character33 from "./rules/character/叶瞬光.ts";
import * as character34 from "./rules/character/橘福福.ts";
import character35 from "./rules/character/千夏.ts";
import * as character36 from "./rules/character/零号·安比.ts";
import * as character37 from "./rules/character/「扳机」.ts";
import * as character38 from "./rules/character/伊芙琳.ts";
import * as character39 from "./rules/character/爱丽丝.ts";
import * as character40 from "./rules/character/「席德」.ts";
import * as character41 from "./rules/character/莱特.ts";
import character42 from "./rules/character/星徽·比利.ts";
import character43 from "./rules/character/般岳.ts";
import * as character44 from "./rules/character/雨果.ts";
import * as character45 from "./rules/character/赛维里安.ts";
import * as weapon1 from "./rules/weapon/「月相」-晦.ts";
import * as weapon2 from "./rules/weapon/「月相」-望.ts";
import * as weapon3 from "./rules/weapon/人为刀俎.ts";
import * as weapon4 from "./rules/weapon/仿制星徽引擎.ts";
import * as weapon5 from "./rules/weapon/加农转子.ts";
import * as weapon6 from "./rules/weapon/家政员.ts";
import * as weapon7 from "./rules/weapon/德玛拉电池Ⅱ型.ts";
import * as weapon8 from "./rules/weapon/拘缚者.ts";
import * as weapon9 from "./rules/weapon/旋钻机-赤轴.ts";
import * as weapon10 from "./rules/weapon/星徽引擎.ts";
import * as weapon11 from "./rules/weapon/正版变身器.ts";
import * as weapon12 from "./rules/weapon/鎏金花信.ts";
import * as weapon13 from "./rules/weapon/千面日陨.ts";
import * as weapon14 from "./rules/weapon/幻变魔方.ts";
import * as weapon15 from "./rules/weapon/强音热望.ts";
import * as weapon16 from "./rules/weapon/深海访客.ts";
import * as weapon17 from "./rules/weapon/燃狱齿轮.ts";
import * as weapon18 from "./rules/weapon/硫磺石.ts";
import * as weapon19 from "./rules/weapon/街头巨星.ts";
import * as weapon20 from "./rules/weapon/裁纸刀.ts";
import * as weapon21 from "./rules/weapon/钢铁肉垫.ts";
import * as weapon22 from "./rules/weapon/防暴者Ⅵ型.ts";
import * as weapon23 from "./rules/weapon/「残响」-Ⅰ型.ts";
import * as weapon24 from "./rules/weapon/「残响」-Ⅱ型.ts";
import * as weapon25 from "./rules/weapon/「残响」-Ⅲ型.ts";
import * as weapon26 from "./rules/weapon/「灰烬」-钴蓝.ts";
import * as weapon27 from "./rules/weapon/「电磁暴」-壹式.ts";
import * as weapon28 from "./rules/weapon/「电磁暴」-贰式.ts";
import * as weapon29 from "./rules/weapon/双生泣星.ts";
import * as weapon30 from "./rules/weapon/含羞恶面.ts";
import * as weapon31 from "./rules/weapon/啜泣摇篮.ts";
import * as weapon32 from "./rules/weapon/好斗的阿炮.ts";
import * as weapon33 from "./rules/weapon/嵌合编译器.ts";
import * as weapon34 from "./rules/weapon/燔火胧夜.ts";
import * as weapon35 from "./rules/weapon/聚宝箱.ts";
import * as weapon36 from "./rules/weapon/轰鸣座驾.ts";
import * as weapon37 from "./rules/weapon/雨林饕客.ts";
import * as weapon38 from "./rules/weapon/霰落星殿.ts";
import * as weapon39 from "./rules/weapon/青溟笼舍.ts";
import * as weapon40 from "./rules/weapon/青漪灵鼎.ts";
import * as weapon41 from "./rules/weapon/「恒等式」-本格.ts";
import * as weapon42 from "./rules/weapon/兔能环.ts";
import * as weapon43 from "./rules/weapon/奔袭獠牙.ts";
import * as weapon44 from "./rules/weapon/时流贤者.ts";
import * as weapon45 from "./rules/weapon/残心青囊.ts";
import * as weapon46 from "./rules/weapon/玉壶青冰.ts";
import * as weapon47 from "./rules/weapon/淬锋钳刺.ts";
import * as weapon48 from "./rules/weapon/灼心摇壶.ts";
import * as weapon49 from "./rules/weapon/狸法七变化.ts";
import * as weapon50 from "./rules/weapon/玲珑妆匣.ts";
import * as weapon51 from "./rules/weapon/触电唇彩.ts";
import * as weapon52 from "./rules/weapon/逍遥游球.ts";
import * as weapon53 from "./rules/weapon/震元奇枢.ts";
import * as weapon54 from "./rules/weapon/飞鸟星梦.ts";
import * as weapon55 from "./rules/weapon/云霓孤光.ts";
import * as weapon56 from "./rules/weapon/十方锻星.ts";
import * as weapon57 from "./rules/weapon/心弦夜响.ts";
import * as weapon58 from "./rules/weapon/思络成歌.ts";
import * as weapon59 from "./rules/weapon/机巧心种.ts";
import * as weapon60 from "./rules/weapon/牺牲洁纯.ts";
import * as weapon61 from "./rules/weapon/福虓炉炉.ts";
import * as weapon62 from "./rules/weapon/索魂影眸.ts";
import * as weapon63 from "./rules/weapon/怒目金刚.ts";
import * as weapon64 from "./rules/weapon/焰心桂冠.ts";
import * as weapon65 from "./rules/weapon/禁罪囚笼.ts";
import * as weapon66 from "./rules/weapon/辉骑面铠.ts";
import * as weapon67 from "./rules/weapon/「湍流」-斧型.ts";
import * as weapon68 from "./rules/weapon/电波漫步.ts";
import * as set1 from "./rules/set/云岿如我.ts";
import * as set2 from "./rules/set/原始朋克.ts";
import * as set3 from "./rules/set/啄木鸟电音.ts";
import * as set4 from "./rules/set/如影相随.ts";
import * as set5 from "./rules/set/山大王.ts";
import * as set6 from "./rules/set/折枝剑歌.ts";
import * as set7 from "./rules/set/拂晓生花.ts";
import * as set8 from "./rules/set/摇摆爵士.ts";
import * as set9 from "./rules/set/月光骑士颂.ts";
import * as set10 from "./rules/set/极地重金属.ts";
import * as set11 from "./rules/set/沧浪行歌.ts";
import * as set12 from "./rules/set/河豚电音.ts";
import * as set13 from "./rules/set/激素朋克.ts";
import * as set14 from "./rules/set/炎狱重金属.ts";
import * as set15 from "./rules/set/獠牙重金属.ts";
import * as set16 from "./rules/set/雷暴重金属.ts";
import * as set17 from "./rules/set/静听嘉音.ts";
import * as set18 from "./rules/set/法厄同之歌.ts";
import * as set19 from "./rules/set/流光咏叹.ts";
import * as set20 from "./rules/set/混沌重金属.ts";
import * as set21 from "./rules/set/混沌爵士.ts";


export const characterRules: Readonly<Partial<Record<string, DamageRule>>> = {
  "安比": character1,
  "安东": character2,
  "莱卡恩": character3,
  "艾莲": character4,
  "朱鸢": character5,
  "比利": character6,
  "可琳": character7,
  "猫又": character8,
  "派派": character9,
  "格莉丝": character10,
  "妮可": character11,
  "露西": character12,
  "仪玄": character13,
  "狛野真斗": character14,
  "丽娜": character15,
  "星见雅": character16,
  "11号": character17,
  "凯撒": character18,
  "珂蕾妲": character19,
  "本": character20,
  "悠真": character21,
  "月城柳": character22,
  "青衣": character23,
  "赛斯": character24,
  "苍角": character25,
  "柏妮思": character26,
  "简": character27,
  "耀嘉音": character28,
  "薇薇安": character29,
  "波可娜": character30,
  "柚叶": character31,
  "潘引壶": character32,
  "叶瞬光": character33,
  "橘福福": character34,
  "千夏": character35,
  "零号·安比": character36,
  "「扳机」": character37,
  "伊芙琳": character38,
  "爱丽丝": character39,
  "「席德」": character40,
  "莱特": character41,
  "星徽·比利": character42,
  "般岳": character43,
  "雨果": character44,
  "赛维里安": character45,
};

export const weaponRules: Readonly<Partial<Record<string, DamageRule>>> = {
  "「月相」-晦": weapon1,
  "「月相」-望": weapon2,
  "人为刀俎": weapon3,
  "仿制星徽引擎": weapon4,
  "加农转子": weapon5,
  "家政员": weapon6,
  "德玛拉电池Ⅱ型": weapon7,
  "拘缚者": weapon8,
  "旋钻机-赤轴": weapon9,
  "星徽引擎": weapon10,
  "正版变身器": weapon11,
  "鎏金花信": weapon12,
  "千面日陨": weapon13,
  "幻变魔方": weapon14,
  "强音热望": weapon15,
  "深海访客": weapon16,
  "燃狱齿轮": weapon17,
  "硫磺石": weapon18,
  "街头巨星": weapon19,
  "裁纸刀": weapon20,
  "钢铁肉垫": weapon21,
  "防暴者Ⅵ型": weapon22,
  "「残响」-Ⅰ型": weapon23,
  "「残响」-Ⅱ型": weapon24,
  "「残响」-Ⅲ型": weapon25,
  "「灰烬」-钴蓝": weapon26,
  "「电磁暴」-壹式": weapon27,
  "「电磁暴」-贰式": weapon28,
  "双生泣星": weapon29,
  "含羞恶面": weapon30,
  "啜泣摇篮": weapon31,
  "好斗的阿炮": weapon32,
  "嵌合编译器": weapon33,
  "燔火胧夜": weapon34,
  "聚宝箱": weapon35,
  "轰鸣座驾": weapon36,
  "雨林饕客": weapon37,
  "霰落星殿": weapon38,
  "青溟笼舍": weapon39,
  "青漪灵鼎": weapon40,
  "「恒等式」-本格": weapon41,
  "兔能环": weapon42,
  "奔袭獠牙": weapon43,
  "时流贤者": weapon44,
  "残心青囊": weapon45,
  "玉壶青冰": weapon46,
  "淬锋钳刺": weapon47,
  "灼心摇壶": weapon48,
  "狸法七变化": weapon49,
  "玲珑妆匣": weapon50,
  "触电唇彩": weapon51,
  "逍遥游球": weapon52,
  "震元奇枢": weapon53,
  "飞鸟星梦": weapon54,
  "云霓孤光": weapon55,
  "十方锻星": weapon56,
  "心弦夜响": weapon57,
  "思络成歌": weapon58,
  "机巧心种": weapon59,
  "牺牲洁纯": weapon60,
  "福虓炉炉": weapon61,
  "索魂影眸": weapon62,
  "怒目金刚": weapon63,
  "焰心桂冠": weapon64,
  "禁罪囚笼": weapon65,
  "辉骑面铠": weapon66,
  "「湍流」-斧型": weapon67,
  "电波漫步": weapon68,
};

export const setRules: Readonly<Partial<Record<string, DamageRule>>> = {
  "云岿如我": set1,
  "原始朋克": set2,
  "啄木鸟电音": set3,
  "如影相随": set4,
  "山大王": set5,
  "折枝剑歌": set6,
  "拂晓生花": set7,
  "摇摆爵士": set8,
  "月光骑士颂": set9,
  "极地重金属": set10,
  "沧浪行歌": set11,
  "河豚电音": set12,
  "激素朋克": set13,
  "炎狱重金属": set14,
  "獠牙重金属": set15,
  "雷暴重金属": set16,
  "静听嘉音": set17,
  "法厄同之歌": set18,
  "流光咏叹": set19,
  "混沌重金属": set20,
  "混沌爵士": set21,
};
