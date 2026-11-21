# 雷奥奈达在线地图 · 社区手册

English: [CONTRIBUTING.md](../CONTRIBUTING.md)

底图就是游戏内地图本身（来自 GTADB 的瓦片）。底图上叠加的所有信息，包括地名、地标建筑、道路名和各类点位，都存放在 [`data/`](../data) 目录下的 GeoJSON 文本文件里。任何人都可以通过 Pull Request（PR）修正或补充这些信息。CI 会自动检查格式，合并后网站自动更新。

## 三种参与方式

1. **直接报告，不需要任何准备。** 在地图上找到缺失或有错的地方，电脑上右键、手机上长按，选“在这里添加或修正”。会自动打开一个已经填好坐标的 GitHub issue，你写清楚这里是什么、你是怎么知道的即可。也可以直接用仓库的 [issue 表单](../../../issues/new/choose)。
2. **在网页上直接改文件。** 在 GitHub 上打开 `data/` 里的文件，点铅笔图标修改，然后点 *Propose changes*。适合改错字、补翻译、微调点的位置。
3. **在地图软件里画。** 新增点位或道路线时，用 QGIS 或 geojson.io，以我们的瓦片作底图来画（方法见下文），再提交 PR。

## 基本规则

- **每条改动都要有可核实的来源**，比如你自己在游戏里截的图、你在游戏里亲眼看到的，或 Rockstar 官方资料（官方地图、预告片、官网）。在 PR 里写明是哪一种。点位和地标都有 `source` 链接字段。
- **不使用泄露或拆包得到的文件**，不使用数据挖掘出的坐标，不复制游戏图标、贴图或字体。
- **不剧透。** 任务名、剧情地点、结局都不写。需要推进剧情才能解锁的，加上 `later` 标记，文字写得含糊一些。
- **翻译以官方为准。** 有 Rockstar 或游戏简中/繁中版本身的译名时用官方译名。没有官方译名时欢迎先给社区译名，标注方法见下文“翻译”一节。
- 每个 PR 尽量只做一件事，方便审核。

## 用我们的瓦片作底图来画

网站以标准 XYZ 瓦片的形式提供游戏内地图：

```
https://enkerewpo.github.io/leonida-online-map/tiles/day/{z}/{x}/{y}.jpg     （缩放级别 12–18）
```

- **QGIS**：在 *浏览器面板 → XYZ Tiles → 新建连接* 里粘贴上面的地址，最大缩放填 18。把底图加到图层里，再把 `data/` 里要改的文件拖进来，点 *切换编辑*，画完后点 *保存图层编辑*。保存时坐标系保持 EPSG:4326。
- **geojson.io**：在 *Meta → Add map layer* 填入上面的地址，画好后 *Save → GeoJSON*，把要素粘贴进对应的文件。

坐标就是普通的经纬度，写成 `[经度, 纬度]`。雷奥奈达放在赤道 0,0 附近，大约经度 −0.11 到 0.03、纬度 −0.09 到 0.11。写成真实世界坐标会被校验拒绝。游戏坐标（米）和地图坐标之间的换算见 `tools/geo.py`。

## 各个文件

所有文件都是 GeoJSON `FeatureCollection`，允许的取值见 [`src/schema.json`](../src/schema.json)。运行 `npm run validate` 可以本地检查，每个 PR 的 CI 也会跑同样的检查。

### `places.geojson`：区域和地名
`Point` 类型，放在文字标签应该出现的位置。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name` | 是 | 游戏里印的英文名 |
| `kind` | 是 | `state` 州、`county` 县、`city` 城市、`town` 城镇、`district` 街区、`island` 岛、`water` 水域、`airport` 机场、`landmark` 地标 |
| `name:zh-Hans`、`name:zh-Hant` | 否 | 简体、繁体中文名 |
| `rank` | 否 | 0 最重要，两个标签重叠时决定显示哪个 |
| `source` | 否 | 名字的出处 |

县、城市这类大地名在缩小时显示，放大后淡出；街区、小地名只在放大后出现。

### `landmarks.geojson`：有名字的建筑和地点
`Point` 类型。初始数据来自 GTADB 的地标库（CC BY 4.0）。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 唯一编号（沿用 GTADB 的 `L123`，新加的用小写短横线，如 `vice-city-oceanarium`） |
| `name` | 是 | 英文名 |
| `category` | 是 | 见 `src/schema.json`，如 `gas` 加油站、`guns` 枪店、`club` 夜店、`food` 餐饮、`shop` 商店、`hotel` 酒店、`police` 警局、`hospital` 医院、`transit` 交通、`landmark` 地标 |
| `minzoom` | 是 | 从第几级缩放开始显示（12–20）。大地标约 14.5，商店约 16.5，小东西 17 以上 |
| `area` | 否 | 所在街区 |
| `enterable` | 否 | 能进去就写 `true` |
| `name:zh-Hans`、`name:zh-Hant` | 否 | 中文名 |
| `source` | 是 | 来源链接 |

### `roads-named.geojson`：道路名和高速编号
`LineString` 类型，沿道路画一条线。这条线本身不会画出来，只用来承载沿路显示的文字。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `class` | 是 | `motorway` 高速、`primary` 主干道、`street` 街道 |
| `ref` | 否 | 编号，如 `I-97`、`US 35`、`SR 183`、`CR 62`（显示成路牌） |
| `name` | 否 | 街道名，如 `Dolphin Dr`（沿路显示） |
| `name:zh-Hans`、`name:zh-Hant` | 否 | 中文名 |
| `source` | 否 | 来源 |

**补街道名的方法：** 沿着这条街画一条线（几个点就够），填上 `name`。

### `poi.geojson`：各类点位
`Point` 类型；位置还没确定的写 `null`，只出现在列表里，不画在地图上。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 唯一的小写短横线编号，如 `turbo-ruiner`（分享链接要用，别随便改） |
| `category` | 是 | `vehicle` 载具、`weapon` 武器、`easter-egg` 彩蛋、`hideout` 据点、`freebie` 福利、`hidden-item` 隐藏物、`nightclub` 夜店、`shop` 商店、`gas` 加油站等，完整列表见 `src/schema.json` |
| `name` | 是 | 英文名 |
| `area:en`、`where:en`、`note:en`（以及 `:zh-Hans`、`:zh-Hant`） | 未定位时 `where` 必填 | 所在区域、怎么找到、补充说明 |
| `flags` | 否 | 可选 `day` 白天、`night` 夜晚、`alarm` 有警报、`tracker` 有追踪器、`random` 随机遭遇、`later` 需推进剧情 |
| `radius_m` | 否 | 只知道大概位置时，搜索范围的半径（米），地图上画成圆圈 |
| `source` | 是 | 来源链接 |

多语言文字统一写成 `字段:语言` 的形式，语言是 `en`、`zh-Hans`、`zh-Hant` 之一，大小写要一致。缺翻译时，网站会先退回不带语言的字段，再退回英文。

## 翻译

中文名写在 `name:zh-Hans` 和 `name:zh-Hant`。统一的译名表在 [`tools/i18n/zh-Hans.json`](../tools/i18n/zh-Hans.json)，每个名字都标了状态：

- `official`：Rockstar 或游戏本身的官方译名。
- `series`：GTA 前作里已有的既定译名。
- `community`：社区自己的译名。
- `keep`：保留英文原名。

修正译名时，在译名表里改，并附上来源，然后运行 `python3 tools/apply_i18n.py`，脚本会同时写好简体和繁体。繁体用 OpenCC 自动转换，需要特别处理的写进 `tools/i18n/zh-Hant.json` 覆盖。

## 新增类别

1. 在 `src/schema.json` 里加上这个取值。
2. 在 `src/categories.ts` 里加一项：图标底色、一个自己画的白色图标（24×24 网格），以及三种语言的名称。不要复制游戏图标。

## 本地运行

```sh
npm ci
git clone --depth 1 --filter=blob:none --sparse https://github.com/rolux/gtadb.org /tmp/gtadb
git -C /tmp/gtadb sparse-checkout set maps/tiles/6/day
npm run tiles -- /tmp/gtadb/maps/tiles/6/day     # 把游戏内瓦片整理到 public/tiles/day
python3 tools/vectorize.py /tmp/gtadb/maps/tiles/6/day 6 && npm run vector   # 可选：近距离矢量图（需要 tippecanoe）
npm run validate
npm run dev
```
