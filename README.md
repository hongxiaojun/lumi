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

- 书架、导入 EPUB / PDF / MOBI / AZW3 / FB2、封面、进度、目录、书签、书内搜索
- 嵌入思源宋体 / 黑体；另有仿宋、楷体、圆体、苹方、Palatino
- 十种纸色（白、米白、羊皮纸、牛皮纸、素灰、护眼绿、夜间、暖夜、墨黑、暮蓝）
- 划线、想法、笔记侧栏
- 滚轮翻页；章末再滚进入下一章
- 中文按纸书排；英文导入后重排
- 中英对照：谷歌免费接口（当前章 + 静默预译下一章），微软免费失败则回落谷歌，AI 需 Key
- PDF 导入：抽文字层 → 组行 → 去页眉页码 → 合成 EPUB → 按叶读重排；双栏、三栏的论文和杂志按栏序取文，英文在行尾断开的词自动接回。有目录大纲的按章切分，页面里的插图按位置插回正文。不做贴页阅读，也不做公式表格识别
- 三类 PDF 的差别：有文字层的直接重排；密码 PDF、纯扫描版给可读报错；字体缺 ToUnicode 的乱码书在 macOS 桌面版用 Vision 逐页 OCR 重排（iPhone 和浏览器预览没有 OCR）
- 每本书一份本地 AI 书库
- 可以朗读，还在做

点顶部「对照」开启翻译。不会全文开翻，最多预译下一章。选中文字可「划线 / 想法 / 译此段」。

## Docker / 局域网部署

```bash
docker compose up --build
# 或直接：
docker build -t lumi . && docker run -p 8080:8080 lumi
```

- 服务默认只监听 `127.0.0.1`；Docker 镜像内显式绑 `0.0.0.0`，以便宿主机端口映射。
- 写书库、删书的接口受 `LEAF_TOKEN` 保护：设置后只有带同一密钥的请求能写删；不设置时只允许本机写删，非本机写删一律 401。只读浏览不受影响。
- 生成密钥：`openssl rand -hex 24`，通过环境变量或 `.env`（compose 读 `LEAF_TOKEN`）传入。
- 浏览器没法自己加请求头，所以设了 `LEAF_TOKEN` 之后，第一次请用 `http://<主机>:8080/?token=<密钥>` 打开一次：服务端把它记进 HttpOnly cookie，然后 302 把 `token` 从地址栏抹掉。之后同一个浏览器正常读写。
- Docker 里即使从本机访问，请求也是从网桥进来的，不算 loopback。所以容器部署请务必设 `LEAF_TOKEN`，否则写库、删书一律 401。
- 本机没有 `docker compose` 插件时，用 `docker build -t lumi .` 加 `docker run -p 8080:8080 -e LEAF_TOKEN=<密钥> -v lumi-library:/data/library lumi`，等价于 compose 里那三行。
- 镜像架构要和目标机器一致。Mac（arm64）造的镜像拷到 x86_64 的 NAS 上跑不起来，直接在那台机器上 build 最省事。
- 部署到 NAS 用 `scripts/deploy-nas.sh`（默认走 SSH 别名 `feiniu`，`--host` / `--port` 可改）：同步源码 → 在 NAS 上 build → 换容器 → 检查 `/health`，最后打印带 token 的一次性打开地址。卷 `lumi-library` 不动。

## 网络访问

- 打包后的应用只允许 HTTPS 出网请求，不放行明文 `http:`（`connect-src` 与 Tauri HTTP 权限均已去掉通用 `http:` / `http://*:*`）。
- 保留 `https:` 通配，是因为云端朗读（`cloudBaseUrl`）和 AI 翻译（`aiBaseUrl`）允许用户自填 Base URL，可指向任意 HTTPS 服务（OpenAI、SiliconFlow、自建服务等）；收窄到固定域名会让这些自填地址失效。
- 已内置的 HTTPS 服务包括：OpenAI、DeepSeek、Azure 朗读（`*.tts.speech.microsoft.com` / `*.cognitiveservices.azure.com`）、微软翻译、谷歌翻译、SiliconFlow。
- 自填地址若为明文 `http://`，打包后会被拦截；请改用 HTTPS 或通过本机代理。

## 不做

厂商云同步。不抄 Readest 源码（AGPL）。
