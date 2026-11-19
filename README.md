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

## 来源

个人战绩、式舆防卫战和危局强袭战兼容 [ZZZure/ZZZ-Plugin 2.5.4](https://github.com/ZZZure/ZZZ-Plugin/tree/20575991eb9cd51461d6a10b186c66b2fc8e2309) 的 `dist/apps/{card,abyss,deadly}.js`、`resources/{card,abyss,deadly}/index.html`、同目录样式及 `resources/common/layout/`。上游代码采用 AGPL-3.0。生产旧版 Gitee 镜像同样指向此提交。旧游戏美术、原插件字体和缓存头像由部署方在本机提供。

挑战群榜沿用同版本的 `dist/apps/rank.js`、`dist/lib/rank.js` 和 `resources/rank/{abyss,deadly,deadlyHard}/`。

面板名册及官方刷新沿用同版本的 `dist/apps/panel.js`、`dist/lib/avatar.js` 和 `resources/panel/{list.html,refresh.html,refresh.css}`。
