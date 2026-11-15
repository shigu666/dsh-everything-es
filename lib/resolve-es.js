import { bundledEsCandidates, esCandidates, nativePath } from './core.js';

/**
 * Resolve `es.exe` through the Host subprocess service's execution world.
 *
 * A configured path is authoritative: if it is invalid we report that instead
 * of silently falling back to another installation. Empty configuration tries
 * the standard Windows locations and PATH first, then the architecture-matched
 * builds shipped with this plugin.
 *
 * @param {object} input
 * @param {unknown} input.configured configured `esPath`
 * @param {object} input.subprocess Host subprocess service
 * @param {AbortSignal | undefined} input.signal caller cancellation
 * @param {string} input.bundledRoot directory containing bundled architecture folders
 * @param {string} [input.arch] Node process architecture
 * @returns {Promise<{path: string} | {error: string}>}
 */
export async function resolveEs({
  configured,
  subprocess,
  signal,
  bundledRoot,
  arch = process.arch,
}) {
  if (typeof configured === 'string' && configured.trim() !== '') {
    const path = nativePath(configured);
    try {
      return { path: await subprocess.resolveExecutable(path, undefined, signal) };
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
      return { path: await subprocess.resolveExecutable(candidate, undefined, signal) };
    } catch {
      signal?.throwIfAborted();
    }
  }

  for (const name of ['es.exe', 'es']) {
    try {
      return { path: await subprocess.resolveExecutable(name, undefined, signal) };
    } catch {
      signal?.throwIfAborted();
    }
  }

  if (typeof bundledRoot === 'string' && bundledRoot !== '') {
    for (const candidate of bundledEsCandidates(bundledRoot, arch)) {
      try {
        return { path: await subprocess.resolveExecutable(candidate, undefined, signal) };
      } catch {
        signal?.throwIfAborted();
      }
    }
  }

  return {
    error:
      'Everything es was not found. Install Everything with its CLI, set the esPath setting to es.exe (for example D:/Program Files/Everything/es.exe), or reinstall this plugin to restore its bundled es.exe.',
  };
}