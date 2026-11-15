import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEsArgs,
  bundledEsArchCandidates,
  bundledEsCandidates,
  esCandidates,
  literalSearchArg,
  nativePath,
  parseExportedPaths,
  positiveInt,
} from '../lib/core.js';

test('literalSearchArg preserves normal Everything syntax', () => {
  assert.equal(literalSearchArg('*.ts'), '*.ts');
  assert.equal(literalSearchArg('ext:json package'), 'ext:json package');
  assert.equal(literalSearchArg('  ext:md README  '), 'ext:md README');
});

test('literalSearchArg quotes switch-like searches', () => {
  assert.equal(literalSearchArg('-version'), '"-version"');
  assert.equal(literalSearchArg('  -export-txt=C:/tmp/out.txt'), '"-export-txt=C:/tmp/out.txt"');
  assert.equal(literalSearchArg('/ad'), '"/ad"');
  assert.equal(literalSearchArg(' -version'), '"-version"');
});

test('literalSearchArg rejects unsafe or empty searches', () => {
  assert.throws(() => literalSearchArg(''), /must not be empty/u);
  assert.throws(() => literalSearchArg('   '), /must not be empty/u);
  assert.throws(() => literalSearchArg('-bad"query'), /must not contain double quotes/u);
  assert.throws(() => literalSearchArg('normal\0query'), /NUL/u);
});

test('buildEsArgs keeps query as the final literal argument', () => {
  const args = buildEsArgs({
    limit: 25,
    root: 'C:/work',
    exportPath: 'C:/tmp/results.txt',
    query: '-export-txt=C:/tmp/evil.txt',
  });
  assert.deepEqual(args.slice(0, 7), [
    '-n', '25', '-path', 'C:/work', '-export-txt', 'C:/tmp/results.txt', '-utf8-bom',
  ]);
  assert.equal(args.length, 8);
  assert.equal(args.at(-1), '"-export-txt=C:/tmp/evil.txt"');
  assert.equal(args.filter((arg) => arg === '-export-txt').length, 1);
});

test('parseExportedPaths strips BOM and CRLF but preserves path whitespace', () => {
  const text = '\uFEFFC:\\A\\one.txt\r\nC:\\A\\ with spaces.txt\r\n\r\nC:\\中文\\文件.txt\r\n  leading-space.txt\r\n';
  assert.deepEqual(parseExportedPaths(text), [
    'C:\\A\\one.txt',
    'C:\\A\\ with spaces.txt',
    'C:\\中文\\文件.txt',
    '  leading-space.txt',
  ]);
});

test('parseExportedPaths handles an empty UTF-8 BOM export', () => {
  assert.deepEqual(parseExportedPaths('\uFEFF'), []);
  assert.deepEqual(parseExportedPaths(''), []);
});

test('positiveInt clamps invalid and oversized values', () => {
  assert.equal(positiveInt(undefined, 50, 1000), 50);
  assert.equal(positiveInt(0, 50, 1000), 50);
  assert.equal(positiveInt(-1, 50, 1000), 50);
  assert.equal(positiveInt(Number.NaN, 50, 1000), 50);
  assert.equal(positiveInt(12.9, 50, 1000), 12);
  assert.equal(positiveInt(5000, 50, 1000), 1000);
});

test('esCandidates includes environment-derived Program Files locations', () => {
  const candidates = esCandidates({
    ProgramW6432: 'E:\\Program Files',
    ProgramFiles: 'E:\\Program Files',
    'ProgramFiles(x86)': 'E:\\Program Files (x86)',
  });
  assert.ok(candidates.includes('E:/Program Files/Everything/es.exe'));
  assert.ok(candidates.includes('E:/Program Files (x86)/Everything/es.exe'));
  assert.equal(new Set(candidates).size, candidates.length);
});

test('bundledEsArchCandidates picks compatible Windows builds', () => {
  assert.deepEqual(bundledEsArchCandidates('x64'), ['x64']);
  assert.deepEqual(bundledEsArchCandidates('ia32'), ['x86']);
  assert.deepEqual(bundledEsArchCandidates('arm64'), ['arm64', 'x64']);
  assert.deepEqual(bundledEsArchCandidates('arm'), ['arm', 'x86']);
  assert.deepEqual(bundledEsArchCandidates('mips'), []);
});

test('bundledEsCandidates builds architecture-specific es.exe paths', () => {
  const candidates = bundledEsCandidates('C:/plugin/lib/es', 'arm64');
  assert.equal(candidates.length, 2);
  assert.match(candidates[0], /arm64[\\/]es\.exe$/u);
  assert.match(candidates[1], /x64[\\/]es\.exe$/u);
});

test('nativePath converts Git Bash drive paths on Windows', () => {
  if (process.platform === 'win32') {
    assert.equal(nativePath(' /d/Users/Admin/file.txt '), 'D:/Users/Admin/file.txt');
    assert.equal(nativePath('D:/already/native'), 'D:/already/native');
  }
});