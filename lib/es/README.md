# Bundled Everything CLI

These are the architecture-specific `es.exe` builds from voidtools' Everything
ES 1.1.0.38 distribution:

| Folder | Windows architecture |
|---|---|
| `x64/` | x64 |
| `x86/` | x86 |
| `arm64/` | ARM64 |
| `arm/` | ARM32 |

The plugin uses these only when `esPath` is empty and no `es.exe` can be found
in the usual Everything install locations or on `PATH`. It prefers the build
matching the running DSH process architecture and, on ARM Windows, also tries
the OS emulation fallback (ARM64 -> x64, ARM32 -> x86).

Everything and its CLI are third-party software from voidtools. They are not
covered by this repository's MIT license.