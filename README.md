# Lumi

火种与唤醒：一本书在被索引前是沉睡的文本，建好知识库之后整本被点亮。

macOS 优先的个人阅读器，自己的 iPhone 也在用。内核 [foliate-js](https://github.com/johnfactotum/foliate-js)（MIT），壳是 Tauri v2。界面是宋体、羊皮纸、划线想法、中英对照。

产品做什么、不做什么，以 **[功能账本](dev-docs/feature-ledger.md)** 为准（全周期设计文件）。每完成一项须过账本里的完成关：最佳实践、需求匹配、最小代码。架构取舍见 [SPIKE.md](SPIKE.md)。

## 运行

```bash
cd ~/github/leaf-reader
pnpm install
pnpm test
pnpm dev          # 浏览器
pnpm tauri:dev    # 原生窗口
```

浏览器：终端里的地址，默认 `http://localhost:5173`。

## 已有

- 书架、导入 EPUB / MOBI / AZW3 / FB2、封面、进度、目录、书签、书内搜索
- 嵌入思源宋体 / 黑体；另有仿宋、楷体、圆体、苹方、Palatino
- 十种纸色（白、米白、羊皮纸、牛皮纸、素灰、护眼绿、夜间、暖夜、墨黑、暮蓝）
- 划线、想法、笔记侧栏
- 滚轮翻页；章末再滚进入下一章
- 中文按纸书排；英文导入后重排
- 中英对照：谷歌免费接口（当前章 + 静默预译下一章），微软免费失败则回落谷歌，AI 需 Key
- PDF 抽出文字层后重排。没有文字层或乱码的页，在 macOS 上用 Vision OCR
- 每本书一份本地 AI 书库
- 可以朗读，还在做

点顶部「对照」开启翻译。不会全文开翻，最多预译下一章。选中文字可「划线 / 想法 / 译此段」。

## 不做

厂商云同步。不抄 Readest 源码（AGPL）。
