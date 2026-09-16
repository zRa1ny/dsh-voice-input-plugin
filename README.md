# dsh-voice-input-plugin

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web GUI 加一个**语音输入**按钮：输入框工具行里、发送按钮一侧出现一个麦克风按钮，点一下开始录音，识别结果**实时逐字**写入当前会话的待发送框；再点一下（图标变成停止方块）结束录音。发送仍然用原来的发送按钮。

- 仓库：<https://github.com/zRa1ny/dsh-voice-input-plugin> · 许可：MIT
- 要求：dsh `>= 0.1.0-rc.5`；浏览器 **Chrome / Edge**
- **零依赖、无构建步骤**：`index.js` 与 `lib/client.js` 就是发布产物，npm / git / tarball 三种安装方式都不需要 pnpm 构建授权

浏览器半边独立完成全部工作：使用 Web Speech API（`SpeechRecognition` / `webkitSpeechRecognition`），不占用 Host 能力、不上传音频到本地后端、不注册任何模型工具或服务。Host 半边是空插件，只用来让 Web 客户端的模块登记表能扫描到这个包的 `dsh.client` 声明。

## 安装

这是一个 **dsh 组合包（bundle）**：声明了 `dsh.bundle`（贡献一个配置层）和 `dsh.client`（贡献浏览器半边）。用 `dsh plugin` 装进 `web` profile 即可，它会同时把包加入依赖和 `dsh.profile.bundles`。

### 从 GitHub 安装（当前可用）

```sh
dsh plugin --profile web add https://github.com/zRa1ny/dsh-voice-input-plugin

# 等价简写
dsh plugin --profile web add github:zRa1ny/dsh-voice-input-plugin
```

### 从 dsh 创意工坊安装

[dsh-market.com](https://dsh-market.com)（创意工坊）收录后，可在 Web GUI 的「创意工坊 → 插件」卡片里一键安装；`market/listing.json` 是本包准备好的目录条目。

### 从 tarball 安装

```sh
pnpm pack
dsh plugin --profile web add ./dsh-voice-input-plugin-0.1.0.tgz
```

### 安装后必须重启

客户端模块登记表按包名缓存元数据，插件集合的变化在重启后生效：

```sh
dsh --profile web --dump-config   # 应能看到 "# == dsh-voice-input-plugin" 层
dsh --profile web
```

### 卸载

```sh
dsh plugin --profile web remove dsh-voice-input-plugin
```

### 关于 npm 包名

npm registry 上的 `dsh-voice-input-plugin` **不是本包**：那个包由另一位作者于 2026-08-15 发布，与本包同名的另一个实现。因此本包**不分发到 npm**，安装请用上面的 GitHub 地址。

如果你要发布到 npm，请使用你自己的 scope（例如 `@<你的用户名>/dsh-voice-input-plugin`），scoped 名称在创意工坊的一键安装里同样有效，安装命令形如：

```sh
dsh plugin --profile web add @<你的用户名>/dsh-voice-input-plugin
```

### 从源码运行本仓库

```sh
git clone https://github.com/zRa1ny/dsh-voice-input-plugin
dsh plugin --profile web add ./dsh-voice-input-plugin
```

在 dsh 仓库 checkout 内调试时，`dsh` 是 `pnpm dsh`，路径按当前工作目录解析：

```sh
cd source-code
pnpm dsh plugin --profile web add ../dsh-voice-input-plugin
```

## 使用

1. 点麦克风按钮 → 按钮变红并出现脉冲光圈，浏览器首次会弹麦克风授权。
2. 说话时文字实时出现在待发送框（含未定稿的中间结果），可以继续用键盘编辑。
3. 再点一次按钮 → 结束录音，已识别的文字留在输入框。
4. 点原来的发送按钮发送。

状态与失败提示都在按钮上：录音中为红色停止方块，出错时图标转红、鼠标悬停（`title`）显示具体原因，再点一次即可重试。

## 行为契约

| 事项 | 行为 |
| --- | --- |
| 写入方式 | 通过会话标准工具包的 `inputActions.setDraft(text)` 写**整段草稿**，不是键盘模拟 |
| 起始草稿 | 开始录音时输入框里已有的文字会被保留，识别结果拼在其后（前一个字符是 ASCII 字母/数字时补一个空格，中文直接相接） |
| 识别语言 | 跟随浏览器语言（`navigator.language`），取不到时用 `zh-CN` |
| 连续录音 | `continuous = true`；Chrome 在静音后会自行结束，插件在 `onend` 里自动续录，直到用户点停止 |
| 去重 | 以结果下标记录已定稿的片段，事件重复投递不会重复追加文字 |
| 静音 / 主动停止 | `no-speech` 与 `aborted` 视为正常，不进入错误态 |
| 卸载 | 切换会话或插件卸载时中止识别并释放麦克风（`abort()`），随插件 fiber 一起撤销 |
| 样式 | 自注入一个 `<style data-plugin="dsh-voice-input-plugin" data-plugin-css="…">` 标签，使用主题 CSS 变量；卸载时由模块登记表按 `data-plugin` 归属清除 |

## 实现原理

唯一的产品接触点是插槽座位 `conversation.input.right`——输入框工具行里、发送按钮一侧的**追加座位**（`kind: 'list'`，`replaceRisk: none`）。组件从座位提供的标准会话工具包读取数据：

- `props.useInput(selector)`：订阅本会话输入状态（用来取起始草稿）。
- `props.inputActions.setDraft(text)`：唯一的草稿写入路径。
- `props.input`：座位 owner（`InputZone`）提供的实时输入状态快照，事件处理中可直接读。

本包不替换任何既有座位：注册用的 `id: 'voice-input'` 是自己的键，不会顶掉别人的格子。

浏览器半边按 Web 客户端的模块协议注册：

```js
window.__ModuleLoader__.load({ id: 'dsh-voice-input-plugin', factory: (require) => { /* … */ return module.exports } })
```

执行脚本只登记工厂；样式注入等副作用都在工厂闭包里，在首次 import 物化时运行。工厂只 `require('react')`（冻结平台模块表里的种子条目），返回 `{ inject, name, apply }`——没有 default 导出（default 会让 Loader 的 `unwrapExports` 丢弃命名空间与 `inject`）。

## 项目结构

```
dsh-voice-input-plugin/
├── package.json        # dsh.bundle + dsh.client + dsh.engines 声明
├── cordis.patch.yml    # 被 profile 列入 bundles 时应用的层：插入一行空插件
├── index.js            # Host 半边：空 apply，仅为让 client 扫描有 entry 可读
├── lib/client.js       # 浏览器半边：发布产物本身（闭包工厂 bundle）
├── market/listing.json # 创意工坊目录条目（提交用），不参与运行
├── test/               # 契约测试，不随 npm 包发布（见 files 字段）
├── LICENSE
└── .gitignore
```

## 校验

```sh
node test/contract.smoke.mjs
```

契约测试加载真实 `lib/client.js`，断言注册协议（handoff id、工厂返回值、`inject`、注册到的座位与 id）；若能从同仓库的 dsh checkout 解析到 `react` 与 `react-dom/server`，还会把按钮真正渲染一次，断言支持/不支持两条分支的 `aria-label` 与禁用态。

## 已知限制

- **只在 Chrome / Edge 可用**：Firefox 与 Safari 没有 `SpeechRecognition`，按钮会置灰。Chromium 的实现把音频送到它的在线识别服务，因此**需要联网**，离线或受限网络会报 `network` 错误。
- **依赖麦克风权限**：权限被拒绝时功能不可用，需要用户在地址栏侧重新允许。
- **一次录音只属于一个会话**：切换会话会中止本次录音（旧组件的清理函数释放麦克风），已识别的文字保留在该会话的草稿里。
- **不解析口述标点命令**：直接采用浏览器返回的文本，未做「逗号 / 句号」等口令后处理。
- **文案为中文写死**：没有引入 `locale` 服务注册字典；需要多语言时应改为 `inject: ['slots', 'locale']` 并用 `props.t`。
- **入口 id 与动态插件互斥**：如果同时运行注册到 `conversation.input.right`、`id` 也是 `voice-input` 的进程内动态 Cordis 插件，两者会占同一个格子；动态插件不跨进程存活，重启后只有本包生效。

## 维护者：发布与收录

### 目录条目

创意工坊的线上清单是 `https://dsh-market.com/manifest/plugins.json`，条目字段为 `id` / `name` / `nameEn` / `rank` / `author` / `description` / `descriptionEn` / `repo` / `npm` / `category` / `subcategory`。现有条目的 `category` 取值为 `tools` / `ui` / `knowledge` / `utility` / `integration` / `security` / `agent`；本包是输入框控件，取 `ui` + `chat`。

`market/listing.json` 已按该字段集写好，并且**故意不写 `npm` 字段**：工坊的一键安装取 `${npm ?? repo ?? id}`，一旦 `npm` 指向 npm 上那个同名他人包，安装就会装错东西。将来若发布了 scoped npm 包，再把 `npm` 加回来即可。

收录渠道是该生态的公开仓库与社区：`zhu1090093659/dsh-web` 的 GitHub Issues / Discord 社区；另有独立社区商店 `deepseek-plugin-store`。

### 安装端的准入规则（已实测）

- 一键安装把条目 spec 交给 `pluginManager.install(spec)`，等价于 `dsh plugin --profile web add <spec>`。
- spec 只接受 **npm 包名（可带 `@版本`，scoped 亦可）或 `https://` 开头的 git 地址**；`^1.0.0` 这类范围、`ssh://`、`file://`、`http://`、相对路径、裸仓库名都会被拒绝。
- 不带 `.git` 的 `https://github.com/<owner>/<repo>` 与带 `.git` 的写法都能被 pnpm 正常安装（两种均已实测）。
- 安装端会校验依赖真实落盘、拒绝重复入口 id 认领与引用不可解析包的 insert 行，并用 `--dump-config` 做组合预检；失败会经官方 remove 路径自动回滚新包。因此入口 id `voice-input` 不能与既有入口 id 冲突。
- `dsh.engines.dsh` 是更新前的兼容性门禁（也兼容读顶层 `engines.dsh`）：本包声明 `>=0.1.0-rc.5`。运行版本低于声明时更新按钮会被禁用。
- 发布到 npm 时确认 `files` 覆盖 `index.js`、`lib/`、`cordis.patch.yml`、`market/`、`README.md`，并且 `exports` 保留 `"./package.json"`（Host 侧 `client-modules` 通过 `require.resolve('<包名>/package.json')` 读 `dsh.client` 声明，`exports` 未导出的子路径会被 Node 拒绝）与 `"./client"`（浏览器半边的产物路径）。

## Model Experience

None：本包不注册提示词段落、工具、模型消息或提供方请求。识别出的文字只写入本地草稿，只有在用户点发送、由普通 composer 提交流程发出时才会进入模型请求。

#### KV Cache effect

None；本包不组装、不发送提供方请求。

## License

[MIT](LICENSE)
