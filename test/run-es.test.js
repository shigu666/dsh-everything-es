import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { searchEverything } from '../lib/run-es.js';

function exportPathOf(spec) {
  const index = spec.argv.indexOf('-export-txt');
  assert.notEqual(index, -1);
  return spec.argv[index + 1];
}

function immediateSubprocess({ exitCode = 0, stderr = '', write } = {}) {
  const calls = [];
  return {
    calls,
    spawn(spec) {
      calls.push(spec);
      if (write !== undefined) write(exportPathOf(spec), spec);
      return {
        done: Promise.resolve({ exitCode, signal: null }),
        collected: {
          stderr: { readFrom: () => ({ text: stderr, lossy: false }) },
        },
        terminate() {},
      };
    },
  };
}

test('writes UTF-8 export and returns non-ASCII paths unchanged', async () => {
  const subprocess = immediateSubprocess({
    write(path) {
      writeFileSync(path, '\uFEFFC:\\项目\\报告.txt\r\nC:\\A B\\file name.txt\r\n', 'utf8');
    },
  });
  const result = await searchEverything({
    subprocess,
    esPath: 'C:\\Everything\\es.exe',
    query: '*.txt',
    cwd: tmpdir(),
    root: tmpdir(),
    limit: 10,
    timeoutMs: 5000,
    signal: new AbortController().signal,
  });
  assert.deepEqual(result, {
    paths: ['C:\\项目\\报告.txt', 'C:\\A B\\file name.txt'],
    truncated: false,
  });
  assert.equal(subprocess.calls.length, 1);
  assert.deepEqual(subprocess.calls[0].argv.slice(0, 7), [
    'C:\\Everything\\es.exe',
    '-n',
    '10',
    '-path',
    tmpdir(),
    '-export-txt',
    exportPathOf(subprocess.calls[0]),
  ]);
  assert.equal(subprocess.calls[0].argv.at(-1), '*.txt');
  assert.equal(existsSync(exportPathOf(subprocess.calls[0])), false);
});

test('does not let a model query become an es.exe option', async () => {
  const subprocess = immediateSubprocess({
    write(path) {
      writeFileSync(path, '\uFEFF', 'utf8');
    },
  });
  await searchEverything({
    subprocess,
    esPath: 'C:\\Everything\\es.exe',
    query: '-export-txt=C:\\tmp\\evil.txt',
    cwd: tmpdir(),
    root: tmpdir(),
    limit: 10,
    timeoutMs: 5000,
    signal: new AbortController().signal,
  });
  const argv = subprocess.calls[0].argv;
  assert.equal(argv.filter((arg) => arg === '-export-txt').length, 1);
  assert.equal(argv.at(-1), '"-export-txt=C:\\tmp\\evil.txt"');
});

test('marks a result truncated when it reaches the limit', async () => {
  const subprocess = immediateSubprocess({
    write(path) {
      writeFileSync(path, '\uFEFFa\r\nb\r\n', 'utf8');
    },
  });
  const result = await searchEverything({
    subprocess,
    esPath: 'C:\\Everything\\es.exe',
    query: '*.txt',
    cwd: tmpdir(),
    root: tmpdir(),
    limit: 2,
    timeoutMs: 5000,
    signal: new AbortController().signal,
  });
  assert.deepEqual(result, { paths: ['a', 'b'], truncated: true });
});

test('surfaces stderr from a non-zero exit', async () => {
  const subprocess = immediateSubprocess({ exitCode: 2, stderr: 'Everything IPC failed' });
  await assert.rejects(
    searchEverything({
      subprocess,
      esPath: 'C:\\Everything\\es.exe',
      query: '*.txt',
      cwd: tmpdir(),
      root: tmpdir(),
      limit: 10,
      timeoutMs: 5000,
      signal: new AbortController().signal,
    }),
    /Everything es failed \(exit 2\): Everything IPC failed/u,
  );
});

test('rejects a successful process that produced no export file', async () => {
  const subprocess = immediateSubprocess();
  await assert.rejects(
    searchEverything({
      subprocess,
      esPath: 'C:\\Everything\\es.exe',
      query: '*.txt',
      cwd: tmpdir(),
      root: tmpdir(),
      limit: 10,
      timeoutMs: 5000,
      signal: new AbortController().signal,
    }),
    /produced no export file/u,
  );
});

test('rejects an export larger than the output cap', async () => {
  const subprocess = immediateSubprocess({
    write(path) {
      writeFileSync(path, '\uFEFF' + 'x'.repeat(100), 'utf8');
    },
  });
  await assert.rejects(
    searchEverything({
      subprocess,
      esPath: 'C:\\Everything\\es.exe',
      query: '*.txt',
      cwd: tmpdir(),
      root: tmpdir(),
      limit: 10,
      timeoutMs: 5000,
      signal: new AbortController().signal,
      maxOutputBytes: 16,
    }),
    /output exceeded the 16-byte cap/u,
  );
});

test('reports the plugin deadline instead of a generic kill', async () => {
  const subprocess = {
    spawn(spec) {
      return {
        done: new Promise((resolve) => {
          if (spec.signal.aborted) resolve({ exitCode: null, signal: 'SIGTERM' });
          else spec.signal.addEventListener('abort', () => resolve({ exitCode: null, signal: 'SIGTERM' }), { once: true });
        }),
        collected: { stderr: { readFrom: () => ({ text: '', lossy: false }) } },
        terminate() {},
      };
    },
  };
  await assert.rejects(
    searchEverything({
      subprocess,
      esPath: 'C:\\Everything\\es.exe',
      query: '*.txt',
      cwd: tmpdir(),
      root: tmpdir(),
      limit: 10,
      timeoutMs: 10,
      signal: new AbortController().signal,
    }),
    /did not answer within 10 ms/u,
  );
});

test('propagates caller cancellation as AbortError', async () => {
  const subprocess = {
    spawn(spec) {
      return {
        done: new Promise((resolve) => {
          if (spec.signal.aborted) resolve({ exitCode: null, signal: 'SIGTERM' });
          else spec.signal.addEventListener('abort', () => resolve({ exitCode: null, signal: 'SIGTERM' }), { once: true });
        }),
        collected: { stderr: { readFrom: () => ({ text: '', lossy: false }) } },
        terminate() {},
      };
    },
  };
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(
    searchEverything({
      subprocess,
      esPath: 'C:\\Everything\\es.exe',
      query: '*.txt',
      cwd: tmpdir(),
      root: tmpdir(),
      limit: 10,
      timeoutMs: 5000,
      signal: controller.signal,
    }),
    (error) => {
      assert.equal(error.name, 'AbortError');
      assert.equal(error.code, 'ABORT_ERR');
      return true;
    },
  );
});