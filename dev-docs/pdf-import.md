# PDF 导入：调研与验证

> 2026-09-18。本文件是 PDF 能力开工前的验证记录。  
> 账本原 X1「不做 PDF」由用户改为必须：高频格式，重点是**导入检测 + 排版优化成可读正文**。  
> 未通过本文件的路径，不写进阅读页。

## 1. 叶读要的不是 PDF 翻页器

叶读的产品是纸感重排（中文缩进、英文 Newsreader、对照、AI 书库）。  
用户要的「优雅美观」是 **重排后的书**，不是缩小的 A4 页面。

因此：打开 PDF 后仍按页贴图、捏合缩放，**对不上需求**。

## 2. 对标

| 项目 | PDF 怎么做 | 重排？ | 许可 | 叶读可采纳 |
| --- | --- | --- | --- | --- |
| **Foliate / foliate-js** | `pdf.js` 适配器 + **fixed-layout** 渲染器 | 否（实验性贴页） | MIT / PDF.js Apache-2.0 | 只用检测与打开；不走贴页阅读 |
| **Readest** | 同上，PDF/CBZ 标成 `FIXED_LAYOUT`；重排在 issue #556 仍是计划 | 否 | **AGPL，禁抄源码** | 只看产品形状：他们也承认贴页不够 |
| **KOReader** | MuPDF 抽文本 + Reflow，变成单栏 | 是，eink 上口碑好 | AGPL | 学「抽文本再排」，不抄 Lua |
| **Calibre** | PDF Input 抽字 + Line un-wrapping + Heuristic Unwrap | 是，质量取决于是否文字层 | GPL | **组段算法的公开文档**（已用于 EPUB 假段落） |
| **Apple Books / Kindle** | 贴页为主；Kindle 几乎不能重排正文 PDF | 弱 | 闭源 | 不学贴页 |
| **Xodo Liquid Mode / Adobe** | 云端重排 | 是 | 闭源/在线 | 不做云 |

结论：业界把 PDF 分成两条路——

1. **贴页**（Foliate、Readest 现状、Apple Books）  
2. **抽文本 → 解硬换行 → 当 EPUB 读**（KOReader Reflow、Calibre PDF→EPUB）

叶读走 **2**。许可证干净的实现件：Mozilla **pdf.js** `getTextContent()`（Apache-2.0）+ 我们已有的 `restyleDocument`。

## 3. 验证过的流水线（准备写的）

```
文件
  → sniff（魔数 %PDF-）
  → 加密 / 无文字层（扫描件）→ 可读错误（M1）
  → pdf.js getTextContent（每页 runs: str, x, y, w, h）
  → 按 Y 组行（同行 |dy| < 0.35×字号）
  → 每行一个 <p>，CJK 片段不加空格
  → 去掉页眉页脚（多页重复 + 顶/底 8% 区域，Calibre/pdfstruct 同类）
  → restyleDocument('zh'|'en')   // 已有假段落解包
  → 合成一本 foliate 可读的 HTML 书（章=若干页）
```

不采用：

- Foliate `makePDF` 贴页阅读  
- Readest 源码  
- 依赖本机安装 Calibre 二进制（Docker/飞牛不可靠）  
- v1 OCR（扫描件先拒绝，账本可列为可以有）

## 4. 检测（M1 的 PDF 部分）

| 情况 | 判定 | 用户看到 |
| --- | --- | --- |
| 魔数不是 `%PDF-` | 不是 PDF | 走 EPUB/MOBI 原路径 |
| `/Encrypt` 且打不开 | 加密 | 「这本 PDF 有密码，Lumi 打不开」 |
| 全页几乎无 `str` | 扫描件 | 「这是扫描版 PDF，没有文字层，暂时不能重排」 |
| 有文字层 | 进入组行 | 导入成功 |

坏 EPUB 仍走原来的 `makeBook` 失败信息，禁止白屏。

## 5. 组行算法（对标 pdf.js 实践 + Calibre 解包）

业界共识（pdf.js issues / Qiita 组行文 / pdfexcavator）：

- `item.str` 是碎片，必须用 `transform[5]`（Y）和 `transform[4]`（X）组行  
- 先按 Y 从上到下、同行按 X 从左到右（坐标系 Y 向上则排序取反）  
- 同行：`|y1-y2| < k × height`  
- 行距约 1 行高 → 视为硬换行，交给已有 `restyleDocument`  
- 行距明显更大 → 新段  

页眉页脚：多页相同短行出现在页面顶/底 8%（pdfstruct / Calibre header 检测）。v1 先做重复行丢弃。

## 6. 明确不做（本周期）

- 双栏学术 PDF 的栏序（KOReader 有栏数选项，后做）  
- 公式、复杂表  
- 扫描件 OCR  
- 保留 PDF 原页边距当「图片书」  

## 7. 测试门槛（写代码的准入）

1. 魔数检测：PDF / 非 PDF  
2. 同行碎片拼成一行（中文无空格，英文有空格）  
3. 小 Y 间隙 = 硬换行残留，大 Y 间隙 = 新段  
4. 组出的 HTML 再经 `restyleDocument` 后，「甚/至」类切词消失  
5. 扫描件（无文字）走错误分支  

以上测试未绿，不接 `importFile`。

---

## 8. 分步、模块、时长

估时按「一人 + 现有测试门」的专注工作日（约 4–6 小时/日）。偏紧不掺水分。  
**v1 合计约 3.5～5 日。** 双栏、OCR、贴页阅读不进这轮。

已完成：

| 模块 | 状态 |
| --- | --- |
| A 魔数 `sniffFormat` | 已有测试 |
| B 坐标组行 `clusterLines` + `linesToHtml` | 已有测试，并接到 `restyleDocument` |
| C 抽字 `extractPdf` | pdf.js，测试用最小 Hello PDF |
| D 分类 encrypted/scanned/text | 已有测试 |
| E 页眉页脚 `stripRepeatedMargins` | 已有测试 |
| F 合成 EPUB `pdfToEpubFile` | 已接到 `importFile` |
| G 导入按钮 | 选择器含 `.pdf`；`convertPdf` + `makeBook` 绿 |
| 调研文档 | 本文件 |
| 第 4 步真书 | 中英文字层、密码夹具、88MB 扫描件已用本地文件跑过流水线 |

### 第 1 步 — 抽字与分类（约 1 日）

**模块 C** `src/lib/pdf/extract.ts`  
接 `pdfjs-dist`（Apache-2.0）。输入 `ArrayBuffer`，输出每页 `PdfRun[]`。

**模块 D** `src/lib/pdf/classify.ts`  
- 加密 → 错误文案  
- 全页几乎无字 → 扫描件错误  
- 有字 → 放行  

验收：自造最小文字 PDF fixture；加密/空白 PDF 走错误，不白屏。  
未绿不进入第 2 步。

### 第 2 步 — 页眉页脚 + 合成书（约 1～1.5 日）

**模块 E** `src/lib/pdf/headers.ts`  
多页重复短行 + 页面顶/底 8%（Calibre / pdfstruct 同类）。单测用假页数据，不读真 PDF。

**模块 F** `src/lib/pdf/toBook.ts`  
`runs → clusterLines → 去页眉 → HTML 章节 → restyleDocument`。  
合成一本 foliate 能 `open()` 的书（若干 HTML section，不是贴页）。

验收：假坐标数据拼出「甚/至」一段；带重复页码的页眉被丢掉。

### 第 3 步 — 接到导入（约 0.5～1 日）

**模块 G** `importFile` 分支  
`sniff === 'pdf'` 走 F，否则原 `makeBook`。  
文件选择器加 `.pdf`。失败信息走现有 `error` 条。

验收：导入一本中文文字层 PDF，书架出现封面/标题，打开后是叶读纸感而不是 A4 贴页。  
2026-09-24：`convertPdf` → foliate `makeBook` 绿；真书《探讨定投改变命运》打开后正文已重排（核心/长期，无部首）。封面无图时用标题。

### 第 4 步 — 真书验收（约 1 日，可穿插返工）

至少四类真文件：

| 样本 | 期望 | 2026-09-22 |
| --- | --- | --- |
| 中文文字层（小说/随笔） | 段整、无「甚/至」类切词 | 定投/长期主义/段永平/1000小时：部首已归一，硬换行走已有 restyle |
| 英文文字层 | 走英文 `restyleDocument` | *Machines of Loving Grace* 抽字有空格，按大纲切章 |
| 带密码 | 明确报错 | 夹具 `encryptedPdfBytes` → 「有密码」 |
| 扫描件 | 明确报错，不生成乱书 | 《专注的真相》126 页/18 字每页 → 扫描 |

返工只改 C–F，不新开子系统。  
本地复跑：`PDF_QA=/path/to/book.pdf pnpm exec vitest run src/lib/pdf/realQa.test.ts`

### 刻意后置（不估进 v1）

- 双栏栏序  
- 公式/复杂表  
- OCR  
- Foliate 贴页阅读器  

### 建议开工顺序

`C 抽字 → D 分类 → E 页眉 → F 合成书 → G 导入按钮 → 真书验收`

每次只合一个模块，测试绿了再往下。第 3 步之前用户在 UI 里仍不能选 PDF，这是故意的。
