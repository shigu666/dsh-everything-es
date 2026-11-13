/**
 * dsh-everything-search — a Host plugin that exposes Everything's `es` CLI as
 * a model tool.
 *
 * `search_files` looks up file and folder NAMES and PATHS from the Everything
 * index; it never searches file contents (keep rg/grep for that). The plugin
 * registers only on Windows, because Everything is Windows-only and the CLI is
 * its companion executable.
 *
 * Packages come from the running dsh installation: a profile-installed bundle
 * resolves modules from the profile, so the plugin borrows the Host's own
 * schemastery and tool helper instead of carrying a dependency tree.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

/** Load one module from the running dsh installation. */
function hostRequire() {
  const base = process.argv[1];
  if (typeof base !== 'string' || base === '') {
    throw new Error('everything-search: no dsh entry script to resolve host modules from');
  }
  return createRequire(base);
}

const required = hostRequire();
const schemastery = required('@deepseek-ai/schemastery');
const z = schemastery?.default ?? schemastery;
const { defineTool } = await import(
  pathToFileURL(required.resolve('@deepseek-ai/dsh-tools')).href
);

/** Services used by the tool. */
export const inject = ['tools'];

/** Row config; volatile fields are what the settings form edits live. */
export const Config = z.object({
  esPath: z.string().default('').volatile(),
  maxResults: z.number().default(50).volatile(),
  timeoutMs: z.number().default(15000).volatile(),
});

/** Well-known Everything CLI locations, tried when no path is configured. */
const ES_CANDIDATES = [
  'D:/Program Files/Everything/es.exe',
  'C:/Program Files/Everything/es.exe',
  'C:/Program Files (x86)/Everything/es.exe',
];

/** Turn a Git Bash style `/d/...` path into a Windows path. */
function nativePath(value) {
  const trimmed = String(value).trim();
  if (process.platform !== 'win32') return trimmed;
  const posix = /^\/([a-zA-Z])\/(.*)$/.exec(trimmed);
  return posix ? `${posix[1].toUpperCase()}:/${posix[2]}` : trimmed;
}

/** Find `es.exe` on the process PATH. */
function findOnPath() {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir === '') continue;
    for (const name of ['es.exe', 'es']) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

/**
 * Resolve the Everything CLI: configured path first, then the well-known
 * locations, then PATH. Returns an error string instead of throwing so the
 * tool can explain what to configure.
 */
function resolveEs(configured) {
  if (typeof configured === 'string' && configured.trim() !== '') {
    const path = nativePath(configured);
    return existsSync(path)
      ? { path }
      : { error: `Everything es was configured at "${configured}", but that file does not exist.` };
  }
  for (const candidate of ES_CANDIDATES) if (existsSync(candidate)) return { path: candidate };
  const onPath = findOnPath();
  if (onPath !== undefined) return { path: onPath };
  return {
    error:
      'Everything es was not found. Install Everything with its CLI, or set the esPath setting to es.exe (for example D:/Program Files/Everything/es.exe).',
  };
}

/** Read one config field, handling schemastery volatile getters. */
function valueOf(field, fallback) {
  if (field !== null && typeof field === 'object' && typeof field.get === 'function') {
    try {
      return field.get();
    } catch {
      return fallback;
    }
  }
  return field ?? fallback;
}

/** Clamp one positive integer setting. */
function positiveInt(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(Math.floor(number), max);
}

/** Register `search_files` when Everything is usable on this platform. */
export function apply(ctx, rawConfig) {
  if (process.platform !== 'win32') return;

  const configuredPath = () => valueOf(rawConfig.esPath, '');
  const maxResults = () => positiveInt(valueOf(rawConfig.maxResults, 50), 50, 1000);
  const timeoutMs = () => positiveInt(valueOf(rawConfig.timeoutMs, 15000), 15000, 120000);

  ctx.tools.register(
    defineTool({
      name: 'search_files',
      description:
        'Find files and folders by NAME or PATH through the Everything index (Windows). This is a fast metadata lookup, not a content search: it returns paths whose names match the query and does not read file contents. Use rg or grep for content. Each result is one full Windows path on its own line.',
      parameters: {
        query: {
          type: 'string',
          required: true,
          description:
            'Everything search query. Plain text matches any part of a name or path; wildcards, ext:md, and other Everything syntax are supported. Example: "*.ts" or "ext:json package".',
        },
        path: {
          type: 'string',
          description:
            'Optional folder to restrict the search to. Defaults to the Session working directory. Absolute Windows paths and /d/... Git Bash paths are accepted.',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of paths to return; defaults to the plugin setting (50).',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            paths: {
              type: 'array',
              required: true,
              items: { type: 'string' },
            },
            total: {
              type: 'integer',
              required: true,
            },
            note: { type: 'string' },
          },
        },
        render: (_args, value) => [
          {
            type: 'text',
            text: value.paths.length > 0 ? value.paths.join('\n') : (value.note ?? 'No files matched.'),
          },
        ],
      },
      async execute(args, exec) {
        const resolved = resolveEs(configuredPath());
        if (resolved.error !== undefined) throw new Error(resolved.error);
        const limit = positiveInt(args.max_results, maxResults(), 1000);
        const root = typeof args.path === 'string' && args.path.trim() !== ''
          ? nativePath(args.path)
          : exec.agent?.session?.header?.cwd;
        const command = [resolved.path, '-n', String(limit)];
        if (typeof root === 'string' && root !== '') command.push('-path', root);
        command.push(args.query);
        try {
          const { stdout } = await execFileAsync(command[0], command.slice(1), {
            timeout: timeoutMs(),
            windowsHide: true,
            maxBuffer: 8 * 1024 * 1024,
            signal: exec.signal,
          });
          const paths = stdout
            .split(/\r?\n/u)
            .map((line) => line.trim())
            .filter((line) => line !== '');
          return {
            paths,
            total: paths.length,
            ...(paths.length === 0 ? { note: 'No files matched (Everything index).' } : {}),
          };
        } catch (error) {
          if (error?.code === 'ENOENT') throw new Error(`Everything es could not be started: ${resolved.path}`);
          if (error?.killed === true) throw new Error(`Everything es did not answer within ${timeoutMs()} ms.`);
          throw new Error(`Everything es failed: ${error?.message ?? error}`);
        }
      },
    }),
  );
}
