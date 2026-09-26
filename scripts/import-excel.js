// BC Excel dışa aktarımlarını panele yükler: npm run import [-- klasör]
// Varsayılan klasör: imports/ (dosya adları için docs/AJAN-GOREVI.md)
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { importExcelFolder } from '../server/excel/import.js';
import { analyze } from '../public/js/analytics.js';
import { config } from '../server/config.js';

const dir = resolve(process.argv[2] || 'imports');
console.log(`Excel içe aktarma: ${dir}`);
try {
  const ds = await importExcelFolder(dir);
  await mkdir(dirname(config.dataFile), { recursive: true });
  await writeFile(config.dataFile, JSON.stringify(ds));
  const r = analyze(ds, { mode: 'month' });
  const m = (n) => `${(n / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn TL`;
  console.log(`\n✓ Yüklendi → ${config.dataFile}`);
  console.log(`  GL satırı: ${ds.gl.length}, satış belgesi: ${ds.sales.length}, alış belgesi: ${ds.purchases.length}, hesap: ${ds.accounts.length}`);
  console.log(`  Son 12 ay net satış: ${m(r.kpis.window.netSales)}, brüt marj: %${((r.kpis.window.grossMargin || 0) * 100).toFixed(1)}, net kâr: ${m(r.kpis.window.netProfit)}`);
  console.log(`  Nakit + banka: ${m(r.balance.cash)}, sağlık skoru: ${r.health.score}`);
  if (ds.meta.warnings.length) console.log(`\nUyarılar:\n${ds.meta.warnings.map((w) => `  - ${w}`).join('\n')}`);
} catch (err) {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
}
