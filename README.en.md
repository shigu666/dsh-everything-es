# dsh-everything-es

[中文](./README.md) | [English](./README.en.md)

Fast **file-name and path search** for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness),
powered by [Everything](https://www.voidtools.com/)'s `es` command line.

The plugin registers one model tool, `search_files`, and adds a settings page for the `es.exe` path,
the per-search result limit, and the query timeout. It looks up file and folder **names and paths**
from the Everything index; it never reads file contents. Use `rg` or `grep` for content search.

## Requirements

- **Windows only.** On other platforms, the plugin registers no `search_files` tool.
- **Everything must already be installed and running on the local machine.** The Everything GUI
  or Everything Service must be running and able to answer `es.exe` queries over IPC. This plugin
  does not install or start Everything, and does not build the Everything index for you.
- The drives and folders you want to search are already indexed by Everything.
- The plugin bundles architecture-matched `es.exe` fallbacks, and it can also use an existing
  Everything CLI installation. Either way, Everything itself must be installed and running locally.
- Supported DSH versions: `>=0.2.1-rc.5`.

## Features

- The `search_files` model tool supports ordinary text, wildcards, `ext:`, and other Everything
  query syntax.
- The optional `path` argument restricts a search to one folder; omit it to search the full
  Everything index.
- Results are full Windows paths, with an explicit truncation marker when the result limit is reached.
- The settings page controls the `es.exe` path, the per-search result limit, and the query timeout.
  Saved values apply to the next search without restarting DSH.

## Install

### From GitHub (recommended)

```sh
dsh plugin --profile web add github:shigu666/dsh-everything-es
```

Alternatively, open **Plugins → Add plugin** in DSH and enter
`github:shigu666/dsh-everything-es`.

### From a local checkout

```sh
git clone https://github.com/shigu666/dsh-everything-es.git
dsh plugin --profile web add ./dsh-everything-es
```

> `web` is an example profile; replace it with the profile you actually use.
>
> Restart `dsh web` after installing or upgrading (host-side plugins are loaded at startup), then
> reload the page with `Ctrl+Shift+R`.

### Upgrade and uninstall

```sh
dsh plugin --profile web update dsh-everything-es
dsh plugin --profile web remove dsh-everything-es
```

## Configuration

Open **Plugins → Installed plugins → Everything search → Configure**:

| Field | Default | Description |
|---|---|---|
| `esPath` | empty | Explicit `es.exe` path (`D:/...` or Git Bash-style `/d/...`). When set, only this path is used. When empty, the plugin tries the usual Windows Program Files locations, `D:\Program Files\Everything`, `C:\Program Files\Everything`, `C:\Program Files (x86)\Everything`, then `PATH`, and finally the architecture-matched bundled `es.exe`. |
| `maxResults` | `50` | Maximum number of paths returned by one search (1–1000). |
| `timeoutMs` | `15000` | Maximum runtime of one `es` query; exceeding it is treated as a failure (1–120000 ms). |

The same values can be set in a profile patch:

```yaml
- id: everything-search
  config:
    esPath: D:/Program Files/Everything/es.exe
    maxResults: 50
    timeoutMs: 15000
```

## Usage

Tool signature: `search_files({ query, path?, max_results? })`

- `query`: Everything query syntax, for example `package.json`, `*.ts`, `ext:md README`, or `regex:`.
- `path`: optional folder that restricts the search. Omit it to search the entire Everything index;
  a relative path is resolved against the current session working directory.
- `max_results`: optional per-call override of the configured result limit.

Each result is one full Windows path per line. When the result limit is reached, the result is marked
as truncated and the model is told to refine the query or `path`. With no matches, the output is
`No files matched (Everything index).`

## Implementation notes

The bundle resolves `@deepseek-ai/schemastery` and `@deepseek-ai/dsh-tools` from the **running DSH
installation** rather than declaring its own dependency tree. That keeps it dependency-free and lets
it work when linked from a local directory or installed directly from Git.

Searches run through the Host's `ctx.subprocess` service, so they use the same environment scrubbing,
managed process termination, and output policy as built-in tools. The effective session working
directory is used as the child process cwd and as the base for relative `path` filters; omitting
`path` leaves the search unrestricted across the Everything index.

Everything writes `es.exe` stdout using the Windows ANSI code page. To preserve non-ASCII paths, the
plugin asks `es.exe` to export results to a private temporary file with `-utf8-bom`, reads that file
as UTF-8, and removes it immediately. A model-supplied query that starts with `-` or `/` is quoted
so it cannot become an `es.exe` option.

The tool is registered in the Host tool registry, so every agent preset that composes the base tool
services sees it; the plugin never mounts a preset or touches another plugin's rows.

The package includes Everything CLI builds for x64, x86, ARM64, and ARM32. The resolver selects the
build matching the running DSH process (`process.arch`); ARM64 and ARM32 additionally try their
Windows emulation fallback (x64 and x86 respectively). Bundled binaries from voidtools are third-party
software and are not covered by this package's MPL 2.0 license.

## Development and testing

```sh
# Unit tests
node --test

# Integration test against the local es.exe (requires Everything to be running and have indexed
# the temporary test folder)
npm run test:integration
```

The unit tests cover argument construction and option-injection protection, UTF-8/CRLF path parsing,
truncation, cancellation, timeout handling, subprocess errors, executable discovery ordering, and
architecture-specific bundled fallback selection.

Licensed under the [Mozilla Public License 2.0](https://mozilla.org/MPL/2.0/).
