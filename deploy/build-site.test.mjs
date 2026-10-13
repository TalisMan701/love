import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { buildSite } from './build-site.mjs';

const sourceConfig = await readFile(new URL('../letter-for-you/dist/config.js', import.meta.url), 'utf8');
const sourceHtml = await readFile(new URL('../letter-for-you/dist/index.html', import.meta.url), 'utf8');

function evaluateConfig(source) {
  const context = vm.createContext({ window: {} });
  vm.runInContext(source, context);
  return { config: context.window.GIFT_CONFIG, injected: context.injected };
}

async function prepare(t, env) {
  const directory = await buildSite({ env });
  t.after(async () => {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
    assert.ok(path.basename(resolved).startsWith('love-site-'));
    await rm(resolved, { recursive: true, force: true });
  });
  return { directory, source: await readFile(path.join(directory, 'config.js'), 'utf8') };
}

test('publishes certificate env values as strings, preserving leading zeros and source files', async (t) => {
  const { directory, source } = await prepare(t, { CERTIFICATE_CODE: '00123456789', CERTIFICATE_PIN: '0007' });
  const { config } = evaluateConfig(source);
  const original = evaluateConfig(sourceConfig).config;
  assert.equal(config.certificate.code, '00123456789');
  assert.equal(config.certificate.pin, '0007');
  assert.equal(config.certificate.amount, original.certificate.amount);
  assert.equal(config.certificate.activationUrl, original.certificate.activationUrl);
  assert.equal(JSON.stringify(config.notes), JSON.stringify(original.notes));
  assert.equal(await readFile(path.join(directory, 'index.html'), 'utf8'), sourceHtml);
  assert.ok((await stat(path.join(directory, 'media/gymnopedie-no-1.mp3'))).size > 0);
  assert.equal(await readFile(new URL('../letter-for-you/dist/config.js', import.meta.url), 'utf8'), sourceConfig);
});

test('keeps demo configuration when both env values are missing or blank', async (t) => {
  for (const env of [{}, { CERTIFICATE_CODE: '', CERTIFICATE_PIN: '' }, { CERTIFICATE_CODE: ' ', CERTIFICATE_PIN: '\n' }]) {
    const { source } = await prepare(t, env);
    assert.equal(source, sourceConfig);
  }
});

test('rejects partial certificate settings before publication', async () => {
  for (const env of [{ CERTIFICATE_CODE: '00123' }, { CERTIFICATE_PIN: '0007' }, { CERTIFICATE_CODE: '00123', CERTIFICATE_PIN: ' ' }]) {
    await assert.rejects(buildSite({ env }), /Set both CERTIFICATE_CODE and CERTIFICATE_PIN/);
  }
});

test('quotes, slashes and line separators remain data rather than executable JavaScript', async (t) => {
  const env = {
    CERTIFICATE_CODE: "00123'); globalThis.injected = true; //",
    CERTIFICATE_PIN: '0"\\\n</script>\u2028\u2029',
  };
  const { source } = await prepare(t, env);
  const { config, injected } = evaluateConfig(source);
  assert.equal(config.certificate.code, env.CERTIFICATE_CODE);
  assert.equal(config.certificate.pin, env.CERTIFICATE_PIN);
  assert.equal(injected, undefined);
  assert.ok(!source.includes('</script>'));
});
