import test from 'node:test';
import assert from 'node:assert/strict';

let loaded;
globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      loaded = definition;
    },
  },
};
await import('../client.js');

const React = {
  createElement(type, props, ...children) {
    const input = { ...props, children: children.flat() };
    return typeof type === 'function' ? type(input) : { type, props: input };
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}];
  },
  useEffect() {},
};

function createForm() {
  const state = {
    status: 'ready',
    value: { esPath: 'D:/Everything/es.exe', maxResults: 50, timeoutMs: 15000 },
    base: { esPath: '', maxResults: 50, timeoutMs: 15000 },
    user: { maxResults: 50 },
    revision: 7,
    writable: true,
  };
  return {
    state,
    async mutate() {
      return true;
    },
  };
}

function loadFactory() {
  return loaded.factory((name) => {
    if (name === 'react') return React;
    throw new Error(`unexpected client module: ${name}`);
  });
}

test('client registers the bundle row configuration used by the current Plugins page', () => {
  assert.equal(loaded?.id, 'dsh-everything-es');
  const module = loadFactory();
  assert.deepEqual(module.inject, ['slots', 'locale', 'configForms']);

  const form = createForm();
  let locale;
  let rowConfig;
  let observedServed;
  const ctx = {
    locale: {
      bind(namespace) {
        return (key) => `${namespace}:${key}`;
      },
      register(namespace, dictionaries) {
        locale = { namespace, dictionaries };
        return () => {};
      },
    },
    configForms: {
      whileServed(namespaces, register) {
        observedServed = namespaces;
        return register(new Set(namespaces));
      },
    },
    slots: {
      inject(name, callback) {
        assert.equal(name, 'plugins.row.config');
        return callback();
      },
      register(options, component) {
        rowConfig = { options, component };
        return () => {};
      },
    },
    effect(callback) {
      const dispose = callback();
      return () => {
        if (typeof dispose === 'function') dispose();
      };
    },
  };

  module.apply(ctx);
  assert.equal(locale.namespace, 'settings.everythingSearch');
  assert.ok(locale.dictionaries.en.title);
  assert.deepEqual(observedServed, ['everything-search']);
  assert.equal(rowConfig.options.name, 'plugins.row.config');
  assert.equal(rowConfig.options.key, 'dsh-everything-es#everything-search');
  assert.equal(rowConfig.options.locale, 'settings.everythingSearch');

  const summary = rowConfig.component({
    view: 'summary',
    t: (key) => key,
    form,
  });
  assert.equal(summary, 'description');

  const rendered = rowConfig.component({
    view: 'page',
    t: (key) => key,
    form,
  });
  assert.equal(rendered.type, 'div');
});

test('buildMutation writes only staged fields and unsets reset overrides', () => {
  const { buildMutation } = loadFactory().__test;
  const snapshot = {
    value: { esPath: 'D:/Everything/es.exe', maxResults: 50, timeoutMs: 15000 },
    base: { esPath: '', maxResults: 50, timeoutMs: 15000 },
  };
  const draft = { esPath: '', maxResults: '100', timeoutMs: '15000' };
  const touched = {
    esPath: { reset: true },
    maxResults: { reset: false },
  };
  const mutation = buildMutation(snapshot, draft, touched, new Set(['esPath', 'maxResults']));
  assert.equal(mutation.invalid, false);
  assert.deepEqual(mutation.ops, [
    { op: 'unset', path: ['esPath'] },
    { op: 'set', path: ['maxResults'], value: 100 },
  ]);
  assert.equal(mutation.effective.esPath, '');
  assert.equal(mutation.effective.maxResults, '100');
  assert.deepEqual([...mutation.overrides], ['maxResults']);
});

test('buildMutation rejects out-of-range numbers without producing writes', () => {
  const { buildMutation } = loadFactory().__test;
  const mutation = buildMutation(
    {
      value: { esPath: '', maxResults: 50, timeoutMs: 15000 },
      base: { esPath: '', maxResults: 50, timeoutMs: 15000 },
    },
    { esPath: '', maxResults: '0', timeoutMs: '15000' },
    { maxResults: { reset: false } },
    new Set(),
  );
  assert.equal(mutation.invalid, true);
  assert.deepEqual(mutation.ops, []);
});
