// Veri setini diskte önbellekler; BC yoksa demo veri üretir.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config, bcConfigured } from './config.js';
import { syncFromBC } from './bc/sync.js';
import { generateDemo } from './demo/generate.js';
import { importExcelFolder } from './excel/import.js';
import { existsSync } from 'node:fs';

const IMPORTS_DIR = process.env.IMPORTS_DIR || new URL('../imports/', import.meta.url).pathname;
const hasExcel = () => existsSync(`${IMPORTS_DIR}/hesap-plani.xlsx`) && existsSync(`${IMPORTS_DIR}/genel-muhasebe.xlsx`);

let dataset = null;
let lastError = null;
let syncing = null;

const today = () => new Date().toLocaleDateString('sv-SE');

export async function getDataset() {
  if (!dataset) {
    try { dataset = JSON.parse(await readFile(config.dataFile, 'utf8')); } catch { /* önbellek yok */ }
  }
  const staleDemo = dataset?.meta.source === 'demo' && (bcConfigured() || hasExcel() || dataset.meta.syncedAt.slice(0, 10) !== today());
  if (!dataset || staleDemo) await sync();
  return dataset;
}

export function status() {
  return {
    source: dataset?.meta.source || null,
    company: dataset?.meta.company || null,
    syncedAt: dataset?.meta.syncedAt || null,
    warnings: dataset?.meta.warnings || [],
    bcConfigured: bcConfigured(),
    syncing: Boolean(syncing),
    lastError,
    counts: dataset ? { gl: dataset.gl.length, sales: dataset.sales.length, purchases: dataset.purchases.length, customers: dataset.customers.length } : null,
  };
}

export function sync() {
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      // Öncelik: BC API > imports/ klasöründeki Excel dosyaları > demo veri
      const next = bcConfigured() ? await syncFromBC() : hasExcel() ? await importExcelFolder(IMPORTS_DIR) : generateDemo({ end: today() });
      await mkdir(dirname(config.dataFile), { recursive: true });
      const tmp = `${config.dataFile}.tmp`;
      await writeFile(tmp, JSON.stringify(next));
      await rename(tmp, config.dataFile);
      dataset = next;
      lastError = null;
    } catch (err) {
      lastError = { at: new Date().toISOString(), message: err.message };
      console.error('Senkronizasyon hatası:', err);
      if (!dataset) throw err;
    } finally {
      syncing = null;
    }
    return dataset;
  })();
  return syncing;
}
