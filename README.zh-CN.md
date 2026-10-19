# dsh-custom-fonts

在 DeepSeek Harness Web 界面自定义**中文字体**、**英文字体**、**代码字体**与**全局字号偏移** —— 设置页直接操作，实时预览。设置保存在 Host 设置文档里，刷新页面、重启应用都不会丢。

[English](README.md)

## 功能

安装后在 **设置 → 字体** 新增设置页：

- **UI 字体 · 英文**：用于拉丁字符（Maple Mono Normal NL CN、Segoe UI、Arial、Georgia 等）。
- **UI 字体 · 中文**：用于汉字（Maple Mono Normal NL CN / 微软雅黑 / 宋体 / 黑体 / 楷体 / 仿宋 / 思源黑体 / 苹方等）。
- **代码字体**：代码块与行内代码（`pre`/`code`/`kbd`/`samp`）独立使用等宽字体（Maple Mono Normal NL CN、Consolas、JetBrains Mono、Fira Code、Cascadia Code、等距更纱黑体等）。
- **字体大小偏移**：-4 ~ +8px 全局滑条，平级偏移不叠加（见原理）。
- **实时预览**：中英混排 UI 示例 + 代码字体示例随输入即时渲染；支持逗号分隔的多个候选字体与任意字体名。
- **恢复默认**：一键清空全部设置、移除所有注入样式，并清掉已保存的覆盖值。

## 原理

插件注入一段全局样式：

```css
:root { --dsh-custom-fonts-en: '英文字体'; --dsh-custom-fonts-zh: '中文字体'; }
body, body * { font-family: '英文字体', '中文字体' !important; }
pre, code, kbd, samp { font-family: '代码字体' !important; }
body, body * { font-size: calc(1em + 2px) !important; }  /* 偏移非 0 时 */
```

- font-family 回退链实现按文字的字体分流：拉丁字符优先匹配英文字体，中文字符因英文字体缺少字形而自动回退到中文字体——无需语言检测、不操作 DOM。
- 代码字体规则排在后面，仅在代码区域内胜出。
- 字号偏移用 `calc(1em ± Npx)` **相对每个元素自身字号**计算，每层只偏移一次 N，不会指数级放大；归零即恢复。

修改即时全局生效（消息正文、侧边栏、输入框等所有界面文本）。

## 持久化

宿主端声明一个 volatile 的 `Config`（`en`、`zh`、`code`、`size`），Loader 条目 id 就是设置命名空间。浏览器端通过 `ctx.configForms.get('dsh-custom-fonts')` 读写，Host 设置文档是唯一事实来源：

- 打开页面即读取已存值并应用；
- 输入合并成 250ms 一次原子写入，不再每敲一个字写一次配置；
- 清空某一栏时写入「删除字段」而不是空字符串，配置补丁里只留真正的覆盖项；
- 写入被拒绝时提示并回读文档，控件不会显示一个根本没存进去的值。

当设置服务不可用（旧版 Host、非 loopback 连接）时，页面仍对当前视图生效，并提示「刷新后会恢复」。

## 安装

市场发布后可从 **设置 → 插件市场** 一键安装，或：

```sh
dsh plugin --profile web add dsh-custom-fonts
```

或直接从仓库安装：

```sh
dsh plugin --profile web add github:lsh2002/dsh-custom-fonts
```

刷新页面即生效，无需重启。替换已安装的旧版本时需要重启，宿主才会加载新的 JavaScript 代际。

## 卸载

在 **设置 → 插件 → 插件配置** 中移除（或 `dsh plugin --profile web remove dsh-custom-fonts`），刷新页面后字体自动还原。

## 开发

```sh
pnpm install
node scripts/verify.mjs
```

`verify.mjs` 是零依赖自测：导入宿主端；用假的 `__ModuleLoader__` 与 Cordis 上下文加载浏览器端；无头驱动设置页，覆盖读取已存值、页面与快照一致、写入合并、清空即删除、恢复默认、写入失败回读、只读提示。

## 许可证

MIT
