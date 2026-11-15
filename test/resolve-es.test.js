import test from 'node:test';
import assert from 'node:assert/strict';
import { bundledEsCandidates, esCandidates } from '../lib/core.js';
import { resolveEs } from '../lib/resolve-es.js';

function fakeResolver(accepted) {
  const calls = [];
  return {
    calls,
    async resolveExecutable(candidate) {
      calls.push(candidate);
      if (accepted(candidate)) return candidate;
      throw new Error('not found');
    },
  };
}

test('a configured esPath is authoritative', async () => {
  const configured = 'D:/Everything/custom/es.exe';
  const subprocess = fakeResolver(() => true);
  const result = await resolveEs({
    configured,
    subprocess,
    signal: new AbortController().signal,
    bundledRoot: 'C:/plugin/lib/es',
    arch: 'x64',
  });
  assert.deepEqual(result, { path: configured });
  assert.deepEqual(subprocess.calls, [configured]);
});

test('an invalid configured esPath does not fall back to bundled es.exe', async () => {
  const subprocess = fakeResolver(() => false);
  const result = await resolveEs({
    configured: 'D:/missing/es.exe',
    subprocess,
    signal: new AbortController().signal,
    bundledRoot: 'C:/plugin/lib/es',
    arch: 'x64',
  });
  assert.match(result.error, /configured at "D:\/missing\/es\.exe"/u);
  assert.equal(subprocess.calls.length, 1);
});

test('empty esPath tries standard locations and PATH before bundled es.exe', async () => {
  const bundledRoot = 'C:/plugin/lib/es';
  const bundled = bundledEsCandidates(bundledRoot, 'x64')[0];
  const subprocess = fakeResolver((candidate) => candidate === bundled);
  const result = await resolveEs({
    configured: '',
    subprocess,
    signal: new AbortController().signal,
    bundledRoot,
    arch: 'x64',
  });
  assert.deepEqual(result, { path: bundled });
  assert.deepEqual(subprocess.calls, [...esCandidates(), 'es.exe', 'es', bundled]);
});

test('PATH wins over the bundled fallback', async () => {
  const subprocess = fakeResolver((candidate) => candidate === 'es.exe');
  const result = await resolveEs({
    configured: '',
    subprocess,
    signal: new AbortController().signal,
    bundledRoot: 'C:/plugin/lib/es',
    arch: 'x64',
  });
  assert.deepEqual(result, { path: 'es.exe' });
  assert.equal(subprocess.calls.at(-1), 'es.exe');
});

test('ARM64 tries the native build before the x64 emulation fallback', async () => {
  const bundledRoot = 'C:/plugin/lib/es';
  const [arm64, x64] = bundledEsCandidates(bundledRoot, 'arm64');
  const subprocess = fakeResolver((candidate) => candidate === x64);
  const result = await resolveEs({
    configured: '',
    subprocess,
    signal: new AbortController().signal,
    bundledRoot,
    arch: 'arm64',
  });
  assert.deepEqual(result, { path: x64 });
  assert.deepEqual(subprocess.calls.slice(-2), [arm64, x64]);
});

test('reports a useful error when no installation or bundled build is usable', async () => {
  const subprocess = fakeResolver(() => false);
  const result = await resolveEs({
    configured: '',
    subprocess,
    signal: new AbortController().signal,
    bundledRoot: 'C:/plugin/lib/es',
    arch: 'x64',
  });
  assert.match(result.error, /bundled es\.exe/u);
});