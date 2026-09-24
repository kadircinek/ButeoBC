// Paneli tek bir HTML dosyasına gömer (veri + kod + Chart.js). Sunucusuz paylaşım/önizleme içindir.
// Kullanım: npm run export [-- --demo] [-- --out dist/buteo-panel.html]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { generateDemo } from '../server/demo/generate.js';
import { getDataset } from '../server/store.js';

const args = process.argv.slice(2);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'dist/buteo-panel.html';
const dataset = args.includes('--demo') ? generateDemo() : await getDataset();

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const [html, css, chartJs, analytics, app] = await Promise.all([
  read('public/index.html'), read('public/css/app.css'), read('node_modules/chart.js/dist/chart.umd.min.js'),
  read('public/js/analytics.js'), read('public/js/app.js'),
]);

// Modüller tek bir <script type="module"> içinde birleştirilir.
const analyticsInline = analytics.replace(/^export /gm, '');
const appInline = app.replace(/^import .*analytics\.js';\n/m, '');
const safeJson = JSON.stringify(dataset).replace(/</g, '\\u003c');
const inline = (s) => s.replace(/<\/script/gi, '<\\/script');

const page = html
  .replace('<link rel="stylesheet" href="css/app.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script src="vendor/chart.umd.js"></script>', () => `<script>${inline(chartJs)}</script>\n<script>window.__BUTEO_DATASET__ = ${safeJson};</script>`)
  .replace('<script type="module" src="js/app.js"></script>', () => `<script type="module">\n${inline(analyticsInline)}\n${inline(appInline)}\n</script>`);

await mkdir(dirname(out), { recursive: true });
await writeFile(out, page);
console.log(`Yazıldı: ${out} (${(page.length / 1e6).toFixed(2)} MB, kaynak: ${dataset.meta.source})`);
