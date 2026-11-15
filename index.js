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
import { dirname, isAbsolute, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nativePath, positiveInt } from './lib/core.js';
import { resolveEs } from './lib/resolve-es.js';
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

/** Architecture-specific es.exe builds shipped in this package. */
const BUNDLED_ES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), 'lib', 'es');

/** Services used by the tool. */
export const inject = ['tools', 'subprocess', 'workingDirectory'];

/** Row config; volatile fields are what the settings form edits live. */
export const Config = z.object({
  esPath: z.string().default('').volatile(),
  maxResults: z.number().min(1).max(1000).step(1).default(50).volatile(),
  timeoutMs: z.number().min(1).max(120000).step(1).default(15000).volatile(),
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

/** Resolve an optional relative model path against the session workdir. */
function resolveSearchRoot(path, workdir) {
  if (typeof path !== 'string' || path.trim() === '') return workdir;
  const normalized = nativePath(path);
  return isAbsolute(normalized) ? normalized : resolve(workdir, normalized);
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
        'Find files and folders by NAME or PATH through the Everything index (Windows). This is a fast metadata lookup, not a content search: it returns paths whose names match the query and does not read file contents. Use rg or grep for content. Each result is one full Windows path on its own line. Results are capped; the result reports when the cap was reached and more matches may exist.',
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
            truncated: {
              type: 'boolean',
              required: true,
            },
            note: { type: 'string' },
          },
        },
        render: (_args, value) => {
          const body = value.paths.length > 0
            ? value.paths.join('\n')
            : (value.note ?? 'No files matched.');
          const truncation = value.truncated === true
            ? '\n\n[Result limit reached; refine the query or path to see more matches.]'
            : '';
          return [{ type: 'text', text: `${body}${truncation}` }];
        },
      },
      async execute(args, exec) {
        exec.signal.throwIfAborted();

        if (args.query.trim() === '') {
          throw new Error('search_files query must not be empty.');
        }

        const resolved = await resolveEs({
          configured: configuredPath(),
          subprocess: ctx.subprocess,
          signal: exec.signal,
          bundledRoot: BUNDLED_ES_ROOT,
          arch: process.arch,
        });
        if (resolved.error !== undefined) throw new Error(resolved.error);

        const limit = positiveInt(args.max_results, maxResults(), 1000);
        const timeout = timeoutMs();
        const workdir = exec.agent !== undefined
          ? await ctx.workingDirectory.ensure(exec.agent, exec.signal)
          : process.cwd();
        exec.signal.throwIfAborted();

        const root = resolveSearchRoot(args.path, workdir);
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
          truncated: result.truncated,
          ...(result.paths.length === 0 ? { note: 'No files matched (Everything index).' } : {}),
        };
      },
    }),
  );
}