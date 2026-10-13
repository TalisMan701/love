import { readFile, writeFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`./dist/${name}`, import.meta.url), 'utf8');
const [html, css, config, script, preload, favicon] = await Promise.all([
  read('index.html'), read('styles.css'), read('config.js'), read('app.js'), read('preload.js'), read('favicon.svg'),
]);
const music = await readFile(new URL('./dist/media/gymnopedie-no-1.mp3', import.meta.url));
const bundled = html
  .replace('<link rel="stylesheet" href="./styles.css" media="print" data-preload-style onload="this.media=\'all\'" onerror="this.dataset.failed=\'true\'">', `<style>\n${css}\n</style>`)
  .replace('<noscript><link rel="stylesheet" href="./styles.css"></noscript>', '')
  .replace(/  <script defer src="\.\/config\.js"><\/script>\r?\n/, '')
  .replace(/  <script defer src="\.\/app\.js"><\/script>\r?\n/, '')
  .replace(/  <script defer src="\.\/preload\.js"><\/script>\r?\n/, '')
  .replace('href="./favicon.svg"', `href="data:image/svg+xml,${encodeURIComponent(favicon)}"`)
  .replace('src="./media/gymnopedie-no-1.mp3"', `src="data:audio/mpeg;base64,${music.toString('base64')}"`)
  .replace('href="./index.html"', 'href="./alina.html"')
  .replace('</body>', `<script>\n${config}\n${script}\n${preload}\n</script>\n</body>`);
if (process.argv.includes('--stdout')) {
  process.stdout.write(bundled);
} else {
  await writeFile(new URL('./alina.html', import.meta.url), bundled, 'utf8');
  console.log('Standalone preview: alina.html');
}
