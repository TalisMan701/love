import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const bootstrap = html.match(/<script id="preloader-bootstrap">([\s\S]*?)<\/script>/)[1];
const preload = await readFile(new URL('../dist/preload.js', import.meta.url), 'utf8');
const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

function setup({ styleReady = true, audioReady = true, images = [], fontsReady = true } = {}) {
  const classes = new Set();
  const classList = { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name), toggle: () => {} };
  const style = Object.assign(new EventTarget(), { sheet: styleReady ? {} : null, dataset: {} });
  const audio = Object.assign(new EventTarget(), { readyState: audioReady ? 4 : 0, error: null });
  const fonts = deferred();
  if (fontsReady) fonts.resolve();
  let fontRequests = 0;
  const document = Object.assign(new EventTarget(), {
    documentElement: { classList }, images, hidden: false,
    querySelectorAll: () => [style],
    querySelector: (selector) => selector === '#background-music' ? audio : { classList },
    fonts: { load: () => { fontRequests++; return fonts.promise; }, ready: fonts.promise },
  });
  const timers = new Map();
  let timerId = 0;
  const window = {};
  const context = vm.createContext({ document, window, Event, AbortController,
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; },
    clearTimeout: (id) => timers.delete(id),
  });
  let reveals = 0;
  document.addEventListener('gift:ready', () => reveals++);
  vm.runInContext(bootstrap, context);
  return { style, audio, fonts, document, window, timers, classes,
    run: () => vm.runInContext(preload, context),
    get reveals() { return reveals; }, get fontRequests() { return fontRequests; },
  };
}

test('waits for stylesheet discovery, all font faces, images and audio readiness', async () => {
  const image = Object.assign(new EventTarget(), { complete: false, naturalWidth: 0 });
  const decoded = deferred();
  image.decode = () => decoded.promise;
  const state = setup({ styleReady: false, audioReady: false, images: [image], fontsReady: false });
  state.run();
  await flush();
  assert.equal(state.fontRequests, 0, 'fonts cannot resolve before their stylesheet');
  state.style.sheet = {};
  state.style.dispatchEvent(new Event('load'));
  await flush();
  assert.equal(state.fontRequests, 8);
  state.fonts.resolve();
  state.audio.readyState = 4;
  state.audio.dispatchEvent(new Event('canplaythrough'));
  await flush();
  assert.equal(state.reveals, 0, 'image still pending');
  image.naturalWidth = 600;
  image.dispatchEvent(new Event('load'));
  await flush();
  assert.equal(state.reveals, 0, 'image still decoding');
  decoded.resolve();
  await flush();
  assert.equal(state.reveals, 1);
  assert.equal(state.classes.has('is-loading'), false);
  assert.equal(state.timers.size, 0);
});

test('cached resources reveal immediately without a fake minimum delay', async () => {
  const state = setup();
  state.run();
  await flush();
  assert.equal(state.reveals, 1);
  assert.equal(state.timers.size, 0);
});

test('broken image, stylesheet and audio do not trap the visitor', async () => {
  const image = Object.assign(new EventTarget(), { complete: false, naturalWidth: 0 });
  const state = setup({ styleReady: false, audioReady: false, images: [image] });
  state.run();
  state.style.dispatchEvent(new Event('error'));
  image.dispatchEvent(new Event('error'));
  state.audio.dispatchEvent(new Event('error'));
  await flush();
  assert.equal(state.reveals, 1);
});

test('deadline releases a stalled load once and ignores late asset events', async () => {
  const state = setup({ styleReady: false, audioReady: false, fontsReady: false });
  state.run();
  const deadline = [...state.timers.values()][0];
  assert.equal(deadline.ms, 8000);
  deadline.fn();
  assert.equal(state.reveals, 1);
  assert.equal(state.window.GIFT_LOADER.signal.aborted, true);
  state.style.dispatchEvent(new Event('load'));
  state.audio.dispatchEvent(new Event('canplaythrough'));
  state.fonts.resolve();
  await flush();
  assert.equal(state.reveals, 1);
});

test('independent deadline still works if application scripts never load', () => {
  const state = setup();
  [...state.timers.values()][0].fn();
  assert.equal(state.classes.has('is-loading'), false);
  assert.equal(state.reveals, 1);
});

test('preloading does not call play or wait for an autoplay gesture', async () => {
  const state = setup();
  state.audio.play = () => { throw new Error('Autoplay must not be part of loading'); };
  state.run();
  await flush();
  assert.equal(state.reveals, 1);
});
