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
 * schemastery and tool helper instead of carrying a dependency tree. Process
 * execution and the effective working directory use the Host's services so the
 * tool follows the same subprocess policy as built-in tools.
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { esCandidates, nativePath, positiveInt } from './lib/core.js';
import { searchEverything } from './lib/run-es.js';

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
export const inject = ['tools', 'subprocess'];

/** Row config; volatile fields are what the settings form edits live. */
export const Config = z.object({
  esPath: z.string().default('').volatile(),
  maxResults: z.number().default(50).volatile(),
  timeoutMs: z.number().default(15000).volatile(),
});

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

/**
 * Resolve `es.exe` through the Host subprocess service's execution world.
 *
 * A configured path is authoritative: if it is invalid we report that instead
 * of silently falling back to another installation. Empty configuration tries
 * the standard Windows locations, then PATH.
 *
 * @param {object} ctx Host plugin context
 * @param {unknown} configured configured `esPath`
 * @param {AbortSignal} signal caller cancellation
 * @returns {Promise<{path: string} | {error: string}>}
 */
async function resolveEs(ctx, configured, signal) {
  if (typeof configured === 'string' && configured.trim() !== '') {
    const path = nativePath(configured);
    try {
      return { path: await ctx.subprocess.resolveExecutable(path, undefined, signal) };
    } catch (error) {
      signal?.throwIfAborted();
      const detail = error instanceof Error ? ` ${error.message}` : '';
      return {
        error: `Everything es was configured at "${configured}", but that file is not a usable executable.${detail}`,
      };
    }
  }

  for (const candidate of esCandidates()) {
    try {
      return { path: await ctx.subprocess.resolveExecutable(candidate, undefined, signal) };
    } catch {
      signal?.throwIfAborted();
    }
  }

  for (const name of ['es.exe', 'es']) {
    try {
      return { path: await ctx.subprocess.resolveExecutable(name, undefined, signal) };
    } catch {
      signal?.throwIfAborted();
    }
  }

  return {
    error:
      'Everything es was not found. Install Everything with its CLI, or set the esPath setting to es.exe (for example D:/Program Files/Everything/es.exe).',
  };
}

/** Register `search_files` when Everything is usable on this platform. */
export function apply(ctx, rawConfig = {}) {
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
            'Optional folder to restrict the search to. Defaults to the current Session working directory. Absolute Windows paths and /d/... Git Bash paths are accepted.',
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
            text: value.paths.length > 0 ? value.paths.join('\\n') : (value.note ?? 'No files matched.'),
          },
        ],
      },
      async execute(args, exec) {
        exec.signal.throwIfAborted();

        if (args.query.trim() === '') {
          throw new Error('search_files query must not be empty.');
        }

        const resolved = await resolveEs(ctx, configuredPath(), exec.signal);
        if (resolved.error !== undefined) throw new Error(resolved.error);

        const limit = positiveInt(args.max_results, maxResults(), 1000);
        const timeout = timeoutMs();
        const workdir = exec.agent?.session?.header?.cwd ?? process.cwd();
        exec.signal.throwIfAborted();

        const root = typeof args.path === 'string' && args.path.trim() !== ''
          ? nativePath(args.path)
          : workdir;
        const result = await searchEverything({
          subprocess: ctx.subprocess,
          esPath: resolved.path,
          query: args.query,
          cwd: workdir,
          root,
          limit,
          timeoutMs: timeout,
          signal: exec.signal,
        });

        return {
          paths: result.paths,
          total: result.paths.length,
          ...(result.paths.length === 0 ? { note: 'No files matched (Everything index).' } : {}),
        };
      },
    }),
  );
}