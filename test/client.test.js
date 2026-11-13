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
    const input = { ...props, children };
    return typeof type === 'function' ? type(input) : { type, props: input };
  },
  useMemo(factory) {
    return factory();
  },
  useSyncExternalStore(_subscribe, getSnapshot) {
    return getSnapshot();
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}];
  },
  useEffect() {},
};

function createForm() {
  const snapshot = {
    status: 'ready',
    value: { esPath: 'D:/Everything/es.exe', maxResults: 50, timeoutMs: 15000 },
    base: {},
    user: { maxResults: 50 },
    revision: 1,
    writable: true,
  };
  return {
    snapshot,
    getSnapshot() {
      return snapshot;
    },
    subscribe() {
      return () => {};
    },
    async set() {
      return true;
    },
    async unset() {
      return true;
    },
    async dispose() {},
  };
}

test('client loads without private Harness UI primitives and gates the card on served state', () => {
  assert.equal(loaded?.id, 'dsh-everything-es');
  const module = loaded.factory((name) => {
    if (name === 'react') return React;
    throw new Error(`unexpected client module: ${name}`);
  });
  assert.deepEqual(module.inject, ['slots', 'locale', 'configForms']);

  const form = createForm();
  let locale;
  let card;
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
      get(id) {
        assert.equal(id, 'everything-search');
        return form;
      },
      whileServed(namespaces, register) {
        observedServed = namespaces;
        return register(new Set(namespaces));
      },
    },
    slots: {
      inject(name, callback) {
        assert.equal(name, 'plugins.item');
        return callback();
      },
      register(options, component) {
        card = { options, component };
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
  assert.equal(card.options.id, 'everything-search');
  assert.equal(card.options.inject().form, form);

  const summary = card.component({
    view: 'summary',
    t: (key) => key,
    form,
  });
  assert.equal(summary, 'description');

  const rendered = card.component({
    view: 'form',
    t: (key) => key,
    form,
  });
  assert.equal(rendered.type, 'div');
});