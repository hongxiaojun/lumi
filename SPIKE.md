# 叶读 spike：研究与取舍

> 本文是立项时的技术取舍。**功能方向以 [dev-docs/feature-ledger.md](dev-docs/feature-ledger.md) 为准**；下文第 3、6 节的「还没做」可能已过时。

微信读书不开源。这个原型要回答的是：在 macOS 上，用现成的开源内核，能不能做出接近它的阅读质感，以及下一步该不该做成原生应用。

## 1. 开源项目里真正值得抄的

| 项目 | Stars（约） | 栈 | 该抄什么 | 不该抄什么 |
| --- | --- | --- | --- | --- |
| [Readest](https://github.com/readest/readest) | 24k | Tauri v2 + Next.js + **foliate-js** | 架构：WebView 渲染 + Rust 管文件；功能完整度 | AGPL-3.0；产品已经很大，不适合当个人项目的起点 |
| [foliate-js](https://github.com/johnfactotum/foliate-js) | 1.1k | 原生 ES module | **内核**。EPUB/MOBI/FB2/CBZ，分页用 CSS columns，CFI 进度 | 自己的 demo UI 很素，要换掉 |
| [Foliate](https://github.com/johnfactotum/foliate) | 8.7k | GTK + foliate-js | 阅读器该有的功能清单：注释、词典、进度条 | GTK，不进 Mac |
| [Koodo Reader](https://github.com/koodo-reader/koodo-reader) | 28k | Electron | 书架/导入/多格式的产品形状 | Electron 体积；UI 偏工具，不像读书 |
| [Thorium](https://github.com/edrlab/thorium-reader) | 2.9k | Electron + **Readium** | EPUB 3 / 无障碍 / LCP 的工业标准 | 重；面向图书馆，不是个人阅读气质 |
| [KOReader](https://github.com/koreader/koreader) | 30k | Lua | 排版可调的上限、eink 同步思路 | 不是桌面 UI |
| [Librum](https://github.com/Librum-Reader/Librum) | 5.3k | C++/Qt | 现代书架视觉 | Qt 在 Mac 上永远像外来客 |
| [Readium Swift toolkit](https://github.com/readium/swift-toolkit) | 0.5k | Swift / UIKit | iOS 上最正经的原生内核 | **不支持 macOS**（Navigator 是 UIKit）。Kudos 等项目在 Mac 上只好退回 WKWebView |

结论：macOS 上没有一个能用的、开源的、真正 native 的 EPUB Navigator。所有认真做的 Mac 阅读器，最后都是 **WebView + JS 引擎**。Readest 已经验证了 Tauri + foliate-js 这条路。Thorium 验证了 Readium Desktop。个人项目应走前者：MIT 内核、体积小、和现有 Tauri 经验同构。

## 2. 微信读书里真正要学的（不是社交）

- **宋体正文 + 苹方界面**。标题用衬线，栏里的按钮用无衬线。
- **纸色**：白 / 米黄 / 护眼绿 / 夜间灰字，不是纯黑配纯白。
- **中文纸书节奏**：首行缩进两字、段间几乎不空、行距 1.8–2.0、栏宽大约 35–40 字。
- **默认分页**，滚动是选项。
- **阅读页默认无铬**：点中间才出工具栏。底栏是章节名 + 进度。
- **书架是封面，不是文件列表**。弥散阴影、3:4、书口一侧略方。
- 不做想法、在读、排行。那是微信的产品，不是阅读器。

macOS 上现成字体：`Songti SC`、`Kaiti SC`、`Heiti SC`、`PingFang SC`。足够做 spike，不必先嵌入思源宋体。

## 3. 这个原型做了什么

- Vite + React 19，vendor 了 foliate-js（MIT）。
- IndexedDB 存书和进度。
- 微信读书式书架 + 阅读页（四种纸色、四种字体、分页/滚动、目录）。
- 一本自带的试读 EPUB。

刻意没做：Tauri 窗口、划线、同步、PDF。内核能不能站住，UI 像不像，这两个问题先要分开看。

## 4. 已经能讨论的技术判断

1. **内核用 foliate-js，不要自己解析 EPUB，也不要上 Readium Swift。** Readium 在 Mac 上用不成 Navigator；自己写分页会重新踩 CSS multi-column 的坑。
2. **壳用 Tauri v2，不要 Electron。** 和 VMark 同栈，Readest 已证明。本 spike 还是浏览器，包装是下一刀。
3. **书文件最终应落在磁盘，不长期放 IndexedDB。** IndexedDB 适合原型；真用时放到 `~/Library/Application Support/leaf/` 或用户自选的书库目录。
4. **排版 CSS 必须盖过 EPUB 自带样式。** 否则每本书一套字号，微信读书那种统一纸感出不来。
5. **CSP 必开。** foliate-js 明确警告：EPUB 里的脚本和 WebKit iframe sandbox 不能同时安全。只打开自己的书也一样要挡。

## 5. 已知限制（打开后就能感到）

- 分页是 CSS columns，复杂表格、超宽图、预分页 EPUB 会别扭。
- 试读本很短，真实书的封面提取、目录层级、CFI 恢复要拿 Calibre 书再压一遍。
- 点击翻页做在章节 iframe 里；选中文字时不应翻页，目前靠“有选区就忽略”。
- 夜间模式是换颜色，不是反色滤镜。带彩色插图的书在夜间会偏暗，这是微信读书同样的取舍。
- 没有系统级打开方式（双击 .epub）。要等 Tauri `fileAssociation`。

## 6. 建议的下一步（讨论用，不是承诺）

按侵入性从低到高：

1. 用你 Calibre 里的中文书打一遍：封面、中文标点悬挂、注释脚注、进度恢复。
2. 划线 + 想法（本地），交互抄微信读书的长按。
3. Tauri 包装：原生窗口、菜单、拖入、文件关联、书库目录。
4. 嵌入思源宋体 / 京华老宋体，不再依赖系统宋体。
5. 要不要 iOS / 同步：那是另一个产品决定。KOReader 的进度同步或 WebDAV 可以后挂。

不建议：一上来做社交、商城、AI 摘要。微信读书的竞争力不在阅读器，在书和人。个人阅读器的竞争力在纸感和打开速度。
