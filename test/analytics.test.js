import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, periodsFor, bucketsBetween, prepare, pnl } from '../public/js/analytics.js';
import { makeClassifier, loadAccountConfig } from '../server/classify.js';
import { generateDemo } from '../server/demo/generate.js';

const tiny = () => ({
  meta: { source: 'test', company: 'T', tonnageUnits: { TON: 1, KG: 0.001 } },
  accounts: [
    { no: '600.01', name: 'Yurtiçi Satışlar', group: 'revenue', family: null },
    { no: '621.01', name: 'SMM', group: 'cogs', family: null },
    { no: '760.01', name: 'Nakliye', group: 'nakliye', family: '7' },
    { no: '761.01', name: 'Yansıtma', group: 'transfer', family: null },
    { no: '631.01', name: 'Pazarlama (6)', group: 'pazarlama', family: '6' },
    { no: '102.01', name: 'Banka', group: 'bank', family: null },
  ],
  gl: [
    { d: '2026-01-10', a: '600.01', dr: 0, cr: 1000 },
    { d: '2026-01-10', a: '621.01', dr: 900, cr: 0 },
    { d: '2026-01-15', a: '760.01', dr: 30, cr: 0 },
    // 7/A yansıtması: 761 alacak, 631 borç -> çift sayılmamalı
    { d: '2026-01-31', a: '761.01', dr: 0, cr: 30 },
    { d: '2026-01-31', a: '631.01', dr: 30, cr: 0 },
    { d: '2026-01-10', a: '102.01', dr: 500, cr: 0 },
  ],
  customers: [], vendors: [], items: [],
  sales: [{ type: 'invoice', no: 'S1', date: '2026-01-10', due: '2026-02-10', party: 'C1', partyName: 'Müşteri', net: 1000, gross: 1200, lines: [{ item: 'PP', qty: 2000, uom: 'KG', net: 1000 }] }],
  purchases: [],
  aging: { receivables: [], payables: [] },
});

test('kâr/zarar ve 7/A yansıtma hesaplarının çift sayılmaması', () => {
  const ctx = prepare(tiny());
  const p = pnl(ctx, { from: '2026-01-01', to: '2026-01-31' });
  assert.equal(p.netSales, 1000);
  assert.equal(p.gross, 100);
  assert.equal(p.nakliye, 30);
  assert.equal(p.pazarlama, 0);
  assert.equal(p.netProfit, 70);
});

test('tonaj KG satırlarını tona çevirir', () => {
  const r = analyze(tiny(), { mode: 'month', end: '2026-01-31' });
  assert.equal(r.sales.current.tons, 2);
  assert.equal(r.balance.cash, 500);
});

test('dönem tanımları', () => {
  const p = periodsFor('month', '2026-03-31', '2024-01-01');
  assert.deepEqual(p.current, { from: '2026-03-01', to: '2026-03-31' });
  assert.deepEqual(p.previous, { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(p.yoy, { from: '2025-03-01', to: '2025-03-31' });
  assert.equal(p.window.from, '2025-04-01');
  const w = periodsFor('week', '2026-09-24');
  assert.equal(w.current.from, '2026-09-21');
  assert.equal(bucketsBetween(w.window.from, w.window.to, 'week').length, 12);
});

test('hesap sınıflandırıcı: önek, anahtar kelime ve yansıtma', () => {
  const c = makeClassifier(loadAccountConfig());
  assert.equal(c('600.01', 'Yurtiçi Satışlar').group, 'revenue');
  assert.equal(c('760.05', 'Gümrük Müşavirlik Giderleri').group, 'gumruk');
  assert.equal(c('770.10', 'Depo Kira Gideri - Ardiye').group, 'depo');
  assert.equal(c('770.01', 'Personel Giderleri').group, 'genel');
  assert.equal(c('761', 'Pazarlama Satış Dağıtım Gid. Yansıtma').group, 'transfer');
  assert.equal(c('102.05', 'Garanti USD').group, 'bank');
  assert.equal(c('621.01', 'Nakliye dahil SMM').group, 'cogs');
});

test('demo veri tutarlı: GL borç = alacak ve analiz tüm modlarda çalışır', () => {
  const ds = generateDemo({ end: '2026-06-30' });
  const dr = ds.gl.reduce((s, r) => s + r.dr, 0);
  const cr = ds.gl.reduce((s, r) => s + r.cr, 0);
  assert.ok(Math.abs(dr - cr) < 1, `dengesiz: ${dr - cr}`);
  for (const mode of ['day', 'week', 'month', 'year']) {
    const r = analyze(ds, { mode, end: '2026-06-30' });
    assert.ok(r.kpis.window.netSales > 0);
    assert.ok(r.health.score >= 0 && r.health.score <= 100);
    assert.equal(r.series.pnl.length, r.buckets.length);
  }
});
