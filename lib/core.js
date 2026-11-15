import { join } from 'node:path';

/**
 * Pure helpers for the Everything search plugin.
 *
 * Keeping these functions free of Host imports makes the argument-building,
 * path-normalisation, and output-parsing contracts unit-testable without a
 * running DSH profile.
 */

/** Well-known Everything CLI locations, tried before PATH lookup. */
const FALLBACK_ES_CANDIDATES = [
  'D:/Program Files/Everything/es.exe',
  'C:/Program Files/Everything/es.exe',
  'C:/Program Files (x86)/Everything/es.exe',
];

/**
 * Preferred bundled CLI builds for each Node architecture.
 *
 * Windows ARM can run the native ARM build; ARM64 additionally falls back to
 * x64, and ARM32 to x86, matching Windows' built-in emulation support.
 */
const BUNDLED_ES_ARCHES = Object.freeze({
  x64: Object.freeze(['x64']),
  ia32: Object.freeze(['x86']),
  arm64: Object.freeze(['arm64', 'x64']),
  arm: Object.freeze(['arm', 'x86']),
});

/**
 * Build the candidate list for auto-discovery.
 *
 * The environment-derived entries make the plugin work when Windows is
 * installed somewhere other than C: or D:. Duplicate entries are removed
 * while preserving order.
 *
 * @param {NodeJS.ProcessEnv} [env] environment to inspect
 * @returns {string[]} candidate `es.exe` paths with native separators
 */
export function esCandidates(env = process.env) {
  const candidates = [];
  for (const key of ['ProgramW6432', 'ProgramFiles', 'ProgramFiles(x86)']) {
    const base = env[key];
    if (typeof base === 'string' && base !== '') {
      candidates.push(`${base.replace(/\\/gu, '/').replace(/\/+$/u, '')}/Everything/es.exe`);
    }
  }
  candidates.push(...FALLBACK_ES_CANDIDATES);
  return [...new Set(candidates)];
}

/**
 * Return the bundled `es.exe` builds compatible with a Node architecture.
 *
 * @param {string} [arch] Node process architecture
 * @returns {string[]} bundled architecture folder names, most preferred first
 */
export function bundledEsArchCandidates(arch = process.arch) {
  return [...(BUNDLED_ES_ARCHES[arch] ?? [])];
}

/**
 * Build absolute paths to the bundled `es.exe` builds for an architecture.
 *
 * @param {string} root directory containing the architecture folders
 * @param {string} [arch] Node process architecture
 * @returns {string[]} bundled executable paths, most preferred first
 */
export function bundledEsCandidates(root, arch = process.arch) {
  return bundledEsArchCandidates(arch).map((name) => join(root, name, 'es.exe'));
}

/**
 * Turn a Git Bash style `/d/...` path into a Windows path.
 *
 * @param {unknown} value path supplied by the user
 * @returns {string} trimmed path in Windows form when applicable
 */
export function nativePath(value) {
  const trimmed = String(value).trim();
  if (process.platform !== 'win32') return trimmed;
  const posix = /^\/([a-zA-Z])\/(.*)$/u.exec(trimmed);
  return posix ? `${posix[1].toUpperCase()}:/${posix[2]}` : trimmed;
}

/**
 * Clamp one positive integer setting.
 *
 * @param {unknown} value raw value
 * @param {number} fallback value used for non-positive/non-finite input
 * @param {number} max upper bound
 * @returns {number} positive integer no greater than `max`
 */
export function positiveInt(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(Math.floor(number), max);
}

/**
 * Build the literal search argument accepted by Everything's CLI.
 *
 * `es.exe` parses leading `-` and `/` as switches. A model-supplied query must
 * never change which options the child receives, so switch-like searches are
 * wrapped in the double quotes documented by `es.exe` for escaping switches.
 * A query containing a double quote cannot be safely wrapped this way; reject
 * it rather than passing an ambiguous command line.
 *
 * @param {unknown} value model-supplied query
 * @returns {string} a literal search argument
 */
export function literalSearchArg(value) {
  const query = String(value ?? '').trim();
  if (query === '') throw new Error('Everything query must not be empty.');
  if (query.includes('\0')) throw new Error('Everything query must not contain NUL characters.');
  if (/^[-/]/u.test(query)) {
    if (query.includes('"')) {
      throw new Error('Queries that start with "-" or "/" must not contain double quotes.');
    }
    return `"${query}"`;
  }
  return query;
}

/**
 * Build the fixed `es.exe` argv. The query is always the final argument and
 * never shares an option slot.
 *
 * @param {object} input
 * @param {number} input.limit maximum returned paths
 * @param {string | undefined} input.root optional search root
 * @param {string} input.exportPath temporary export file
 * @param {unknown} input.query model-supplied search query
 * @returns {string[]} argv beginning with the first `es.exe` option
 */
export function buildEsArgs({ limit, root, exportPath, query }) {
  const args = ['-n', String(limit)];
  if (typeof root === 'string' && root !== '') args.push('-path', root);
  args.push('-export-txt', exportPath, '-utf8-bom', literalSearchArg(query));
  return args;
}

/**
 * Parse an `es.exe -export-txt -utf8-bom` result.
 *
 * Paths are kept verbatim apart from the export BOM and CRLF line endings: in
 * particular, leading/trailing spaces and non-ASCII characters must survive.
 *
 * @param {string} text exported file contents
 * @returns {string[]} one entry per non-empty path line
 */
export function parseExportedPaths(text) {
  const body = text.startsWith('\uFEFF') ? text.slice(1) : text;
  return body.split(/\r?\n/u).filter((line) => line.length > 0);
}