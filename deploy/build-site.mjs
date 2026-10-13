import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sourceDirectory = fileURLToPath(new URL('../letter-for-you/dist/', import.meta.url));

export async function buildSite({ env = process.env } = {}) {
  const code = env.CERTIFICATE_CODE ?? '';
  const pin = env.CERTIFICATE_PIN ?? '';
  const hasCode = code.trim().length > 0;
  const hasPin = pin.trim().length > 0;
  if (hasCode !== hasPin) {
    throw new Error('Set both CERTIFICATE_CODE and CERTIFICATE_PIN, or leave both unset.');
  }

  // Publish a separate copy so real certificate data never changes tracked source files.
  const publishDirectory = await mkdtemp(path.join(tmpdir(), 'love-site-'));
  await cp(sourceDirectory, publishDirectory, { recursive: true });

  if (hasCode && hasPin) {
    const configPath = path.join(publishDirectory, 'config.js');
    const configSource = await readFile(configPath, 'utf8');
    const certificate = JSON.stringify({ code, pin })
      .replaceAll('<', '\\u003c')
      .replaceAll('\u2028', '\\u2028')
      .replaceAll('\u2029', '\\u2029');
    await writeFile(configPath,
      `${configSource}\nObject.assign(window.GIFT_CONFIG.certificate, ${certificate});\n`,
      'utf8');
  }

  return publishDirectory;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    // Only the output path is printed; certificate values must never appear in logs.
    console.log(await buildSite());
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
