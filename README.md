# dsh-everything-es

Fast **file-name search** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) on Windows,
backed by [Everything](https://www.voidtools.com/)'s `es` command line.

It adds one model tool, `search_files`, and a settings page for the `es.exe` path. It looks up file and
folder **names and paths** from the Everything index; it does not read file contents — keep `rg`/`grep`
for content search.

This package is a standalone DSH bundle. It does not import, require, or configure any agent preset or
other plugin; it only needs the Host's tool, subprocess, and working-directory services.

## Install

```text
dsh plugin --profile <profile> add <this package or a git url>
```

Or, with the Web UI: **Plugins → Add plugin**, then paste the package name / Git URL / local directory.

The plugin is Windows-only; on other platforms it registers no tool.

## Requirements

- Everything installed (the GUI and/or its service), with the drives you search indexed.
- The Everything CLI `es.exe`, typically installed next to `Everything.exe`
  (`D:\Program Files\Everything\es.exe` in the default layout), with `-export-txt` and
  `-utf8-bom` support (current Everything 1.x).

## Settings

**Plugins → Built-in plugin settings → Everything search**:

| Field | Default | Meaning |
|---|---|---|
| `esPath` | empty | Explicit `es.exe` path (`D:/...` or Git Bash `/d/...`). Empty tries the Windows Program Files locations, `D:\Program Files\Everything`, `C:\Program Files\Everything`, `C:\Program Files (x86)\Everything`, then PATH. |
| `maxResults` | `50` | Maximum paths one search returns (1–1000). |
| `timeoutMs` | `15000` | How long one `es` query may run (1–120000 ms). |

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
- `path` — optional folder to restrict the search; defaults to the current Session working directory.
  Relative paths resolve against that directory.
- `max_results` — per-call override of the setting.

Returns one full Windows path per line. When the result cap is reached, the result is marked as truncated
and the rendered output tells the model to refine the query or path. No results renders
`No files matched (Everything index).`

## Implementation note

The bundle resolves `@deepseek-ai/schemastery` and `@deepseek-ai/dsh-tools` from the **running dsh
installation** (through its entry script) instead of declaring a dependency tree. That keeps the package
dependency-free and works whether it is linked from a directory or installed from npm.

Searches run through the Host's `ctx.subprocess` service, so they use the same environment scrubbing,
managed process termination, and output policy as built-in tools. The effective search root comes from
`ctx.workingDirectory.ensure()`, not the immutable session creation directory.

Everything writes stdout using the Windows ANSI code page. To preserve non-ASCII paths, the plugin asks
`es.exe` to export the result to a private temporary file with `-utf8-bom`, reads that file as UTF-8, and
removes it immediately. The model-supplied query is quoted when it starts with `-` or `/` so it cannot
become an `es.exe` option.

The tool is registered in the Host tool registry, so every agent preset that composes the base tool
services sees it; the plugin never mounts a preset or touches another plugin's rows.

## Development

```text
node --test
```

The unit tests cover argument construction and option-injection protection, UTF-8/CRLF path parsing,
truncation, cancellation, timeout handling, and subprocess errors.

MIT licensed.