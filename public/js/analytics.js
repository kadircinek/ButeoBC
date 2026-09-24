// Analiz motoru: veri setinden dönemsel KPI, kâr/zarar, satış, nakit ve risk göstergelerini hesaplar.
// Saf JavaScript'tir; hem tarayıcıda hem Node'da (testler, statik dışa aktarım) çalışır.

export const GROUP_LABELS = {
  revenue: 'Brüt satışlar',
  returns: 'Satış iadeleri',
  cogs: 'Satılan malın maliyeti',
  nakliye: 'Nakliye / navlun',
  depo: 'Depo / ardiye',
  gumruk: 'Gümrük',
  pazarlama: 'Diğer satış-pazarlama',
  genel: 'Genel yönetim',
  finansman: 'Finansman',
  otherIncome: 'Diğer gelirler (kur farkı vb.)',
  otherExpense: 'Diğer giderler (kur farkı vb.)',
};
export const OPEX_GROUPS = ['nakliye', 'depo', 'gumruk', 'pazarlama', 'genel'];
export const LOGISTICS_GROUPS = ['nakliye', 'depo', 'gumruk'];
const CASH_GROUPS = ['cash', 'bank'];

// ---------- Tarih yardımcıları (YYYY-MM-DD, UTC) ----------
const DAY = 864e5;
const ms = (d) => Date.parse(`${d}T00:00:00Z`);
const iso = (t) => new Date(t).toISOString().slice(0, 10);
export const addDays = (d, n) => iso(ms(d) + n * DAY);
const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / DAY);
function addMonths(d, n) {
  const dt = new Date(ms(d));
  const day = dt.getUTCDate();
  dt.setUTCDate(1);
  dt.setUTCMonth(dt.getUTCMonth() + n);
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(day, last));
  return iso(dt.getTime());
}
const addYears = (d, n) => addMonths(d, 12 * n);
const weekStart = (d) => addDays(d, -((new Date(ms(d)).getUTCDay() + 6) % 7));
const monthStart = (d) => `${d.slice(0, 7)}-01`;
const yearStart = (d) => `${d.slice(0, 4)}-01-01`;
export const todayIso = () => new Date().toLocaleDateString('sv-SE');

const BUCKET = {
  day: { start: (d) => d, next: (d) => addDays(d, 1) },
  week: { start: weekStart, next: (d) => addDays(d, 7) },
  month: { start: monthStart, next: (d) => addMonths(d, 1) },
  year: { start: yearStart, next: (d) => addYears(d, 1) },
};

export function bucketsBetween(from, to, g) {
  const out = [];
  for (let k = BUCKET[g].start(from); k <= to; k = BUCKET[g].next(k)) {
    out.push({ key: k, from: k < from ? from : k, to: minD(addDays(BUCKET[g].next(k), -1), to) });
  }
  return out;
}
const minD = (a, b) => (a < b ? a : b);
const maxD = (a, b) => (a > b ? a : b);

// Görünüm modlarına göre pencere (grafik aralığı), güncel dönem ve karşılaştırma dönemleri.
export function periodsFor(mode, end, firstDate) {
  const b = BUCKET[mode];
  const curFrom = b.start(end);
  const offset = daysBetween(curFrom, end);
  const prevFrom = mode === 'day' ? addDays(end, -1) : mode === 'week' ? addDays(curFrom, -7) : mode === 'month' ? addMonths(curFrom, -1) : addYears(curFrom, -1);
  const prevTo = minD(addDays(prevFrom, offset), addDays(curFrom, -1));
  const yoyShift = mode === 'week' || mode === 'day' ? (d) => addDays(d, -364) : (d) => addYears(d, -1);
  let winFrom;
  if (mode === 'day') winFrom = addDays(end, -29);
  else if (mode === 'week') winFrom = addDays(curFrom, -7 * 11);
  else if (mode === 'month') winFrom = addMonths(curFrom, -11);
  else winFrom = maxD(yearStart(firstDate || addYears(end, -4)), addYears(curFrom, -4));
  const winLen = daysBetween(winFrom, end) + 1;
  return {
    mode,
    current: { from: curFrom, to: end },
    previous: { from: prevFrom, to: prevTo },
    yoy: { from: yoyShift(curFrom), to: yoyShift(end) },
    window: { from: winFrom, to: end },
    windowPrev: { from: addDays(winFrom, -winLen), to: addDays(winFrom, -1) },
    windowYoy: { from: yoyShift(winFrom), to: yoyShift(end) },
  };
}

// ---------- Hazırlık ----------
const prepared = new WeakMap();

export function prepare(ds) {
  if (prepared.has(ds)) return prepared.get(ds);
  const acct = new Map(ds.accounts.map((a) => [a.no, a]));
  const has7 = ds.gl.some((r) => acct.get(r.a)?.family === '7');
  // 7/A seçeneğinde giderler 7'li hesaplarda izlenir; 63x/66x yansıtmaları çift sayılmasın.
  const groupOf = (no) => {
    const a = acct.get(no);
    if (!a) return 'other';
    if (has7 && a.family === '6') return 'transfer';
    return a.group;
  };
  const gl = [...ds.gl].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0)).map((r) => ({ ...r, g: groupOf(r.a) }));
  const hasGlRevenue = gl.some((r) => r.g === 'revenue');
  const units = ds.meta?.tonnageUnits || { TON: 1, KG: 0.001 };
  const tons = (line) => {
    const f = units[(line.uom || '').toUpperCase()];
    return f == null ? 0 : line.qty * f;
  };
  const sales = [...ds.sales].sort((a, b) => a.date.localeCompare(b.date));
  const purchases = [...ds.purchases].sort((a, b) => a.date.localeCompare(b.date));
  const usd = buildRate(ds);
  const ctx = { ds, acct, gl, hasGlRevenue, tons, sales, purchases, usd, firstDate: sales[0]?.date || gl.find((r) => r.g === 'revenue')?.d || gl[0]?.d };
  prepared.set(ds, ctx);
  return ctx;
}

function buildRate(ds) {
  let list = ds.rates?.USD;
  if (!list?.length) {
    list = [...ds.sales, ...ds.purchases].filter((d) => d.cur === 'USD' && d.fx > 1).map((d) => [d.date, d.fx]).sort((a, b) => a[0].localeCompare(b[0]));
  }
  if (!list?.length) return null;
  return (d) => {
    let lo = 0, hi = list.length - 1, ans = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (list[mid][0] <= d) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return list[ans][1];
  };
}

function lowerBound(rows, d, key = 'd') {
  let lo = 0, hi = rows.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (rows[mid][key] < d) lo = mid + 1; else hi = mid; }
  return lo;
}

// ---------- Kâr / zarar ----------
function emptyPnl() {
  const p = { revenue: 0, returns: 0, cogs: 0, otherIncome: 0, otherExpense: 0, finansman: 0 };
  for (const g of OPEX_GROUPS) p[g] = 0;
  return p;
}

function addGl(p, r, v) {
  const amt = r.dr - r.cr;
  switch (r.g) {
    case 'revenue': p.revenue -= amt * v; break;
    case 'otherIncome': p.otherIncome -= amt * v; break;
    case 'returns': case 'cogs': case 'finansman': case 'otherExpense':
    case 'nakliye': case 'depo': case 'gumruk': case 'pazarlama': case 'genel':
      p[r.g] += amt * v; break;
    default:
  }
}

function finishPnl(p) {
  p.netSales = p.revenue - p.returns;
  p.gross = p.netSales - p.cogs;
  p.grossMargin = p.netSales ? p.gross / p.netSales : null;
  p.opex = OPEX_GROUPS.reduce((s, g) => s + p[g], 0);
  p.logistics = LOGISTICS_GROUPS.reduce((s, g) => s + p[g], 0);
  p.operating = p.gross - p.opex;
  p.netProfit = p.operating + p.otherIncome - p.otherExpense - p.finansman;
  p.netMargin = p.netSales ? p.netProfit / p.netSales : null;
  p.logisticsRatio = p.netSales ? p.logistics / p.netSales : null;
  return p;
}

// Para birimi çevirici: 'USD' seçiliyse her tutar kendi tarihindeki kurla bölünür.
function conv(ctx, cur) {
  if (cur === 'USD' && ctx.usd) return (d) => 1 / ctx.usd(d);
  return () => 1;
}

export function pnlSeries(ctx, buckets, cur = 'TRY') {
  const v = conv(ctx, cur);
  const out = buckets.map(() => emptyPnl());
  if (!buckets.length) return [];
  const from = buckets[0].from, to = buckets[buckets.length - 1].to;
  let bi = 0;
  for (let i = lowerBound(ctx.gl, from); i < ctx.gl.length && ctx.gl[i].d <= to; i++) {
    const r = ctx.gl[i];
    while (r.d > buckets[bi].to) bi++;
    addGl(out[bi], r, v(r.d));
  }
  if (!ctx.hasGlRevenue) {
    // GL yoksa satış belgelerinden gelir (maliyet bilinmez).
    bi = 0;
    for (let i = lowerBound(ctx.sales, from, 'date'); i < ctx.sales.length && ctx.sales[i].date <= to; i++) {
      const s = ctx.sales[i];
      while (s.date > buckets[bi].to) bi++;
      if (s.type === 'credit') out[bi].returns += s.net * v(s.date); else out[bi].revenue += s.net * v(s.date);
    }
  }
  return out.map(finishPnl);
}

export const pnl = (ctx, range, cur) => pnlSeries(ctx, [{ key: range.from, ...range }], cur)[0];

// ---------- Bilanço bakiyeleri ----------
function balances(ctx, groups, date) {
  const byAcc = new Map();
  for (let i = 0; i < ctx.gl.length && ctx.gl[i].d <= date; i++) {
    const r = ctx.gl[i];
    if (!groups.includes(r.g)) continue;
    byAcc.set(r.a, (byAcc.get(r.a) || 0) + r.dr - r.cr);
  }
  return byAcc;
}

function balanceSeries(ctx, groups, buckets, cur) {
  const out = [];
  let bal = 0, i = 0;
  for (const b of buckets) {
    for (; i < ctx.gl.length && ctx.gl[i].d <= b.to; i++) if (groups.includes(ctx.gl[i].g)) bal += ctx.gl[i].dr - ctx.gl[i].cr;
    out.push(cur === 'USD' && ctx.usd ? bal / ctx.usd(b.to) : bal);
  }
  return out;
}

function flowSeries(ctx, buckets, cur) {
  // Tahsilat: alıcı hesaplarına alacak kaydı (iade faturaları hariç); Tedarikçi ödemesi: satıcı hesaplarına borç kaydı.
  const v = conv(ctx, cur);
  const out = buckets.map(() => ({ collections: 0, vendorPayments: 0 }));
  if (!buckets.length) return out;
  const from = buckets[0].from, to = buckets[buckets.length - 1].to;
  let bi = 0;
  for (let i = lowerBound(ctx.gl, from); i < ctx.gl.length && ctx.gl[i].d <= to; i++) {
    const r = ctx.gl[i];
    while (r.d > buckets[bi].to) bi++;
    if (r.g === 'receivable') out[bi].collections += r.cr * v(r.d);
    if (r.g === 'payable') out[bi].vendorPayments += r.dr * v(r.d);
  }
  const sub = (docs, field) => {
    bi = 0;
    for (let i = lowerBound(docs, from, 'date'); i < docs.length && docs[i].date <= to; i++) {
      const d = docs[i];
      while (d.date > buckets[bi].to) bi++;
      if (d.type === 'credit') out[bi][field] -= d.gross * v(d.date);
    }
  };
  sub(ctx.sales, 'collections');
  sub(ctx.purchases, 'vendorPayments');
  return out.map((o) => ({ collections: Math.max(0, o.collections), vendorPayments: Math.max(0, o.vendorPayments) }));
}

// ---------- Satış / satınalma kırılımları ----------
function docStats(ctx, docs, range, cur, nameMap) {
  const v = conv(ctx, cur);
  const parties = new Map(), products = new Map(), people = new Map();
  let total = 0, tons = 0, count = 0;
  for (let i = lowerBound(docs, range.from, 'date'); i < docs.length && docs[i].date <= range.to; i++) {
    const d = docs[i];
    const sign = d.type === 'credit' ? -1 : 1;
    const amt = sign * d.net * v(d.date);
    total += amt;
    if (d.type !== 'credit') count++;
    const p = parties.get(d.party) || { no: d.party, name: nameMap?.get(d.party) || d.partyName, net: 0, tons: 0, count: 0, last: '' };
    p.net += amt; p.count += d.type !== 'credit' ? 1 : 0; p.last = maxD(p.last, d.date);
    parties.set(d.party, p);
    if (d.sp) {
      const s = people.get(d.sp) || { code: d.sp, net: 0, tons: 0, count: 0, customers: new Set() };
      s.net += amt; s.count += d.type !== 'credit' ? 1 : 0; s.customers.add(d.party);
      people.set(d.sp, s);
    }
    for (const l of d.lines || []) {
      const t = sign * ctx.tons(l);
      tons += t; p.tons += t;
      if (d.sp) people.get(d.sp).tons += t;
      if (!l.item) continue;
      const pr = products.get(l.item) || { no: l.item, name: l.desc, net: 0, tons: 0 };
      pr.net += sign * l.net * v(d.date); pr.tons += t;
      products.set(l.item, pr);
    }
  }
  return { total, tons, count, parties, products, people };
}

// ---------- Ana analiz ----------
export function analyze(ds, { mode = 'month', end = todayIso(), currency = 'TRY' } = {}) {
  const ctx = prepare(ds);
  const cur = currency === 'USD' && ctx.usd ? 'USD' : 'TRY';
  const P = periodsFor(mode, end, ctx.firstDate);
  const buckets = bucketsBetween(P.window.from, P.window.to, mode);

  const series = pnlSeries(ctx, buckets, cur);
  const yoyShift = mode === 'week' || mode === 'day' ? (d) => addDays(d, -364) : (d) => addYears(d, -1);
  const seriesYoy = pnlSeries(ctx, buckets.map((b) => ({ key: b.key, from: yoyShift(b.from), to: yoyShift(b.to) })), cur);
  const k = {
    current: pnl(ctx, P.current, cur),
    previous: pnl(ctx, P.previous, cur),
    yoy: pnl(ctx, P.yoy, cur),
    window: pnl(ctx, P.window, cur),
    windowPrev: pnl(ctx, P.windowPrev, cur),
    windowYoy: pnl(ctx, P.windowYoy, cur),
  };

  const custNames = new Map(ds.customers.map((c) => [c.no, c.name]));
  const vendNames = new Map(ds.vendors.map((c) => [c.no, c.name]));
  const itemNames = new Map(ds.items.map((i) => [i.no, i.name]));
  const sCur = docStats(ctx, ctx.sales, P.current, cur, custNames);
  const sPrev = docStats(ctx, ctx.sales, P.previous, cur, custNames);
  const sYoy = docStats(ctx, ctx.sales, P.yoy, cur, custNames);
  const sWin = docStats(ctx, ctx.sales, P.window, cur, custNames);
  const sWinPrev = docStats(ctx, ctx.sales, P.windowPrev, cur, custNames);
  const pWin = docStats(ctx, ctx.purchases, P.window, cur, vendNames);
  const pWinPrev = docStats(ctx, ctx.purchases, P.windowPrev, cur, vendNames);

  // Bucket bazlı satış tonajı ve satınalma
  const tonSeries = buckets.map((b) => docStats(ctx, ctx.sales, b, cur).tons);
  const purchSeries = buckets.map((b) => docStats(ctx, ctx.purchases, b, cur).total);
  const activeCustSeries = buckets.map((b) => [...docStats(ctx, ctx.sales, b, cur).parties.values()].filter((p) => p.net > 0).length);

  // Müşteriler
  const customers = [...sWin.parties.values()].map((c) => ({
    ...c, prev: sWinPrev.parties.get(c.no)?.net || 0, share: sWin.total ? c.net / sWin.total : 0,
  })).sort((a, b) => b.net - a.net);
  const lostCustomers = [...sWinPrev.parties.values()].filter((c) => c.net > 0 && !sWin.parties.has(c.no)).sort((a, b) => b.net - a.net);
  const firstSale = new Map();
  for (const s of ctx.sales) if (!firstSale.has(s.party)) firstSale.set(s.party, s.date);
  const newCustomers = customers.filter((c) => firstSale.get(c.no) >= P.window.from);
  const top5Share = customers.slice(0, 5).reduce((s, c) => s + c.share, 0);

  // Ürünler (tahmini marj: pencere içindeki ortalama alış maliyeti / ton)
  const costPerTon = new Map();
  for (const [no, p] of pWin.products) if (p.tons > 0) costPerTon.set(no, p.net / p.tons);
  const products = [...sWin.products.values()].map((p) => {
    const cpt = costPerTon.get(p.no);
    const prev = sWinPrev.products.get(p.no);
    return {
      ...p, name: itemNames.get(p.no) || p.name, pricePerTon: p.tons ? p.net / p.tons : null,
      prevNet: prev?.net || 0, prevTons: prev?.tons || 0,
      estMargin: cpt && p.tons ? (p.net - cpt * p.tons) / p.net : null,
      share: sWin.total ? p.net / sWin.total : 0,
    };
  }).sort((a, b) => b.net - a.net);

  // Ürün başına ton fiyatı trendi (en çok satan 4 ürün)
  const topProductNos = products.slice(0, 4).map((p) => p.no);
  const priceTrend = topProductNos.map((no) => ({
    no, name: itemNames.get(no) || no,
    values: buckets.map((b) => { const pr = docStats(ctx, ctx.sales, b, cur).products.get(no); return pr && pr.tons > 0 ? pr.net / pr.tons : null; }),
  }));

  const salespeople = [...sWin.people.values()].map((s) => ({
    code: s.code, net: s.net, tons: s.tons, count: s.count, customers: s.customers.size,
    prev: sWinPrev.people.get(s.code)?.net || 0,
  })).sort((a, b) => b.net - a.net);

  const vendors = [...pWin.parties.values()].map((v) => ({ ...v, prev: pWinPrev.parties.get(v.no)?.net || 0, share: pWin.total ? v.net / pWin.total : 0 })).sort((a, b) => b.net - a.net);

  // Nakit & bilanço
  const cashByAcc = balances(ctx, CASH_GROUPS, end);
  const cashAccounts = [...cashByAcc.entries()].map(([no, bal]) => ({
    no, name: ctx.acct.get(no)?.name || no, group: ctx.acct.get(no)?.group,
    balance: cur === 'USD' && ctx.usd ? bal / ctx.usd(end) : bal,
  })).filter((a) => Math.abs(a.balance) > 0.5).sort((a, b) => b.balance - a.balance);
  const bs = (groups) => { let s = 0; for (const v of balances(ctx, groups, end).values()) s += v; return cur === 'USD' && ctx.usd ? s / ctx.usd(end) : s; };
  const cash = cashAccounts.reduce((s, a) => s + a.balance, 0);
  const receivables = bs(['receivable']);
  const payables = -bs(['payable']);
  const inventory = bs(['inventory']);
  const loans = -bs(['loan']);
  const cashSeries = balanceSeries(ctx, CASH_GROUPS, buckets, cur);
  const flows = flowSeries(ctx, buckets, cur);

  // Devir hızları (son 90 gün)
  const r90 = { from: addDays(end, -89), to: end };
  const s90 = docStats(ctx, ctx.sales, r90, cur);
  const p90 = docStats(ctx, ctx.purchases, r90, cur);
  const pnl90 = pnl(ctx, r90, cur);
  const grossOf = (docs, range) => { let s = 0; const v = conv(ctx, cur); for (let i = lowerBound(docs, range.from, 'date'); i < docs.length && docs[i].date <= range.to; i++) s += (docs[i].type === 'credit' ? -1 : 1) * docs[i].gross * v(docs[i].date); return s; };
  const salesGross90 = grossOf(ctx.sales, r90) || s90.total;
  const purchGross90 = grossOf(ctx.purchases, r90) || p90.total;
  const dso = salesGross90 > 0 ? (receivables / salesGross90) * 90 : null;
  const dpo = purchGross90 > 0 ? (payables / purchGross90) * 90 : null;
  const dio = pnl90.cogs > 0 && inventory > 0 ? (inventory / pnl90.cogs) * 90 : null;
  const monthlyBurn = (pnl90.opex + pnl90.finansman) / 3;
  const runwayMonths = monthlyBurn > 0 ? cash / monthlyBurn : null;

  // Yaşlandırma
  const agingTotals = (rows) => rows.reduce((t, r) => ({ total: t.total + r.total, current: t.current + r.current, p1: t.p1 + r.p1, p2: t.p2 + r.p2, p3: t.p3 + r.p3 }), { total: 0, current: 0, p1: 0, p2: 0, p3: 0 });
  const agingFx = cur === 'USD' && ctx.usd ? 1 / ctx.usd(ds.aging?.asOf || end) : 1;
  const scaleAging = (rows) => (rows || []).map((r) => ({ ...r, total: r.total * agingFx, current: r.current * agingFx, p1: r.p1 * agingFx, p2: r.p2 * agingFx, p3: r.p3 * agingFx }));
  const agingAR = scaleAging(ds.aging?.receivables).sort((a, b) => b.total - a.total);
  const agingAP = scaleAging(ds.aging?.payables).sort((a, b) => b.total - a.total);
  const arT = agingTotals(agingAR);
  const apT = agingTotals(agingAP);
  const overdueRatio = arT.total > 0 ? (arT.p1 + arT.p2 + arT.p3) / arT.total : 0;

  const result = {
    mode, end, currency: cur, periods: P, buckets,
    meta: ds.meta,
    kpis: k,
    sales: { current: sCur, previous: sPrev, yoy: sYoy, window: sWin, windowPrev: sWinPrev },
    series: { pnl: series, pnlYoy: seriesYoy, tons: tonSeries, purchases: purchSeries, activeCustomers: activeCustSeries, cash: cashSeries, flows, priceTrend },
    customers, lostCustomers, newCustomers, top5Share, products, salespeople,
    purchasing: { total: pWin.total, prevTotal: pWinPrev.total, tons: pWin.tons, vendors },
    balance: { cash, cashAccounts, receivables, payables, inventory, loans, workingCapital: cash + receivables + inventory - payables },
    ratios: { dso, dpo, dio, ccc: dso != null && dpo != null ? dso + (dio || 0) - dpo : null, runwayMonths, monthlyBurn, overdueRatio },
    aging: { asOf: ds.aging?.asOf, periodLength: ds.aging?.periodLength, receivables: agingAR, payables: agingAP, arTotals: arT, apTotals: apT },
  };
  result.health = healthScore(result);
  result.insights = insights(result);
  return result;
}

// ---------- Sağlık skoru ----------
const clamp = (x) => Math.max(0, Math.min(100, x));
const lerp = (x, lo, hi) => clamp(((x - lo) / (hi - lo)) * 100);
export const change = (a, b) => (b ? (a - b) / Math.abs(b) : null);

function healthScore(r) {
  const w = r.kpis.window, wy = r.kpis.windowYoy, wp = r.kpis.windowPrev;
  const parts = [];
  const growth = change(w.netSales, wy.netSales) ?? change(w.netSales, wp.netSales);
  if (growth != null) parts.push({ key: 'growth', label: 'Büyüme', weight: 20, score: lerp(growth, -0.2, 0.25), value: growth, fmt: 'pct' });
  if (w.grossMargin != null) parts.push({ key: 'margin', label: 'Brüt marj', weight: 20, score: lerp(w.grossMargin, 0.02, 0.12), value: w.grossMargin, fmt: 'pct' });
  if (w.netMargin != null) parts.push({ key: 'profit', label: 'Net kârlılık', weight: 20, score: lerp(w.netMargin, -0.02, 0.06), value: w.netMargin, fmt: 'pct' });
  if (r.ratios.runwayMonths != null) parts.push({ key: 'liquidity', label: 'Nakit yeterliliği', weight: 15, score: lerp(r.ratios.runwayMonths, 0, 6), value: r.ratios.runwayMonths, fmt: 'months' });
  if (r.aging.arTotals.total > 0) parts.push({ key: 'collection', label: 'Tahsilat disiplini', weight: 15, score: lerp(1 - r.ratios.overdueRatio, 0.5, 0.95), value: r.ratios.overdueRatio, fmt: 'pct' });
  if (r.customers.length) parts.push({ key: 'concentration', label: 'Müşteri dağılımı', weight: 10, score: lerp(1 - (r.customers[0]?.share || 0), 0.5, 0.85), value: r.customers[0]?.share || 0, fmt: 'pct' });
  const totalW = parts.reduce((s, p) => s + p.weight, 0);
  const score = totalW ? Math.round(parts.reduce((s, p) => s + p.score * p.weight, 0) / totalW) : null;
  const status = score == null ? 'unknown' : score >= 70 ? 'good' : score >= 50 ? 'warning' : 'critical';
  return { score, status, parts };
}

// ---------- Otomatik yorumlar ----------
const pct = (x) => `%${(Math.abs(x) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
const pp = (x) => `${(Math.abs(x) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} puan`;

function insights(r) {
  const out = [];
  const w = r.kpis.window, wp = r.kpis.windowPrev, wy = r.kpis.windowYoy;
  const winLabel = { day: 'son 30 günde', week: 'son 12 haftada', month: 'son 12 ayda', year: 'dönem boyunca' }[r.mode];

  const g = change(w.netSales, wy.netSales);
  if (g != null) {
    out.push({ tone: g >= 0.05 ? 'good' : g <= -0.05 ? 'critical' : 'info', area: 'CEO',
      text: `Net satışlar ${winLabel} geçen yılın aynı dönemine göre ${pct(g)} ${g >= 0 ? 'arttı' : 'azaldı'}.` + (r.currency === 'TRY' ? ' (TL bazında; enflasyonu ayırmak için USD görünümüne bakın.)' : '') });
  }
  const tg = change(r.sales.window.tons, docTonsPrev(r));
  if (tg != null && Math.abs(tg) > 0.02) {
    out.push({ tone: tg > 0 ? 'good' : 'warning', area: 'Satış', text: `Satılan miktar önceki döneme göre ${pct(tg)} ${tg > 0 ? 'arttı' : 'azaldı'} (${fmtNum(r.sales.window.tons)} ton). Fiyat etkisinden bağımsız gerçek hacim göstergesidir.` });
  }
  if (w.grossMargin != null && wp.grossMargin != null) {
    const d = w.grossMargin - wp.grossMargin;
    if (Math.abs(d) >= 0.003) out.push({ tone: d > 0 ? 'good' : 'warning', area: 'CFO', text: `Brüt marj ${pp(d)} ${d > 0 ? 'iyileşerek' : 'gerileyerek'} ${pct(w.grossMargin)} oldu.` });
  }
  if (w.netProfit < 0) out.push({ tone: 'critical', area: 'CEO', text: `Dönem net sonucu zarar gösteriyor. Gider kalemleri ve finansman maliyeti gözden geçirilmeli.` });
  if (w.logisticsRatio != null && wp.logisticsRatio != null) {
    const d = w.logisticsRatio - wp.logisticsRatio;
    if (Math.abs(d) >= 0.002) out.push({ tone: d > 0 ? 'warning' : 'good', area: 'Lojistik', text: `Nakliye + depo + gümrük giderlerinin satışlara oranı ${pp(d)} ${d > 0 ? 'yükseldi' : 'düştü'} (${pct(w.logisticsRatio)}).` });
  }
  const top = r.customers[0];
  if (top && top.share > 0.2) out.push({ tone: 'warning', area: 'Satış', text: `En büyük müşteri (${top.name}) cironun ${pct(top.share)}'ini oluşturuyor; müşteri yoğunlaşma riski var.` });
  if (r.top5Share > 0.6) out.push({ tone: 'warning', area: 'Satış', text: `İlk 5 müşteri cironun ${pct(r.top5Share)}'ini oluşturuyor.` });
  if (r.lostCustomers.length) {
    const lost = r.lostCustomers.slice(0, 3).map((c) => c.name).join(', ');
    out.push({ tone: 'warning', area: 'Satış', text: `Önceki dönemde alım yapıp bu dönem hiç alım yapmayan ${r.lostCustomers.length} müşteri var: ${lost}${r.lostCustomers.length > 3 ? '…' : ''}` });
  }
  if (r.newCustomers.length) out.push({ tone: 'good', area: 'Satış', text: `Bu dönemde ${r.newCustomers.length} yeni müşteri kazanıldı (${r.newCustomers.slice(0, 3).map((c) => c.name).join(', ')}).` });
  const movers = r.products.filter((p) => p.prevNet > 0).map((p) => ({ ...p, g: change(p.net, p.prevNet) })).sort((a, b) => b.g - a.g);
  if (movers.length >= 2) {
    const up = movers[0], down = movers[movers.length - 1];
    if (up.g > 0.1) out.push({ tone: 'info', area: 'Satış', text: `En hızlı büyüyen ürün: ${up.name} (${pct(up.g)} artış).` });
    if (down.g < -0.1) out.push({ tone: 'info', area: 'Satış', text: `En çok gerileyen ürün: ${down.name} (${pct(down.g)} düşüş).` });
  }
  if (r.ratios.overdueRatio > 0.25) out.push({ tone: r.ratios.overdueRatio > 0.4 ? 'critical' : 'warning', area: 'CFO', text: `Alacakların ${pct(r.ratios.overdueRatio)}'i vadesi geçmiş durumda. Tahsilat takibi öncelikli olmalı.` });
  if (r.ratios.runwayMonths != null) {
    const m = r.ratios.runwayMonths;
    out.push({ tone: m < 2 ? 'critical' : m < 4 ? 'warning' : 'good', area: 'CFO', text: `Mevcut nakit, aylık sabit gider + finansman yükünü yaklaşık ${m.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ay karşılıyor.` });
  }
  if (r.ratios.dso != null && r.ratios.dpo != null && r.ratios.dso - r.ratios.dpo > 30) {
    out.push({ tone: 'warning', area: 'CFO', text: `Ortalama tahsilat süresi (${Math.round(r.ratios.dso)} gün) ödeme süresinden (${Math.round(r.ratios.dpo)} gün) ${Math.round(r.ratios.dso - r.ratios.dpo)} gün uzun; büyüme işletme sermayesi ihtiyacını artırır.` });
  }
  const order = { critical: 0, warning: 1, good: 2, info: 3 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

const docTonsPrev = (r) => r.sales.windowPrev.tons;
const fmtNum = (n) => Math.round(n).toLocaleString('tr-TR');
