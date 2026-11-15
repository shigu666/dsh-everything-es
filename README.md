# dsh-everything-es

[中文](./README.md) | [English](./README.en.md)

为 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 提供基于
[Everything](https://www.voidtools.com/) `es` 命令行的**文件名/路径快速搜索**。

插件注册一个模型工具 `search_files`，并在插件设置页提供 `es.exe` 路径、单次返回上限和超时配置。
它只查询 Everything 索引中的文件和文件夹**名称与路径**，不会读取文件内容；需要全文检索时请使用
`rg` 或 `grep`。

## 工作条件

- **仅支持 Windows。** 在非 Windows 平台上，插件不会注册 `search_files` 工具。
- **依赖本机已安装且正在运行的 Everything。** Everything 主程序或 Everything Service 需要处于运行状态，
  并能通过 IPC 响应 `es.exe` 查询。本插件不负责安装或启动 Everything，也不代替 Everything 建立索引。
- 要搜索的磁盘和目录已加入 Everything 索引。
- 插件自带按 CPU 架构选择的 `es.exe` 回退；也可以使用本机已安装的 Everything CLI。无论使用哪个
  `es.exe`，Everything 本体都必须在本机安装并运行。
- 支持 DSH `>=0.2.1-rc.5 <0.3.0`。

## 功能

- 模型工具 `search_files`：按文件名或路径查询，支持 Everything 的普通文本、通配符、`ext:` 等语法。
- 可选的 `path` 参数：把搜索限制在指定目录；省略时搜索整个 Everything 索引。
- 返回完整 Windows 路径，并标注结果是否因达到数量上限而被截断。
- 设置页可调整 `es.exe` 路径、单次返回上限和查询超时，保存后下一次搜索即生效。

## 安装

### 从 GitHub 安装（推荐）

```sh
dsh plugin --profile web add github:shigu666/dsh-everything-es
```

也可以打开 DSH 的 **插件 → 添加插件**，填写同一地址：
`github:shigu666/dsh-everything-es`。

### 从本地源码安装

```sh
git clone https://github.com/shigu666/dsh-everything-es.git
dsh plugin --profile web add ./dsh-everything-es
```

> 命令中的 `web` 是示例 profile；请替换为你实际使用的 profile。
>
> 安装或升级后需要重启 `dsh web`（Host 侧插件只在启动时装载），再按 `Ctrl+Shift+R`
> 刷新页面。

### 升级与卸载

```sh
dsh plugin --profile web update dsh-everything-es
dsh plugin --profile web remove dsh-everything-es
```

## 配置

打开 **插件 → 已安装的插件 → Everything 搜索 → 配置**：

| 字段 | 默认值 | 说明 |
|---|---|---|
| `esPath` | 空 | 显式的 `es.exe` 路径（`D:/...` 或 Git Bash 风格的 `/d/...`）。填写后只使用该路径。留空时依次尝试 Windows Program Files 常见位置、`D:\Program Files\Everything`、`C:\Program Files\Everything`、`C:\Program Files (x86)\Everything`、`PATH`，最后使用插件内置的 `es.exe`。 |
| `maxResults` | `50` | 单次搜索最多返回的路径数（1–1000）。 |
| `timeoutMs` | `15000` | 单次 `es` 查询的最长运行时间，超时视为失败（1–120000 毫秒）。 |

同一组配置也可以写在 profile patch 中：

```yaml
- id: everything-search
  config:
    esPath: D:/Program Files/Everything/es.exe
    maxResults: 50
    timeoutMs: 15000
```

## 使用

模型工具签名：`search_files({ query, path?, max_results? })`

- `query`：Everything 查询语法，例如 `package.json`、`*.ts`、`ext:md README`、`regex:` 等。
- `path`：可选，限制搜索目录。省略时搜索整个 Everything 索引；相对路径基于当前会话工作目录解析。
- `max_results`：可选，覆盖设置中的单次返回上限。

结果每行一个完整 Windows 路径。达到返回上限时，结果会标记为已截断，并提示模型缩小查询范围或指定
`path`。没有匹配项时显示 `No files matched (Everything index).`。

## 实现说明

插件从**正在运行的 DSH 安装**中解析 `@deepseek-ai/schemastery` 和 `@deepseek-ai/dsh-tools`，
不额外声明依赖树，因此既可以从本地目录链接安装，也可以直接从 Git 仓库安装。

搜索通过 Host 的 `ctx.subprocess` 服务执行，沿用内置工具相同的环境清理、进程终止和输出策略。
当前会话工作目录同时作为子进程 cwd 和相对 `path` 的基准；省略 `path` 时不会给 `es.exe` 添加路径过滤。

Everything 的 `es.exe` 使用 Windows ANSI 代码页输出。为保留非 ASCII 路径，插件让 `es.exe` 以
`-utf8-bom` 导出到私有临时文件，再按 UTF-8 读取并立即删除。查询以 `-` 或 `/` 开头时会被引号包裹，
避免被当成 `es.exe` 选项。

插件只向 Host 工具注册表注册 `search_files`，不会挂载 agent preset，也不会修改其他插件的配置行。

插件包含 Everything 官方 CLI 的 x64、x86、ARM64 和 ARM32 版本。解析器会根据运行 DSH 进程的
`process.arch` 选择对应构建；ARM64 和 ARM32 还会分别尝试 x64 和 x86 的 Windows 模拟回退。
内置二进制来自 voidtools，属于第三方软件，不适用本项目的 MIT 许可证。

## 开发与测试

```sh
# 单元测试
node --test

# 实际调用本机 es.exe 的集成测试（需要 Everything 正在运行并已索引临时目录）
npm run test:integration
```

单元测试覆盖参数构造与选项注入防护、UTF-8/CRLF 路径解析、截断、取消、超时、子进程错误、
可执行文件查找顺序，以及不同架构的内置回退选择。

本项目使用 MIT 许可证。
