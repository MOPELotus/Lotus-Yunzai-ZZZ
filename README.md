# Lotus-Yunzai 绝区零

## 个人战绩

发送 `%卡片`、`%个人信息`、`%角色` 或 `%card` 查看当前登录档案的国服战绩。也接受 `#zzz` 和 `#绝区零` 前缀。命令末尾加档案编号可查询其他档案，例如 `%卡片2`。卡片包含活跃天数、代理人与邦布数量、式舆防卫战进度以及代理人与邦布的等级和影画或星级。

如已部署旧版绝区零插件，可将 `LOTUS_ZZZ_LEGACY_RESOURCES_DIR` 指向其 `resources` 目录。战绩卡从该目录读取旧主题、字体及已经下载的代理人和邦布头像。原主题或头像缺失时，卡片用内置排版和官方或图鉴已有头像继续出图。此目录只需提供读取权限。

## 式舆防卫战

发送 `%式舆防卫战`、`%式舆`、`%深渊`、`%防卫战` 或 `%防卫` 查询本期，前置「上期」或「往期」查询上一期，例如 `%上期深渊2`。账号、前缀和档案编号规则与个人战绩相同。卡片按官方记录展示第五至第一防线，包括统计周期、总分、评级、百分比、通关时间、增益及对应队伍。以相同的旧资源目录读取 `abyss/images/` 主题和 `common/images/` 图标。

## 危局强袭战

发送 `%危局强袭战`、`%危局`、`%强袭战` 或 `%强袭` 查询本期。前置「上期」或「往期」查询上一期，例如 `%上期危局2`。战绩卡用一张图展示试炼总分、星级、排名百分比及各首领的得分、通关时间和队伍。官方返回绝境记录时，同一张卡先展示绝境详情。原主题从旧资源目录的 `deadly/images/` 与 `common/images/` 读取。

## 挑战群排行榜

群内发送 `%深渊排名`、`%危局排名` 或 `%危局绝境排名`，查询本期式舆第五防线、危局试炼或危局绝境。首次在群内成功查询本期战绩会登记到该群。成员可用 `%隐藏深渊排名`、`%显示深渊排名` 或对应的危局命令控制可见性。危局试炼与绝境共用可见性开关。私聊和上期查询只回复个人战绩。

群榜使用宿主 Valkey 和协议端实时群成员名单。可通过 `LOTUS_ZZZ_RANK_CONFIG` 指定旧格式的 `rank.yaml`，或置于宿主的 `config/zzz-rank.yaml`。配置支持 `allow_group`、`white_list`、`black_list` 及 1 至 15 名的 `max_display`。有旧 Valkey 榜单时，可将 `LOTUS_ZZZ_LEGACY_DATA_DIR` 指向旧 `data/ZZZ-Plugin`，用同群的旧可见性和 UID 关系续读 `abyss/` 与 `deadly/` 中的战绩。新登记按群保存。

## 面板名册

发送 `%面板` 或 `%面板列表` 查看已绑定角色的本地名册，支持档案号后缀。国服米游社档案可使用 `%更新面板` 或 `%面板刷新` 拉取已拥有角色，也可以发送 `%更新琉音、安比面板2` 只刷新档案 2 的指定角色。新回执用绿点标记本次更新角色，其余角色保留原顺序。刷新间隔可用宿主的 `config/zzz-panel.yaml` 或 `LOTUS_ZZZ_PANEL_CONFIG` 设置，`interval` 以秒计，`roleInterval` 以毫秒计，低于 100 毫秒时沿用旧版的 100 毫秒下限。

名册可从 `LOTUS_ZZZ_LEGACY_DATA_DIR/panel/<UID>.json` 只读续用，刷新后的数据存到 `data/zzzPanels/<区服>/<QQ>/<UID>.json`。可通过 `LOTUS_ZZZ_PANEL_DIR` 配置此目录。原五列主题和旧角色别名沿用 `LOTUS_ZZZ_LEGACY_RESOURCES_DIR` 对应的旧插件资源与配置。

发送 `%琉音面板` 或 `%客服面板2` 查看同档案的角色详情。图卡显示角色等级、影画、六项技能、属性、音擎以及各槽位驱动盘的主副词条，保留真实的升级次数、零值和未装备状态。详情直接读取已保存的米游社及旧展柜面板。保存在旧资源目录的角色立绘和主题素材可继续使用。

角色面板按原角色及配装权重显示驱动盘总分、单盘分档、有益词条和有效词条。评分随盘位、等级、稀有度及主副词条变化。已装备但得到零分的驱动盘保留 `0.00`；空槽显示未装备。

引用机器人刚发给自己的角色面板，发送 `%原图` 可取得图中使用的本地立绘原文件。引用须来自同一机器人、协议和会话，三小时内有效。原素材不存在、被替换或档案换绑时，请先重新查询面板。

发送 `%更新展柜面板` 或 `%展柜面板刷新2`，将对应档案的游戏 UID 提交给第三方 Enka 公开展柜。它只读取游戏内已公开展示的角色，需在 `LOTUS_ZZZ_LEGACY_RESOURCES_DIR` 对应的 `map/` 提供角色、音擎及驱动盘资料。结果按区服、QQ 与 UID 独立保存到 `data/zzzShowcasePanels/`，可通过 `LOTUS_ZZZ_SHOWCASE_DIR` 改变该目录。`%客服展柜面板2` 查看单个公开角色。`%客服面板2` 优先使用已保存的米游社或旧面板，再查同档案的公开展柜。公开属性根据本地游戏资料计算。

## 练度统计

发送 `%练度` 或 `%练度统计2`，按原评分统计所选档案的代理人、S 级音擎比例、高影代理人及 SSS 以上驱动盘数量。同分保留存档顺序。练度优先读取该档案的本地面板，缺档时读取已保存的公开展柜。使用 `%展柜练度统计2` 可直接查看该档案的公开展柜。图卡标注来源，一张卡只统计一份存档。未装备音擎时比例显示 `—`。

## 伤害计算

发送 `%安比伤害`、`%11号伤害` 或 `%柳伤害7 档案2`。图卡显示所选技能及其他技能的暴击和期望伤害、乘区、增益及主副词条差异。数字是技能序号，`档案` 后可指定账号档案。只读取自己的本地面板或该档案已保存的公开展柜，以图卡中注明的敌方条件计算。

已核验固定旧版的 45 位代理人、68 件音擎和 21 套驱动盘的原伤害规则。星见雅、仪玄和叶瞬光沿用原特殊属性，技能序号随当前影画可用技能变化。完整名单见[已核验的代理人表](panel-damage.ts)和[原规则目录](damage-engine/rules)。

`「湍流」-斧型`按触发后的冲击力计算，`电波漫步`按叠满三层计算。两件音擎各档精炼用旧版资料构造的合成面板逐级核验。

计算需要原版本的角色倍率、异常和装备资料，沿用 `LOTUS_ZZZ_LEGACY_RESOURCES_DIR` 及其相邻的 `dist/model/damage/character/`。部署方可用 `LOTUS_ZZZ_DAMAGE_DATA_DIR` 指定角色倍率目录。资料缺失、版本不符或配装资料无法核实时提示无法计算。

原版计算器未产出柏妮思六影「强化 E 双份额外灼烧」的数值，图卡会提示该技能暂无原版计算结果，其他技能按旧版序号显示。

## 卡池历史

发送 `%鲨鱼卡池历史` 或 `%深海访客复刻记录` 查看特定代理人或音擎出现在限定频段的历史。保留旧角色别名、S/A 级和按期次的国服日期，回执注明公开资料所载的截止日。此查询无需登录，匿名读取原版使用的公开 JSON，数据源故障时继续使用进程内最后一次成功读取的数据。 [GachaClock 绝区零历史数据](https://github.com/iaoongin/GachaClock/blob/main/spider/data/zzz/history.json)

发送 `%S级角色复刻统计`、`%A级角色复刻统计`、`%S级音擎复刻统计` 或 `%A级音擎复刻统计` 查看该类别的历史快照。`%角色复刻统计` 默认查询 S 级角色。等待天数按来源覆盖内的日期计算，回执标明统计日和来源截止日。

发送 `%2.7下半卡池` 或 `#zzzv2.7卡池` 按历史版本查看限定角色、音擎和 S/A 级名单。文字回执按上半、下半显示来源所载记录和日期。2.7 下半的机巧心种按官方公告纠正了公开资料的版本错标。 [国服 2.7 版本下期公告](https://zzz.mihoyo.com/news/163519)

发送 `%当前卡池`、`%本期卡池` 或 `%卡池` 查询国服当前限时频段。当期以国服官方图文公告正文写明的时间为准，回执包含限定 S 级代理人和音擎及其官方横幅。公告尚无明确起止时间或无法核验有效期时会说明。A级名单以游戏内调频界面为准。 [国服官方频段公告示例](https://zzz.mihoyo.com/news/167288)

## 来源

个人战绩、式舆防卫战和危局强袭战兼容 [ZZZure/ZZZ-Plugin 2.5.4](https://github.com/ZZZure/ZZZ-Plugin/tree/20575991eb9cd51461d6a10b186c66b2fc8e2309) 的 `dist/apps/{card,abyss,deadly}.js`、`resources/{card,abyss,deadly}/index.html`、同目录样式及 `resources/common/layout/`。上游代码采用 AGPL-3.0。生产旧版 Gitee 镜像同样指向此提交。旧游戏美术、原插件字体和缓存头像由部署方在本机提供。

挑战群榜沿用同版本的 `dist/apps/rank.js`、`dist/lib/rank.js` 和 `resources/rank/{abyss,deadly,deadlyHard}/`。

面板名册、官方刷新和角色详情沿用同版本的 `dist/apps/panel.js`、`dist/lib/avatar.js` 和 `resources/panel/{list.html,refresh.html,refresh.css,card.html,card.css}`。

驱动盘评分沿用同版本的 `dist/model/score/Score.js`、`dist/lib/score.js`、角色评分规则、`EquipScore.json`、`EquipMainStats.json` 和 `EquipBaseValue.json`。内置规则随模块发布。

练度统计沿用同版本的 `dist/apps/panel.js`、`dist/model/avatar.js` 及 `resources/proficiency/{index.html,index.css}`。

伤害计算沿用对应构建的 [ZZZure/ZZZ-Plugin 源码提交 bf47b77](https://github.com/ZZZure/ZZZ-Plugin/tree/bf47b77790aa7540f03a1e3c6866be0876b12b82/src/model/damage)，保留作者的 AGPL-3.0 规则及原始乘区和词条公式。图卡以同版本 `resources/panel/{damage.html,damage.css}` 为基准。角色倍率、装备数据和美术由部署方提供。

调频详图沿用同版本的 `resources/gachalog/{index.html,index.css}` 和 `resources/common/layout/`。现有图卡由 Lotus-Yunzai 的 Skia 模板绘制。

公开展柜沿用同版本的 `dist/model/Enka/` 数据适配以及 [Enka.Network 绝区零公开接口规范](https://github.com/EnkaNetwork/API-docs/blob/master/docs/zzz/api.md)。
