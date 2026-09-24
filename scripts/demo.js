// Demo veriyi yeniden üretir ve data/dataset.json'a yazar: npm run demo
import { writeFile, mkdir } from 'node:fs/promises';
import { generateDemo } from '../server/demo/generate.js';
import { config } from '../server/config.js';
await mkdir(new URL('../data/', import.meta.url), { recursive: true });
const ds = generateDemo();
await writeFile(config.dataFile, JSON.stringify(ds));
console.log(`Demo veri yazıldı: ${ds.sales.length} satış, ${ds.purchases.length} alış, ${ds.gl.length} GL satırı`);
