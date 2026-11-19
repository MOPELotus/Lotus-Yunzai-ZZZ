// AGPL-3.0-only. Supported rule modules from ZZZure/ZZZ-Plugin bf47b77.
import type { buff } from "./BuffManager.ts";
import type { Calculator, skill } from "./Calculator.ts";
import type { BuffManager } from "./BuffManager.ts";
import * as character1 from "./rules/character/安比.js";
import * as character2 from "./rules/character/安东.js";
import * as character3 from "./rules/character/莱卡恩.js";
import * as character4 from "./rules/character/艾莲.js";
import * as character5 from "./rules/character/朱鸢.js";
import * as character6 from "./rules/character/比利.js";
import * as character7 from "./rules/character/可琳.js";
import * as character8 from "./rules/character/猫又.js";
import * as character9 from "./rules/character/派派.js";
import * as character10 from "./rules/character/格莉丝.js";
import * as character11 from "./rules/character/妮可.js";
import * as character12 from "./rules/character/露西.js";
import * as character13 from "./rules/character/仪玄.js";
import character14 from "./rules/character/狛野真斗.js";
import * as character15 from "./rules/character/丽娜.js";
import * as character16 from "./rules/character/星见雅.js";
import * as character17 from "./rules/character/11号.js";
import * as character18 from "./rules/character/凯撒.js";
import * as character19 from "./rules/character/珂蕾妲.js";
import * as character20 from "./rules/character/本.js";
import * as character21 from "./rules/character/悠真.js";
import * as character22 from "./rules/character/月城柳.js";
import * as character23 from "./rules/character/青衣.js";
import * as character24 from "./rules/character/赛斯.js";
import * as character25 from "./rules/character/苍角.js";
import * as character26 from "./rules/character/柏妮思.js";
import * as character27 from "./rules/character/简.js";
import * as character28 from "./rules/character/耀嘉音.js";
import * as character29 from "./rules/character/薇薇安.js";
import * as character30 from "./rules/character/波可娜.js";
import * as character31 from "./rules/character/柚叶.js";
import * as character32 from "./rules/character/潘引壶.js";
import character33 from "./rules/character/叶瞬光.js";
import * as character34 from "./rules/character/橘福福.js";
import character35 from "./rules/character/千夏.js";
import * as character36 from "./rules/character/零号·安比.js";
import * as character37 from "./rules/character/「扳机」.js";
import * as character38 from "./rules/character/伊芙琳.js";
import * as character39 from "./rules/character/爱丽丝.js";
import * as character40 from "./rules/character/「席德」.js";
import * as character41 from "./rules/character/莱特.js";
import character42 from "./rules/character/星徽·比利.js";
import character43 from "./rules/character/般岳.js";
import * as character44 from "./rules/character/雨果.js";
import * as character45 from "./rules/character/赛维里安.js";
import * as weapon1 from "./rules/weapon/「月相」-晦.js";
import * as weapon2 from "./rules/weapon/「月相」-望.js";
import * as weapon3 from "./rules/weapon/人为刀俎.js";
import * as weapon4 from "./rules/weapon/仿制星徽引擎.js";
import * as weapon5 from "./rules/weapon/加农转子.js";
import * as weapon6 from "./rules/weapon/家政员.js";
import * as weapon7 from "./rules/weapon/德玛拉电池Ⅱ型.js";
import * as weapon8 from "./rules/weapon/拘缚者.js";
import * as weapon9 from "./rules/weapon/旋钻机-赤轴.js";
import * as weapon10 from "./rules/weapon/星徽引擎.js";
import * as weapon11 from "./rules/weapon/正版变身器.js";
import * as weapon12 from "./rules/weapon/鎏金花信.js";
import * as weapon13 from "./rules/weapon/千面日陨.js";
import * as weapon14 from "./rules/weapon/幻变魔方.js";
import * as weapon15 from "./rules/weapon/强音热望.js";
import * as weapon16 from "./rules/weapon/深海访客.js";
import * as weapon17 from "./rules/weapon/燃狱齿轮.js";
import * as weapon18 from "./rules/weapon/硫磺石.js";
import * as weapon19 from "./rules/weapon/街头巨星.js";
import * as weapon20 from "./rules/weapon/裁纸刀.js";
import * as weapon21 from "./rules/weapon/钢铁肉垫.js";
import * as weapon22 from "./rules/weapon/防暴者Ⅵ型.js";
import * as weapon23 from "./rules/weapon/「残响」-Ⅰ型.js";
import * as weapon24 from "./rules/weapon/「残响」-Ⅱ型.js";
import * as weapon25 from "./rules/weapon/「残响」-Ⅲ型.js";
import * as weapon26 from "./rules/weapon/「灰烬」-钴蓝.js";
import * as weapon27 from "./rules/weapon/「电磁暴」-壹式.js";
import * as weapon28 from "./rules/weapon/「电磁暴」-贰式.js";
import * as weapon29 from "./rules/weapon/双生泣星.js";
import * as weapon30 from "./rules/weapon/含羞恶面.js";
import * as weapon31 from "./rules/weapon/啜泣摇篮.js";
import * as weapon32 from "./rules/weapon/好斗的阿炮.js";
import * as weapon33 from "./rules/weapon/嵌合编译器.js";
import * as weapon34 from "./rules/weapon/燔火胧夜.js";
import * as weapon35 from "./rules/weapon/聚宝箱.js";
import * as weapon36 from "./rules/weapon/轰鸣座驾.js";
import * as weapon37 from "./rules/weapon/雨林饕客.js";
import * as weapon38 from "./rules/weapon/霰落星殿.js";
import * as weapon39 from "./rules/weapon/青溟笼舍.js";
import * as weapon40 from "./rules/weapon/青漪灵鼎.js";
import * as weapon41 from "./rules/weapon/「恒等式」-本格.js";
import * as weapon42 from "./rules/weapon/兔能环.js";
import * as weapon43 from "./rules/weapon/奔袭獠牙.js";
import * as weapon44 from "./rules/weapon/时流贤者.js";
import * as weapon45 from "./rules/weapon/残心青囊.js";
import * as weapon46 from "./rules/weapon/玉壶青冰.js";
import * as weapon47 from "./rules/weapon/淬锋钳刺.js";
import * as weapon48 from "./rules/weapon/灼心摇壶.js";
import * as weapon49 from "./rules/weapon/狸法七变化.js";
import * as weapon50 from "./rules/weapon/玲珑妆匣.js";
import * as weapon51 from "./rules/weapon/触电唇彩.js";
import * as weapon52 from "./rules/weapon/逍遥游球.js";
import * as weapon53 from "./rules/weapon/震元奇枢.js";
import * as weapon54 from "./rules/weapon/飞鸟星梦.js";
import * as weapon55 from "./rules/weapon/云霓孤光.js";
import * as weapon56 from "./rules/weapon/十方锻星.js";
import * as weapon57 from "./rules/weapon/心弦夜响.js";
import * as weapon58 from "./rules/weapon/思络成歌.js";
import * as weapon59 from "./rules/weapon/机巧心种.js";
import * as weapon60 from "./rules/weapon/牺牲洁纯.js";
import * as weapon61 from "./rules/weapon/福虓炉炉.js";
import * as weapon62 from "./rules/weapon/索魂影眸.js";
import * as weapon63 from "./rules/weapon/怒目金刚.js";
import * as weapon64 from "./rules/weapon/焰心桂冠.js";
import * as weapon65 from "./rules/weapon/禁罪囚笼.js";
import * as weapon66 from "./rules/weapon/辉骑面铠.js";
import * as set1 from "./rules/set/云岿如我.js";
import * as set2 from "./rules/set/原始朋克.js";
import * as set3 from "./rules/set/啄木鸟电音.js";
import * as set4 from "./rules/set/如影相随.js";
import * as set5 from "./rules/set/山大王.js";
import * as set6 from "./rules/set/折枝剑歌.js";
import * as set7 from "./rules/set/拂晓生花.js";
import * as set8 from "./rules/set/摇摆爵士.js";
import * as set9 from "./rules/set/月光骑士颂.js";
import * as set10 from "./rules/set/极地重金属.js";
import * as set11 from "./rules/set/沧浪行歌.js";
import * as set12 from "./rules/set/河豚电音.js";
import * as set13 from "./rules/set/激素朋克.js";
import * as set14 from "./rules/set/炎狱重金属.js";
import * as set15 from "./rules/set/獠牙重金属.js";
import * as set16 from "./rules/set/雷暴重金属.js";
import * as set17 from "./rules/set/静听嘉音.js";
import * as set18 from "./rules/set/法厄同之歌.js";
import * as set19 from "./rules/set/流光咏叹.js";
import * as set20 from "./rules/set/混沌重金属.js";
import * as set21 from "./rules/set/混沌爵士.js";

interface Rule {
  readonly buffs?: readonly buff[];
  readonly skills?: readonly skill[];
  readonly calc?: (buffs: BuffManager, rank: number) => void;
}

export const characterRules: Readonly<Partial<Record<string, Rule>>> = {
  "安比": character1 as Rule,
  "安东": character2 as Rule,
  "莱卡恩": character3 as Rule,
  "艾莲": character4 as Rule,
  "朱鸢": character5 as Rule,
  "比利": character6 as Rule,
  "可琳": character7 as Rule,
  "猫又": character8 as Rule,
  "派派": character9 as Rule,
  "格莉丝": character10 as Rule,
  "妮可": character11 as Rule,
  "露西": character12 as Rule,
  "仪玄": character13 as Rule,
  "狛野真斗": character14 as Rule,
  "丽娜": character15 as Rule,
  "星见雅": character16 as Rule,
  "11号": character17 as Rule,
  "凯撒": character18 as Rule,
  "珂蕾妲": character19 as Rule,
  "本": character20 as Rule,
  "悠真": character21 as Rule,
  "月城柳": character22 as Rule,
  "青衣": character23 as Rule,
  "赛斯": character24 as Rule,
  "苍角": character25 as Rule,
  "柏妮思": character26 as Rule,
  "简": character27 as Rule,
  "耀嘉音": character28 as Rule,
  "薇薇安": character29 as Rule,
  "波可娜": character30 as Rule,
  "柚叶": character31 as Rule,
  "潘引壶": character32 as Rule,
  "叶瞬光": character33 as Rule,
  "橘福福": character34 as Rule,
  "千夏": character35 as Rule,
  "零号·安比": character36 as Rule,
  "「扳机」": character37 as Rule,
  "伊芙琳": character38 as Rule,
  "爱丽丝": character39 as Rule,
  "「席德」": character40 as Rule,
  "莱特": character41 as Rule,
  "星徽·比利": character42 as Rule,
  "般岳": character43 as Rule,
  "雨果": character44 as Rule,
  "赛维里安": character45 as Rule,
};

export const weaponRules: Readonly<Partial<Record<string, Rule>>> = {
  "「月相」-晦": weapon1 as Rule,
  "「月相」-望": weapon2 as Rule,
  "人为刀俎": weapon3 as Rule,
  "仿制星徽引擎": weapon4 as Rule,
  "加农转子": weapon5 as Rule,
  "家政员": weapon6 as Rule,
  "德玛拉电池Ⅱ型": weapon7 as Rule,
  "拘缚者": weapon8 as Rule,
  "旋钻机-赤轴": weapon9 as Rule,
  "星徽引擎": weapon10 as Rule,
  "正版变身器": weapon11 as Rule,
  "鎏金花信": weapon12 as Rule,
  "千面日陨": weapon13 as Rule,
  "幻变魔方": weapon14 as Rule,
  "强音热望": weapon15 as Rule,
  "深海访客": weapon16 as Rule,
  "燃狱齿轮": weapon17 as Rule,
  "硫磺石": weapon18 as Rule,
  "街头巨星": weapon19 as Rule,
  "裁纸刀": weapon20 as Rule,
  "钢铁肉垫": weapon21 as Rule,
  "防暴者Ⅵ型": weapon22 as Rule,
  "「残响」-Ⅰ型": weapon23 as Rule,
  "「残响」-Ⅱ型": weapon24 as Rule,
  "「残响」-Ⅲ型": weapon25 as Rule,
  "「灰烬」-钴蓝": weapon26 as Rule,
  "「电磁暴」-壹式": weapon27 as Rule,
  "「电磁暴」-贰式": weapon28 as Rule,
  "双生泣星": weapon29 as Rule,
  "含羞恶面": weapon30 as Rule,
  "啜泣摇篮": weapon31 as Rule,
  "好斗的阿炮": weapon32 as Rule,
  "嵌合编译器": weapon33 as Rule,
  "燔火胧夜": weapon34 as Rule,
  "聚宝箱": weapon35 as Rule,
  "轰鸣座驾": weapon36 as Rule,
  "雨林饕客": weapon37 as Rule,
  "霰落星殿": weapon38 as Rule,
  "青溟笼舍": weapon39 as Rule,
  "青漪灵鼎": weapon40 as Rule,
  "「恒等式」-本格": weapon41 as Rule,
  "兔能环": weapon42 as Rule,
  "奔袭獠牙": weapon43 as Rule,
  "时流贤者": weapon44 as Rule,
  "残心青囊": weapon45 as Rule,
  "玉壶青冰": weapon46 as Rule,
  "淬锋钳刺": weapon47 as Rule,
  "灼心摇壶": weapon48 as Rule,
  "狸法七变化": weapon49 as Rule,
  "玲珑妆匣": weapon50 as Rule,
  "触电唇彩": weapon51 as Rule,
  "逍遥游球": weapon52 as Rule,
  "震元奇枢": weapon53 as Rule,
  "飞鸟星梦": weapon54 as Rule,
  "云霓孤光": weapon55 as Rule,
  "十方锻星": weapon56 as Rule,
  "心弦夜响": weapon57 as Rule,
  "思络成歌": weapon58 as Rule,
  "机巧心种": weapon59 as Rule,
  "牺牲洁纯": weapon60 as Rule,
  "福虓炉炉": weapon61 as Rule,
  "索魂影眸": weapon62 as Rule,
  "怒目金刚": weapon63 as Rule,
  "焰心桂冠": weapon64 as Rule,
  "禁罪囚笼": weapon65 as Rule,
  "辉骑面铠": weapon66 as Rule,
};

export const setRules: Readonly<Partial<Record<string, Rule>>> = {
  "云岿如我": set1 as Rule,
  "原始朋克": set2 as Rule,
  "啄木鸟电音": set3 as Rule,
  "如影相随": set4 as Rule,
  "山大王": set5 as Rule,
  "折枝剑歌": set6 as Rule,
  "拂晓生花": set7 as Rule,
  "摇摆爵士": set8 as Rule,
  "月光骑士颂": set9 as Rule,
  "极地重金属": set10 as Rule,
  "沧浪行歌": set11 as Rule,
  "河豚电音": set12 as Rule,
  "激素朋克": set13 as Rule,
  "炎狱重金属": set14 as Rule,
  "獠牙重金属": set15 as Rule,
  "雷暴重金属": set16 as Rule,
  "静听嘉音": set17 as Rule,
  "法厄同之歌": set18 as Rule,
  "流光咏叹": set19 as Rule,
  "混沌重金属": set20 as Rule,
  "混沌爵士": set21 as Rule,
};

export const unsupportedWeaponRules = new Set([
  "「湍流」-斧型",
  "电波漫步",
]);
