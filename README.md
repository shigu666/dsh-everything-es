# dsh-everything-es

Fast **file-name search** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) on Windows,
backed by [Everything](https://www.voidtools.com/)'s `es` command line.

It adds one model tool, `search_files`, and a settings page for the `es.exe` path. It looks up file and
folder **names and paths** from the Everything index; it does not read file contents — keep `rg`/`grep`
for content search.

This package is a standalone DSH bundle. It does not import, require, or configure any agent preset or
other plugin; it only needs the Host's tool registry.

## Install

```text
dsh plugin --profile <profile> add <this package or a git url>
```

Or, with the Web UI: **Plugins → Add plugin**, then paste the package name / Git URL / local directory.

The plugin is Windows-only; on other platforms it registers no tool.

## Requirements

- Everything installed (the GUI and/or its service), with the drives you search indexed.
- The Everything CLI `es.exe`, typically installed next to `Everything.exe`
  (`D:\Program Files\Everything\es.exe` in the default layout).

## Settings

**Plugins → Built-in plugin settings → Everything search**:

| Field | Default | Meaning |
|---|---|---|
| `esPath` | empty | Explicit `es.exe` path (`D:/...` or Git Bash `/d/...`). Empty tries `D:\Program Files\Everything`, `C:\Program Files\Everything`, `C:\Program Files (x86)\Everything`, then PATH. |
| `maxResults` | `50` | Maximum paths one search returns. |
| `timeoutMs` | `15000` | How long one `es` query may run. |

The same values can be set in the profile patch:

```yaml
- id: everything-search
  config:
    esPath: D:/Program Files/Everything/es.exe
    maxResults: 50
    timeoutMs: 15000
```

## Tool

`search_files({ query, path?, max_results? })`

- `query` — Everything syntax (`package.json`, `*.ts`, `ext:md README`, `regex:` etc.).
- `path` — optional folder to restrict the search; defaults to the Session working directory.
- `max_results` — per-call override of the setting.

Returns one full Windows path per line. No results renders `No files matched (Everything index).`

## Implementation note

The bundle resolves `@deepseek-ai/schemastery` and `@deepseek-ai/dsh-tools` from the **running dsh
installation** (through its entry script) instead of declaring a dependency tree. That keeps the package
dependency-free and works whether it is linked from a directory or installed from npm. The tool runs
`es.exe` with `child_process.execFile` and passes the Session cwd as the default search root.

The tool is registered in the Host tool registry, so every agent preset that composes the base tool
services sees it; the plugin never mounts a preset or touches another plugin's rows.

## Publishing

1. Remove `"private": true`.
2. Fill `repository`, `homepage`, `author` in `package.json`.
3. `npm publish` (the package name is `dsh-everything-es`).
4. Install with `dsh plugin --profile <profile> add dsh-everything-es` or the Git URL.

MIT licensed.
