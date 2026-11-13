/**
 * Execute one Everything search through the Host subprocess seam.
 *
 * Everything's stdout encoding follows the Windows ANSI code page, while the
 * Host's collected-output readers decode UTF-8. To avoid corrupting non-ASCII
 * paths, the CLI writes its result to a private temporary file with
 * `-utf8-bom`; this module reads that file explicitly as UTF-8 and removes the
 * temporary directory afterwards. Running through `ctx.subprocess` also keeps
 * process-tree termination, environment scrubbing, and output collection under
 * the Host's policy.
 */
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildEsArgs, parseExportedPaths } from './core.js';

const DEFAULT_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const STDERR_MAX_BYTES = 64 * 1024;
const TERMINATION_GRACE_MS = 1000;

/** Create an error that callers can recognise as caller cancellation. */
export function cancelledError() {
  const error = new Error('Everything search was cancelled.');
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
}

/** Create the timeout error used for both process and tool diagnostics. */
export function timeoutError(timeoutMs) {
  return new Error(`Everything es did not answer within ${timeoutMs} ms.`);
}

/**
 * Combine caller cancellation with the plugin's own deadline.
 *
 * @param {AbortSignal | undefined} parent caller-owned signal
 * @param {number} timeoutMs positive deadline in milliseconds
 * @returns {{signal: AbortSignal, timedOut: () => boolean, dispose: () => void}}
 */
function createDeadline(parent, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  let timer;

  const onAbort = () => controller.abort(parent?.reason);
  if (parent?.aborted === true) controller.abort(parent.reason);
  else parent?.addEventListener('abort', onAbort, { once: true });

  if (!controller.signal.aborted) {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort(timeoutError(timeoutMs));
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose() {
      clearTimeout(timer);
      parent?.removeEventListener('abort', onAbort);
    },
  };
}

/** Read the collected stderr tail, if the provider retained one. */
function stderrText(handle) {
  const read = handle.collected?.stderr?.readFrom(0);
  const text = read?.text?.trim() ?? '';
  return read?.lossy === true && text !== '' ? `${text} [stderr truncated]` : text;
}

/**
 * Start `es.exe`, wait for its managed process range to settle, and parse the
 * UTF-8 export.
 *
 * @param {object} input
 * @param {object} input.subprocess Host subprocess service (`ctx.subprocess`)
 * @param {string} input.esPath resolved absolute `es.exe` path
 * @param {string} input.query model-supplied Everything query
 * @param {string} input.cwd absolute working directory for the child
 * @param {string} input.root absolute directory to search
 * @param {number} input.limit maximum returned paths
 * @param {number} input.timeoutMs process deadline
 * @param {AbortSignal} input.signal caller-owned cancellation
 * @param {number} [input.maxOutputBytes] cap on the exported result file
 * @returns {Promise<{paths: string[], truncated: boolean}>}
 */
export async function searchEverything({
  subprocess,
  esPath,
  query,
  cwd,
  root,
  limit,
  timeoutMs,
  signal,
  maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
}) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-everything-es-'));
  let deadline;
  let handle;
  let observedOutcome = false;

  try {
    const exportPath = join(directory, 'results.txt');
    const args = buildEsArgs({ limit, root, exportPath, query });
    deadline = createDeadline(signal, timeoutMs);

    try {
      handle = subprocess.spawn({
        argv: [esPath, ...args],
        cwd,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: 64 * 1024 },
          stderr: { maxBytes: STDERR_MAX_BYTES },
        },
        graceMs: Math.min(TERMINATION_GRACE_MS, timeoutMs),
        signal: deadline.signal,
      });
    } catch (error) {
      if (deadline.timedOut()) throw timeoutError(timeoutMs);
      if (signal?.aborted === true) throw cancelledError();
      throw new Error(`Everything es could not be started: ${esPath}`, { cause: error });
    }

    let outcome;
    try {
      outcome = await handle.done;
      observedOutcome = true;
    } catch (error) {
      if (deadline.timedOut()) throw timeoutError(timeoutMs);
      if (signal?.aborted === true) throw cancelledError();
      throw new Error('Everything es subprocess failed before reporting an outcome.', { cause: error });
    }

    if (deadline.timedOut()) throw timeoutError(timeoutMs);
    if (signal?.aborted === true) throw cancelledError();
    if (outcome.signal !== null || outcome.exitCode === null) {
      throw new Error(`Everything es was terminated by signal ${outcome.signal ?? '(unknown)'}.`);
    }
    if (outcome.exitCode !== 0) {
      const stderr = stderrText(handle);
      throw new Error(`Everything es failed (exit ${outcome.exitCode})${stderr === '' ? '' : `: ${stderr}`}`);
    }

    let fileStat;
    try {
      fileStat = await stat(exportPath);
    } catch (error) {
      throw new Error('Everything es reported success but produced no export file.', { cause: error });
    }
    if (!fileStat.isFile()) throw new Error('Everything es produced a non-file export path.');
    if (fileStat.size > maxOutputBytes) {
      throw new Error(`Everything es output exceeded the ${maxOutputBytes}-byte cap; narrow the query or path and retry.`);
    }

    const values = parseExportedPaths(await readFile(exportPath, 'utf8'));
    return {
      paths: values,
      truncated: values.length >= limit,
    };
  } finally {
    deadline?.dispose();
    if (!observedOutcome) {
      try {
        handle?.terminate?.();
      } catch {
        // Process termination is best effort; the service owns final teardown.
      }
    }
    await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}