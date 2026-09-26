import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { generateDemo } from '../server/demo/generate.js';
import { importExcelFolder } from '../server/excel/import.js';
import { analyze } from '../public/js/analytics.js';

// BC'nin Türkçe arayüzünden "Excel'de aç" ile alınmış gibi dosyalar üretir.
async function writeXlsx(dir, name, headers, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sayfa1');
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  await wb.xlsx.writeFile(join(dir, `${name}.xlsx`));
}
const d = (s) => new Date(`${s}T00:00:00Z`);

test('BC Excel dışa aktarımları içe aktarılır ve K/Z demo ile aynı çıkar', async () => {
  const ds = generateDemo({ end: '2026-06-30' });
  const dir = await mkdtemp(join(tmpdir(), 'buteo-'));
  await writeXlsx(dir, 'hesap-plani', ['No.', 'Ad', 'Gelir/Bilanço', 'Hesap Türü'], [['6', 'GELİR TABLOSU', '', 'Başlık'], ...ds.accounts.map((a) => [a.no, a.name, '', 'Nakil'])]);
  await writeXlsx(dir, 'genel-muhasebe', ['Nakil Tarihi', 'Belge Türü', 'Belge No.', 'Genel Muhasebe Hesap No.', 'Açıklama', 'Tutar', 'Borç Tutarı', 'Alacak Tutarı'],
    ds.gl.map((r) => [d(r.d), '', 'X', r.a, '', r.dr - r.cr, r.dr, r.cr]));
  const ile = [];
  for (const s of ds.sales) for (const l of s.lines) ile.push([d(s.date), 'Satış', s.no, l.item, l.desc, s.party, s.type === 'credit' ? l.qty : -l.qty, 'TON', s.type === 'credit' ? -l.net : l.net, 0]);
  for (const p of ds.purchases) for (const l of p.lines) ile.push([d(p.date), 'Satınalma', p.no, l.item, l.desc, p.party, l.qty, 'TON', 0, l.net]);
  await writeXlsx(dir, 'kalem-hareketleri', ['Nakil Tarihi', 'Hareket Türü', 'Belge No.', 'Madde No.', 'Açıklama', 'Kaynak No.', 'Miktar', 'Ölçü Birimi Kodu', 'Satış Tutarı (Gerçek)', 'Maliyet Tutarı (Gerçek)'], ile);
  await writeXlsx(dir, 'musteriler', ['No.', 'Ad', 'Şehir', 'Satış Elemanı Kodu'], ds.customers.map((c) => [c.no, c.name, c.city, c.sp]));
  await writeXlsx(dir, 'musteri-hareketleri', ['Nakil Tarihi', 'Belge No.', 'Müşteri No.', 'Müşteri Adı', 'Vade Tarihi', 'Kalan Tutar (UPB)'],
    ds.sales.filter((s) => s.remaining).map((s) => [d(s.date), s.no, s.party, s.partyName, d(s.due), s.remaining.toLocaleString('tr-TR')]));

  const imported = await importExcelFolder(dir, { log: () => {}, asOf: '2026-06-30' });
  const a = analyze(ds, { mode: 'month', end: '2026-06-30' });
  const b = analyze(imported, { mode: 'month', end: '2026-06-30' });
  const close = (x, y) => Math.abs(x - y) < 1;
  assert.ok(close(a.kpis.window.netSales, b.kpis.window.netSales), 'net satış');
  assert.ok(close(a.kpis.window.netProfit, b.kpis.window.netProfit), 'net kâr');
  assert.ok(close(a.balance.cash, b.balance.cash), 'nakit');
  assert.ok(close(a.sales.window.total, b.sales.window.total), 'belge bazlı satış');
  assert.ok(Math.abs(a.sales.window.tons - b.sales.window.tons) < 0.01, 'tonaj');
  assert.equal(b.customers[0].name, a.customers[0].name);
  assert.ok(close(a.aging.arTotals.total, b.aging.arTotals.total), 'alacak yaşlandırma');
});

test('eksik sütun anlaşılır hata verir', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'buteo-'));
  await writeXlsx(dir, 'hesap-plani', ['No.', 'Ad'], [['600', 'Satışlar']]);
  await writeXlsx(dir, 'genel-muhasebe', ['Tarih', 'Hesap'], [[d('2026-01-01'), '600']]);
  await assert.rejects(importExcelFolder(dir, { log: () => {} }), /gerekli sütun.*nakil tarihi/is);
});
