import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('package does not pin a DSH engine range', () => {
  assert.equal(Object.hasOwn(pkg, 'engines'), false);
});

test('plugin details link to the repository README instead of rendering it', async () => {
  for (const [language, readme] of [['en', 'README.en.md'], ['zh', 'README.md']]) {
    const localeUrl = new URL(`../locale/${language}.json`, import.meta.url);
    const locale = JSON.parse(await readFile(localeUrl, 'utf8'));
    const detail = locale.meta.detail;
    assert.match(detail, /^docs\/DETAIL(?:\.[a-z]+)?\.md$/u);
    const detailUrl = new URL(`../${detail}`, import.meta.url);
    assert.ok((await stat(detailUrl)).isFile());
    const markdown = await readFile(detailUrl, 'utf8');
    assert.match(markdown, new RegExp(`https://github\\.com/shigu666/dsh-everything-es/blob/main/${readme.replace('.', '\\.')}`, 'u'));
  }
});
