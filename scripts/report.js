// Kapsamlı Excel analiz raporu: npm run report
// Günlük / haftalık / aylık / yıllık kırılımlar, K/Z, müşteri, ürün, tedarikçi, nakit ve yaşlandırma sayfaları.
import ExcelJS from 'exceljs';
import { mkdir } from 'node:fs/promises';
import { analyze, GROUP_LABELS, OPEX_GROUPS, todayIso } from '../public/js/analytics.js';
import { getDataset } from '../server/store.js';

const ds = await getDataset();
const end = process.argv[2] || todayIso();
const R = Object.fromEntries(['day', 'week', 'month', 'year'].map((m) => [m, analyze(ds, { mode: m, end })]));

const wb = new ExcelJS.Workbook();
wb.creator = 'Buteo Analiz';
const MONEY = '#,##0 "₺";[Red]-#,##0 "₺"';
const PCT = '0.0%;[Red]-0.0%';
const NUM = '#,##0';
const HEAD = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const label = (key, mode) => (mode === 'month' ? `${MONTHS[+key.slice(5, 7) - 1]} ${key.slice(0, 4)}` : mode === 'year' ? key.slice(0, 4) : key.split('-').reverse().join('.'));
const change = (a, b) => (b ? (a - b) / Math.abs(b) : null);

function sheet(name, title, subtitle) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 3 }] });
  ws.getCell('A1').value = title;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = subtitle;
  ws.getCell('A2').font = { italic: true, color: { argb: 'FF666666' } };
  return ws;
}

// cols: [{ h, w, fmt }]; satırlar dizisi. Başlık 3. satırda.
function table(ws, cols, rows, startRow = 3, { boldRows = [] } = {}) {
  const hr = ws.getRow(startRow);
  cols.forEach((c, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = c.h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = HEAD;
    cell.alignment = { horizontal: i ? 'right' : 'left', wrapText: true };
    ws.getColumn(i + 1).width = Math.max(ws.getColumn(i + 1).width || 0, c.w || 14);
  });
  rows.forEach((r, ri) => {
    const row = ws.getRow(startRow + 1 + ri);
    r.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v == null || (typeof v === 'number' && !Number.isFinite(v)) ? null : v;
      const fmt = typeof cols[i].fmt === 'function' ? cols[i].fmt(ri) : cols[i].fmt;
      if (fmt) cell.numFmt = fmt;
    });
    if (boldRows.includes(ri)) row.font = { bold: true };
  });
  return startRow + rows.length + 2;
}

// ---- Özet ----
{
  const m = R.month, h = m.health;
  const ws = sheet('Özet', `${ds.meta.company} – Yönetim Özeti`, `Rapor tarihi: ${end} · Veri kaynağı: ${ds.meta.source} · Güncelleme: ${ds.meta.syncedAt.slice(0, 16).replace('T', ' ')}`);
  let row = table(ws, [{ h: 'Sağlık skoru', w: 34 }, { h: 'Değer', w: 16 }, { h: 'Puan (0-100)', w: 14, fmt: NUM }],
    [['GENEL SKOR', { good: 'Sağlıklı', warning: 'Dikkat', critical: 'Riskli' }[h.status] || '-', h.score],
      ...h.parts.map((p) => [p.label, p.fmt === 'pct' ? `%${(p.value * 100).toFixed(1)}` : `${p.value.toFixed(1)} ay`, Math.round(p.score)])], 3, { boldRows: [0] });

  const kpi = (name, key, r, src = 'kpis') => {
    const k = src === 'kpis' ? r.kpis : r.sales;
    return [name, k.current[key], k.previous[key], change(k.current[key], k.previous[key]), r.mode === 'year' ? null : k.yoy[key], r.mode === 'year' ? null : change(k.current[key], k.yoy[key])];
  };
  for (const [mode, title] of [['day', 'Bugün'], ['week', 'Bu hafta'], ['month', 'Bu ay'], ['year', 'Yılbaşından bugüne']]) {
    const r = R[mode];
    ws.getCell(`A${row - 1}`).value = `${title} (${r.periods.current.from} – ${r.periods.current.to})`;
    ws.getCell(`A${row - 1}`).font = { bold: true };
    const money = (ri) => (ri === 5 ? NUM : MONEY);
    row = table(ws, [{ h: 'Gösterge', w: 34 }, { h: 'Bu dönem', fmt: money }, { h: 'Önceki dönem', fmt: money }, { h: 'Değişim', fmt: PCT }, { h: 'Geçen yıl', fmt: money }, { h: 'Yıllık değişim', fmt: PCT }], [
      kpi('Net satış', 'netSales', r), kpi('Brüt kâr', 'gross', r), kpi('Faaliyet giderleri', 'opex', r),
      kpi('Lojistik (nakliye+depo+gümrük)', 'logistics', r), kpi('Net kâr (vergi öncesi)', 'netProfit', r),
      kpi('Satılan miktar (ton)', 'tons', r, 'sales'),
    ], row);
  }
  ws.getCell(`A${row}`).value = 'Analist yorumları';
  ws.getCell(`A${row}`).font = { bold: true };
  const tone = { critical: 'KRİTİK', warning: 'DİKKAT', good: 'OLUMLU', info: 'BİLGİ' };
  m.insights.forEach((i, n) => { ws.getCell(`A${row + 1 + n}`).value = `[${tone[i.tone]} · ${i.area}] ${i.text}`; });
}

// ---- Dönemsel K/Z sayfaları ----
const pnlRows = [
  ['Brüt satışlar', (p) => p.revenue], ['Satış iadeleri', (p) => -p.returns], ['NET SATIŞLAR', (p) => p.netSales],
  ['Satılan malın maliyeti', (p) => -p.cogs], ['BRÜT KÂR', (p) => p.gross], ['Brüt marj', (p) => p.grossMargin, PCT],
  ...OPEX_GROUPS.map((g) => [GROUP_LABELS[g], (p) => -p[g]]),
  ['FAALİYET KÂRI', (p) => p.operating], ['Diğer gelirler', (p) => p.otherIncome], ['Diğer giderler', (p) => -p.otherExpense],
  ['Finansman giderleri', (p) => -p.finansman], ['NET KÂR (vergi öncesi)', (p) => p.netProfit], ['Net marj', (p) => p.netMargin, PCT],
];
for (const [mode, name] of [['month', 'Aylık K-Z'], ['week', 'Haftalık K-Z'], ['day', 'Günlük K-Z'], ['year', 'Yıllık K-Z']]) {
  const r = R[mode];
  const ws = sheet(name, `${name.replace('K-Z', 'kâr / zarar')}`, `${r.periods.window.from} – ${r.periods.window.to} · genel muhasebe kayıtlarından`);
  const cols = [{ h: 'Kalem', w: 32 }, ...r.buckets.map((b) => ({ h: label(b.key, mode), w: 13 })), { h: 'Toplam', w: 15 }];
  const rows = pnlRows.map(([n, f, fmt]) => [n, ...r.series.pnl.map(f), f(r.kpis.window)]);
  rows.push(['Satılan miktar (ton)', ...r.series.tons, r.sales.window.tons]);
  const fmts = pnlRows.map(([, , fmt]) => fmt || MONEY).concat(NUM);
  cols.forEach((c, i) => { if (i) c.fmt = (ri) => fmts[ri]; });
  table(ws, cols, rows, 3, { boldRows: pnlRows.map(([n], i) => (n === n.toLocaleUpperCase('tr-TR') ? i : -1)).filter((i) => i >= 0) });
}

// ---- Müşteriler / ürünler / tedarikçiler (son 12 ay) ----
const m = R.month;
{
  const ws = sheet('Müşteriler', 'Müşteri analizi (son 12 ay)', `Önceki eşit dönemle karşılaştırma · ilk 5 müşteri payı %${(m.top5Share * 100).toFixed(1)}`);
  let row = table(ws, [{ h: 'Müşteri', w: 36 }, { h: 'Net satış', w: 16, fmt: MONEY }, { h: 'Pay', fmt: PCT }, { h: 'Önceki dönem', w: 16, fmt: MONEY }, { h: 'Değişim', fmt: PCT }, { h: 'Ton', fmt: NUM }, { h: 'Fatura', fmt: NUM }, { h: 'Son alım', w: 12 }],
    m.customers.map((c) => [c.name, c.net, c.share, c.prev, change(c.net, c.prev), c.tons, c.count, c.last]));
  ws.getCell(`A${row - 1}`).value = 'Kaybedilen müşteriler (önceki dönemde alım yapıp bu dönem yapmayanlar)';
  ws.getCell(`A${row - 1}`).font = { bold: true };
  row = table(ws, [{ h: 'Müşteri' }, { h: 'Önceki dönem', fmt: MONEY }, { h: 'Son alım' }], m.lostCustomers.map((c) => [c.name, c.net, c.last]), row);
  ws.getCell(`A${row - 1}`).value = 'Yeni müşteriler';
  ws.getCell(`A${row - 1}`).font = { bold: true };
  table(ws, [{ h: 'Müşteri' }, { h: 'Net satış', fmt: MONEY }, { h: 'Ton', fmt: NUM }], m.newCustomers.map((c) => [c.name, c.net, c.tons]), row);
}
{
  const ws = sheet('Ürünler', 'Ürün analizi (son 12 ay)', 'Marj: kalem hareketlerindeki gerçek maliyetten; yoksa ortalama alış fiyatından tahmin');
  table(ws, [{ h: 'Ürün', w: 32 }, { h: 'Net satış', w: 16, fmt: MONEY }, { h: 'Pay', fmt: PCT }, { h: 'Ton', fmt: NUM }, { h: 'Fiyat / ton', fmt: MONEY }, { h: 'Marj', fmt: PCT }, { h: 'Marj türü', w: 12 }, { h: 'Önceki dönem', w: 16, fmt: MONEY }, { h: 'Değişim', fmt: PCT }],
    m.products.map((p) => [p.name, p.net, p.share, p.tons, p.pricePerTon, p.estMargin, p.marginIsActual ? 'gerçek' : 'tahmini', p.prevNet, change(p.net, p.prevNet)]));
  const ws2 = sheet('Satış ekibi', 'Satış temsilcileri (son 12 ay)', '');
  table(ws2, [{ h: 'Temsilci', w: 16 }, { h: 'Net satış', w: 16, fmt: MONEY }, { h: 'Ton', fmt: NUM }, { h: 'Fatura', fmt: NUM }, { h: 'Müşteri', fmt: NUM }, { h: 'Önceki dönem', w: 16, fmt: MONEY }, { h: 'Değişim', fmt: PCT }],
    m.salespeople.map((s) => [s.code, s.net, s.tons, s.count, s.customers, s.prev, change(s.net, s.prev)]));
  const ws3 = sheet('Tedarikçiler', 'Tedarikçi analizi (son 12 ay)', '');
  table(ws3, [{ h: 'Tedarikçi', w: 36 }, { h: 'Alış tutarı', w: 16, fmt: MONEY }, { h: 'Pay', fmt: PCT }, { h: 'Ton', fmt: NUM }, { h: 'Önceki dönem', w: 16, fmt: MONEY }, { h: 'Değişim', fmt: PCT }],
    m.purchasing.vendors.map((v) => [v.name, v.net, v.share, v.tons, v.prev, change(v.net, v.prev)]));
}

// ---- Nakit ve yaşlandırma ----
{
  const b = m.balance, q = m.ratios;
  const ws = sheet('Nakit ve Bilanço', `Nakit ve bilanço (${end})`, 'Oranlar son 90 günlük hareketlere göre');
  let row = table(ws, [{ h: 'Kalem', w: 34 }, { h: 'Tutar / gün', w: 18 }], [
    ['Nakit + banka', b.cash], ['Ticari alacaklar', b.receivables], ['Stok', b.inventory], ['Ticari borçlar', b.payables], ['Banka kredileri', b.loans], ['İşletme sermayesi', b.workingCapital],
    ['Tahsilat süresi (gün)', q.dso], ['Ödeme süresi (gün)', q.dpo], ['Stok süresi (gün)', q.dio], ['Nakit döngüsü (gün)', q.ccc],
    ['Aylık sabit gider + finansman', q.monthlyBurn], ['Nakdin yettiği süre (ay)', q.runwayMonths], ['Vadesi geçmiş alacak oranı', q.overdueRatio],
  ]);
  for (let i = 4; i <= 9; i++) ws.getCell(`B${i}`).numFmt = MONEY;
  for (let i = 10; i <= 13; i++) ws.getCell(`B${i}`).numFmt = NUM;
  ws.getCell('B14').numFmt = MONEY; ws.getCell('B15').numFmt = '0.0'; ws.getCell('B16').numFmt = PCT;
  table(ws, [{ h: 'Banka / kasa hesabı', w: 34 }, { h: 'Hesap no', w: 14 }, { h: 'Bakiye', w: 18, fmt: MONEY }], b.cashAccounts.map((a) => [a.name, a.no, a.balance]), row);

  const ws2 = sheet('Yaşlandırma', `Alacak ve borç yaşlandırma (${m.aging.asOf || end})`, 'Açık cari hareketlere göre');
  const cols = [{ h: 'Cari', w: 36 }, { h: 'Toplam', w: 16, fmt: MONEY }, { h: 'Vadesi gelmemiş', w: 16, fmt: MONEY }, { h: '1-30 gün', w: 14, fmt: MONEY }, { h: '31-60 gün', w: 14, fmt: MONEY }, { h: '60+ gün', w: 14, fmt: MONEY }];
  const rows = (list, t) => [...list.map((x) => [x.name, x.total, x.current, x.p1, x.p2, x.p3]), ['TOPLAM', t.total, t.current, t.p1, t.p2, t.p3]];
  ws2.getCell('A3').value = 'ALACAKLAR';
  let r2 = table(ws2, cols, rows(m.aging.receivables, m.aging.arTotals), 4, { boldRows: [m.aging.receivables.length] });
  ws2.getCell(`A${r2 - 1}`).value = 'BORÇLAR';
  table(ws2, cols, rows(m.aging.payables, m.aging.apTotals), r2, { boldRows: [m.aging.payables.length] });
}

await mkdir('reports', { recursive: true });
const out = `reports/Buteo-Analiz-${end}.xlsx`;
await wb.xlsx.writeFile(out);
console.log(`Rapor yazıldı: ${out}`);
