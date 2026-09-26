import { analyze, change, todayIso, GROUP_LABELS, OPEX_GROUPS, LOGISTICS_GROUPS } from './analytics.js';

// ---------- Durum ----------
const store = (() => { try { return window.localStorage; } catch { return null; } })();
const saved = (k, d) => { try { return store?.getItem(`buteo.${k}`) || d; } catch { return d; } };
const save = (k, v) => { try { store?.setItem(`buteo.${k}`, v); } catch { /* yoksay */ } };

const state = {
  mode: saved('mode', 'month'),
  currency: saved('currency', 'TRY'),
  tab: (location.hash || '').slice(1) || saved('tab', 'ceo'),
  end: null,
  dataset: null,
  result: null,
};
const STATIC = Boolean(window.__BUTEO_DATASET__);
const charts = [];

// ---------- Biçimlendirme ----------
const cur = () => state.result?.currency || 'TRY';
const SYMBOL = { TRY: '₺', USD: '$' };
const fixed = (n, d) => n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: d });
// Kısa tutar: 1,2 Mr ₺ / 45,3 Mn ₺ / 870 bin ₺ (Türkçe kısaltmalar, "B" ile milyar karışmasın diye "bin").
function money(n) {
  if (n == null || !Number.isFinite(n)) return '–';
  const a = Math.abs(n), sign = n < 0 && a >= 0.5 ? '−' : '', sym = SYMBOL[cur()];
  if (a >= 1e9) return `${sign}${fixed(a / 1e9, 2)} Mr ${sym}`;
  if (a >= 1e6) return `${sign}${fixed(a / 1e6, 1)} Mn ${sym}`;
  if (a >= 1e4) return `${sign}${fixed(a / 1e3, 0)} bin ${sym}`;
  return `${sign}${fixed(a, a >= 100 ? 0 : 1)} ${sym}`;
}
const moneyFull = (n) => (n == null || !Number.isFinite(n) ? '–' : `${n < -0.5 ? '−' : ''}${fixed(Math.abs(n), 0)} ${SYMBOL[cur()]}`);
const numFmt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
const num = (n) => (n == null ? '–' : numFmt.format(n));
const pctS = (x, d = 1) => (x == null || !Number.isFinite(x) ? '–' : `${x < 0 ? '−' : ''}%${Math.abs(x * 100).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d })}`);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const MONTHS_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const dm = (d) => `${+d.slice(8)} ${MONTHS[+d.slice(5, 7) - 1]}`;
const dmy = (d) => `${+d.slice(8)} ${MONTHS_LONG[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;

function bucketLabel(key, mode) {
  if (mode === 'day' || mode === 'week') return dm(key);
  if (mode === 'month') return `${MONTHS[+key.slice(5, 7) - 1]} ${key.slice(2, 4)}`;
  return key.slice(0, 4);
}
function rangeLabel(r, mode) {
  if (mode === 'day') return dmy(r.to);
  if (mode === 'month') return `${MONTHS_LONG[+r.from.slice(5, 7) - 1]} ${r.from.slice(0, 4)} (${+r.from.slice(8)}–${+r.to.slice(8)})`;
  if (mode === 'year') return `${r.from.slice(0, 4)} yılbaşından ${dm(r.to)}'e`;
  return `${dm(r.from)} – ${dm(r.to)}`;
}
const MODE_TEXT = {
  day: { cur: 'Bugün', prev: 'dün', yoy: 'geçen yıl aynı gün', prevCmp: 'düne göre', yoyCmp: 'geçen yılın aynı gününe göre', win: 'Son 30 gün' },
  week: { cur: 'Bu hafta', prev: 'geçen haftanın aynı günleri', yoy: 'geçen yıl aynı hafta', prevCmp: 'geçen haftaya göre', yoyCmp: 'geçen yılın aynı haftasına göre', win: 'Son 12 hafta' },
  month: { cur: 'Bu ay', prev: 'geçen ayın aynı günleri', yoy: 'geçen yıl aynı dönem', prevCmp: 'geçen aya göre', yoyCmp: 'geçen yılın aynı dönemine göre', win: 'Son 12 ay' },
  year: { cur: 'Yılbaşından bugüne', prev: 'geçen yıl aynı dönem', yoy: null, prevCmp: 'geçen yılın aynı dönemine göre', yoyCmp: null, win: 'Yıllar' },
};

function delta(a, b, { invert = false, label = '' } = {}) {
  const c = change(a, b);
  if (c == null || !Number.isFinite(c)) return `<span>${label}: karşılaştırma yok</span>`;
  const good = invert ? c < 0 : c > 0;
  const cls = Math.abs(c) < 0.005 ? 'flat' : good ? 'up' : 'down';
  const arrow = c > 0 ? '▲' : c < 0 ? '▼' : '■';
  return `<span><span class="delta ${cls}">${arrow} ${pctS(Math.abs(c))}</span> ${label}</span>`;
}
function deltaPp(a, b, label, { invert = false } = {}) {
  if (a == null || b == null) return `<span>${label}: karşılaştırma yok</span>`;
  const d = a - b;
  const cls = Math.abs(d) < 0.0005 ? 'flat' : (invert ? d < 0 : d > 0) ? 'up' : 'down';
  return `<span><span class="delta ${cls}">${d > 0 ? '▲' : d < 0 ? '▼' : '■'} ${(Math.abs(d) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} puan</span> ${label}</span>`;
}

// ---------- Grafikler ----------
const cssVar = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const SERIES = (i) => cssVar(`--s${i}`);
// Gider grupları her grafikte aynı rengi taşır (renk varlığa bağlıdır, sıraya değil).
const GROUP_COLOR = { nakliye: 1, depo: 2, gumruk: 3, pazarlama: 4, genel: 7, finansman: 5 };

function destroyCharts() { while (charts.length) charts.pop().destroy(); }

function makeChart(id, config) {
  const el = document.getElementById(id);
  if (!el || !window.Chart) return;
  charts.push(new window.Chart(el, config));
}

function baseOptions({ stacked = false, horizontal = false, fmt = money, legend = false } = {}) {
  const grid = cssVar('--grid'), muted = cssVar('--muted'), axis = cssVar('--axis');
  const valueAxis = {
    stacked, grid: { color: grid, drawTicks: false }, border: { display: false },
    ticks: { color: muted, padding: 6, callback: (v) => fmt(v), maxTicksLimit: 6 },
  };
  const catAxis = { stacked, grid: { display: false }, border: { color: axis }, ticks: { color: muted, maxRotation: 0, autoSkipPadding: 12 } };
  return {
    responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? 'y' : 'x',
    animation: { duration: 250 },
    interaction: { mode: horizontal ? 'nearest' : 'index', intersect: horizontal, axis: horizontal ? 'y' : 'x' },
    plugins: {
      legend: { display: legend },
      tooltip: {
        backgroundColor: cssVar('--surface'), titleColor: cssVar('--ink'), bodyColor: cssVar('--ink-2'),
        borderColor: cssVar('--axis'), borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true,
        callbacks: { label: (c) => ` ${c.dataset.label}: ${fmt(horizontal ? c.parsed.x : c.parsed.y)}` },
      },
    },
    scales: horizontal ? { x: valueAxis, y: { ...catAxis, ticks: { ...catAxis.ticks, autoSkip: false } } } : { x: catAxis, y: valueAxis },
  };
}

const bar = (label, data, color, extra = {}) => ({
  type: 'bar', label, data, backgroundColor: color, borderRadius: 4, borderSkipped: 'start',
  maxBarThickness: 32, borderColor: cssVar('--surface'), borderWidth: extra.stack ? { top: 2 } : 0, ...extra,
});
const line = (label, data, color, extra = {}) => ({
  type: 'line', label, data, borderColor: color, backgroundColor: color, borderWidth: 2, tension: 0.25,
  pointRadius: data.length > 40 ? 0 : 2.5, pointHoverRadius: 5, spanGaps: true, ...extra,
});

function legendHtml(items) {
  return `<div class="legend">${items.map(([label, color]) => `<span><i style="background:${color}"></i>${esc(label)}</span>`).join('')}</div>`;
}

// ---------- Ortak bileşenler ----------
function kpiCard(label, value, deltas = [], suffix = '') {
  return `<div class="card kpi"><div class="label">${label}</div><div class="value">${value}${suffix ? `<small>${suffix}</small>` : ''}</div><div class="deltas">${deltas.join('')}</div></div>`;
}
const section = (title, hint = '') => `<div class="section-title"><h2>${title}</h2>${hint ? `<p>${hint}</p>` : ''}</div>`;
const chartCard = (id, title, hint = '', cls = '', legend = '') => `<div class="card ${cls}"><h3>${title}</h3>${hint ? `<p class="hint">${hint}</p>` : '<p class="hint"></p>'}${legend}<div class="chart-box ${cls.includes('tall') ? 'tall' : ''}"><canvas id="${id}" role="img" aria-label="${esc(title)}"></canvas></div></div>`;

function table(headers, rows, { cls = '' } = {}) {
  return `<div class="table-wrap"><table class="${cls}"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
const chg = (a, b, invert) => {
  if (!a && !b) return '<span class="delta flat">–</span>';
  const c = change(a, b);
  if (c == null || !Number.isFinite(c)) return '<span class="delta flat">yeni</span>';
  const good = invert ? c < 0 : c > 0;
  return `<span class="delta ${Math.abs(c) < 0.005 ? 'flat' : good ? 'up' : 'down'}">${c > 0 ? '+' : c < 0 ? '−' : ''}${pctS(Math.abs(c))}</span>`;
};

function periodHint(r) {
  const t = MODE_TEXT[r.mode];
  return `${t.cur}: ${rangeLabel(r.periods.current, r.mode)} · karşılaştırma: ${t.prev}${t.yoy ? ` ve ${t.yoy}` : ''}`;
}
function kpiDeltas(r, key, opts = {}) {
  const k = r.kpis, t = MODE_TEXT[r.mode];
  const out = [delta(k.current[key], k.previous[key], { ...opts, label: t.prevCmp })];
  if (t.yoy) out.push(delta(k.current[key], k.yoy[key], { ...opts, label: t.yoyCmp }));
  return out;
}
function salesDeltas(r, key) {
  const s = r.sales, t = MODE_TEXT[r.mode];
  const out = [delta(s.current[key], s.previous[key], { label: t.prevCmp })];
  if (t.yoy) out.push(delta(s.current[key], s.yoy[key], { label: t.yoyCmp }));
  return out;
}

// ---------- CEO ----------
function viewCeo(r) {
  const k = r.kpis, h = r.health, labels = r.buckets.map((b) => bucketLabel(b.key, r.mode));
  const statusText = { good: 'Sağlıklı', warning: 'Dikkat gerektiriyor', critical: 'Riskli', unknown: 'Yetersiz veri' }[h.status];
  const partVal = (p) => ({
    growth: `${p.value >= 0 ? '+' : '−'}${pctS(Math.abs(p.value))} yıllık`,
    margin: pctS(p.value), profit: pctS(p.value),
    liquidity: `${p.value.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ay`,
    collection: `${pctS(p.value)} gecikmiş`,
    concentration: `en büyük ${pctS(p.value)}`,
  }[p.key]);
  const ICON = { good: '✓', warning: '!', critical: '✕', info: 'i' };

  const html = `
    ${section('Şirketin genel durumu', `${MODE_TEXT[r.mode].win} verisine göre · ${rangeLabel(r.periods.window, 'week')}`)}
    <div class="grid cols-2">
      <div class="card">
        <h3>Sağlık skoru</h3><p class="hint">6 göstergenin ağırlıklı ortalaması (0–100)</p>
        <div class="health">
          <div class="score"><div class="num">${h.score ?? '–'}</div><div class="status"><span class="dot ${h.status}"></span>${statusText}</div></div>
          <div class="meters">${h.parts.map((p) => `
            <div class="meter" title="Puan: ${Math.round(p.score)}/100 · ağırlık %${p.weight}">
              <span>${p.label}</span><div class="track"><div class="fill" style="width:${p.score}%"></div></div><span class="v">${partVal(p)}</span>
            </div>`).join('')}
          </div>
        </div>
      </div>
      <div class="card">
        <h3>Analist yorumları</h3><p class="hint">Verilerden otomatik çıkarılan önemli sinyaller</p>
        <ul class="insights">${r.insights.slice(0, 8).map((i) => `<li><span class="ico ${i.tone}" aria-hidden="true">${ICON[i.tone]}</span><span class="tone">${i.area}</span><span>${esc(i.text)}</span></li>`).join('') || '<li>Yorum için yeterli veri yok.</li>'}</ul>
      </div>
    </div>

    ${section(`${MODE_TEXT[r.mode].cur} performansı`, periodHint(r))}
    <div class="grid kpis">
      ${kpiCard('Net satış', money(k.current.netSales), kpiDeltas(r, 'netSales'))}
      ${kpiCard('Brüt kâr', money(k.current.gross), [...kpiDeltas(r, 'gross'), `<span>Brüt marj ${pctS(k.current.grossMargin)}</span>`])}
      ${kpiCard('Net kâr (vergi öncesi)', money(k.current.netProfit), [...kpiDeltas(r, 'netProfit'), `<span>Net marj ${pctS(k.current.netMargin)}</span>`])}
      ${kpiCard('Satılan miktar', num(r.sales.current.tons), salesDeltas(r, 'tons'), 'ton')}
      ${kpiCard('Nakit + banka', money(r.balance.cash), [`<span>${dmy(r.end)} itibarıyla</span>`, `<span>≈ ${r.ratios.runwayMonths != null ? r.ratios.runwayMonths.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : '–'} aylık gider karşılığı</span>`])}
      ${kpiCard('Açık alacak', money(r.aging.arTotals.total || r.balance.receivables), [`<span>Vadesi geçen: <b>${pctS(r.ratios.overdueRatio)}</b></span>`, `<span>Ort. tahsilat süresi: ${r.ratios.dso != null ? Math.round(r.ratios.dso) + ' gün' : '–'}</span>`])}
    </div>

    ${section(`${MODE_TEXT[r.mode].win} trendi`, 'Grafik üzerinde gezinerek dönem değerlerini görebilirsiniz')}
    <div class="grid cols-2">
      ${chartCard('c-rev', 'Net satış', 'Geçen yılın aynı dönemiyle', '', legendHtml([['Bu dönem', SERIES(1)], ['Geçen yıl', cssVar('--muted-series')]]))}
      ${chartCard('c-np', 'Brüt kâr ve net kâr', 'Net kâr vergi öncesidir; sıfırın altı zarar', '', legendHtml([['Brüt kâr', SERIES(1)], ['Net kâr', SERIES(3)]]))}
      ${chartCard('c-ton', 'Satılan miktar (ton)', 'Fiyat ve kur etkisinden bağımsız hacim')}
      ${chartCard('c-margin', 'Kârlılık oranları', '', '', legendHtml([['Brüt marj', SERIES(1)], ['Net marj', SERIES(2)]]))}
    </div>`;

  const after = () => {
    const s = r.series.pnl;
    makeChart('c-rev', { data: { labels, datasets: [bar('Bu dönem', s.map((p) => p.netSales), SERIES(1)), line('Geçen yıl', r.series.pnlYoy.map((p) => p.netSales), cssVar('--muted-series'), { borderDash: [5, 4], pointRadius: 0 })] }, options: baseOptions() });
    makeChart('c-np', { data: { labels, datasets: [bar('Brüt kâr', s.map((p) => p.gross), SERIES(1)), bar('Net kâr', s.map((p) => p.netProfit), SERIES(3))] }, options: baseOptions() });
    makeChart('c-ton', { data: { labels, datasets: [bar('Satılan miktar', r.series.tons, SERIES(1))] }, options: baseOptions({ fmt: (v) => `${num(v)} t` }) });
    makeChart('c-margin', { data: { labels, datasets: [line('Brüt marj', s.map((p) => p.grossMargin), SERIES(1)), line('Net marj', s.map((p) => p.netMargin), SERIES(2))] }, options: baseOptions({ fmt: (v) => pctS(v) }) });
  };
  return { html, after };
}

// ---------- Satış ----------
function viewSales(r) {
  const s = r.sales, labels = r.buckets.map((b) => bucketLabel(b.key, r.mode));
  const w = s.window, wp = s.windowPrev;
  const avgInv = (x) => (x.count ? x.total / x.count : null);
  const avgPrice = (x) => (x.tons ? x.total / x.tons : null);
  const maxCust = r.customers[0]?.net || 1;
  const top = r.customers.slice(0, 10);
  const products = r.products.slice(0, 12);

  const html = `
    ${section(`${MODE_TEXT[r.mode].win} satış özeti`, `${rangeLabel(r.periods.window, 'week')} · önceki eşit dönemle karşılaştırma`)}
    <div class="grid kpis">
      ${kpiCard('Net satış', money(w.total), [delta(w.total, wp.total, { label: 'önceki döneme göre' })])}
      ${kpiCard('Satılan miktar', num(w.tons), [delta(w.tons, wp.tons, { label: 'önceki döneme göre' })], 'ton')}
      ${kpiCard('Ortalama satış fiyatı', money(avgPrice(w)), [delta(avgPrice(w), avgPrice(wp), { label: 'önceki döneme göre' })], '/ ton')}
      ${kpiCard('Fatura sayısı', num(w.count), [delta(w.count, wp.count, { label: 'önceki döneme göre' })])}
      ${kpiCard('Ortalama fatura', money(avgInv(w)), [delta(avgInv(w), avgInv(wp), { label: 'önceki döneme göre' })])}
      ${kpiCard('Aktif müşteri', num(r.customers.filter((c) => c.net > 0).length), [`<span>${r.newCustomers.length} yeni · ${r.lostCustomers.length} kayıp</span>`, `<span>İlk 5 müşteri payı ${pctS(r.top5Share)}</span>`])}
    </div>

    <div class="grid cols-2" style="margin-top:14px">
      ${chartCard('c-cust', 'En büyük 10 müşteri', 'Bu dönem ve önceki dönem net satış', 'tall', legendHtml([['Bu dönem', SERIES(1)], ['Önceki dönem', cssVar('--muted-series')]]))}
      ${chartCard('c-prod', 'Ürün bazında satış', 'Net satış tutarı', 'tall', legendHtml([['Bu dönem', SERIES(1)], ['Önceki dönem', cssVar('--muted-series')]]))}
      ${chartCard('c-price', 'Ton başına ortalama satış fiyatı', 'En çok satan 4 ürün', '', legendHtml(r.series.priceTrend.map((p, i) => [p.name, SERIES(i + 1)])))}
      ${chartCard('c-active', 'Alım yapan müşteri sayısı', 'Her dönemde en az bir faturası olan müşteriler')}
    </div>

    ${section('Müşteriler', 'Değişim: önceki eşit döneme göre')}
    <div class="card">${table(['Müşteri', 'Net satış', 'Pay', 'Değişim', 'Ton', 'Fatura', 'Son alım'], r.customers.map((c) => `
      <tr><td class="name" title="${esc(c.name)}">${esc(c.name)}</td><td><span class="bar-cell" style="width:${Math.max(2, (c.net / maxCust) * 60)}px"></span>${moneyFull(c.net)}</td><td>${pctS(c.share)}</td><td>${chg(c.net, c.prev)}</td><td>${num(c.tons)}</td><td>${num(c.count)}</td><td>${c.last ? dm(c.last) : '–'}</td></tr>`))}</div>

    <div class="grid cols-2" style="margin-top:14px">
      <div class="card"><h3>Ürün performansı</h3><p class="hint">Tahmini marj: dönem içi ortalama alış maliyetine göre</p>${table(['Ürün', 'Net satış', 'Ton', 'Fiyat / ton', 'Tah. marj', 'Değişim'], r.products.map((p) => `
        <tr><td class="name">${esc(p.name)}</td><td>${money(p.net)}</td><td>${num(p.tons)}</td><td>${money(p.pricePerTon)}</td><td>${pctS(p.estMargin)}</td><td>${chg(p.net, p.prevNet)}</td></tr>`))}</div>
      <div class="card"><h3>Satış temsilcileri</h3><p class="hint">Faturadaki satış temsilcisi koduna göre</p>${r.salespeople.length ? table(['Temsilci', 'Net satış', 'Ton', 'Fatura', 'Müşteri', 'Değişim'], r.salespeople.map((p) => `
        <tr><td>${esc(p.code)}</td><td>${money(p.net)}</td><td>${num(p.tons)}</td><td>${num(p.count)}</td><td>${num(p.customers)}</td><td>${chg(p.net, p.prev)}</td></tr>`)) : '<p class="note">Faturalarda satış temsilcisi bilgisi yok.</p>'}
        <h3 style="margin-top:18px">Kaybedilen müşteriler</h3><p class="hint">Önceki dönemde alım yapıp bu dönem yapmayanlar</p>
        ${r.lostCustomers.length ? table(['Müşteri', 'Önceki dönem', 'Son alım'], r.lostCustomers.map((c) => `<tr><td class="name">${esc(c.name)}</td><td>${money(c.net)}</td><td>${dm(c.last)}</td></tr>`)) : '<p class="note">Kayıp müşteri yok.</p>'}
        <h3 style="margin-top:18px">Yeni müşteriler</h3><p class="hint">İlk alımını bu dönemde yapanlar</p>
        ${r.newCustomers.length ? table(['Müşteri', 'Net satış', 'Ton'], r.newCustomers.map((c) => `<tr><td class="name">${esc(c.name)}</td><td>${money(c.net)}</td><td>${num(c.tons)}</td></tr>`)) : '<p class="note">Bu dönem yeni müşteri yok.</p>'}
      </div>
    </div>`;

  const after = () => {
    const hOpts = baseOptions({ horizontal: true });
    makeChart('c-cust', { data: { labels: top.map((c) => shorten(c.name)), datasets: [bar('Bu dönem', top.map((c) => c.net), SERIES(1)), bar('Önceki dönem', top.map((c) => c.prev), cssVar('--muted-series'))] }, options: hOpts });
    makeChart('c-prod', { data: { labels: products.map((p) => shorten(p.name)), datasets: [bar('Bu dönem', products.map((p) => p.net), SERIES(1)), bar('Önceki dönem', products.map((p) => p.prevNet), cssVar('--muted-series'))] }, options: baseOptions({ horizontal: true }) });
    makeChart('c-price', { data: { labels, datasets: r.series.priceTrend.map((p, i) => line(p.name, p.values, SERIES(i + 1))) }, options: baseOptions() });
    makeChart('c-active', { data: { labels, datasets: [bar('Müşteri sayısı', r.series.activeCustomers, SERIES(1))] }, options: baseOptions({ fmt: num }) });
  };
  return { html, after };
}
const shorten = (s) => (s && s.length > 26 ? `${s.slice(0, 25)}…` : s);

// ---------- Finans ----------
function viewFinance(r) {
  const labels = r.buckets.map((b) => bucketLabel(b.key, r.mode));
  const b = r.balance, q = r.ratios, k = r.kpis;
  const lastN = r.mode === 'year' ? r.buckets.length : 6;
  const cols = r.buckets.slice(-lastN).map((bk, i) => ({ label: bucketLabel(bk.key, r.mode), p: r.series.pnl[r.series.pnl.length - lastN + i] }));
  const rowDefs = [
    ['Brüt satışlar', (p) => p.revenue], ['Satış iadeleri (−)', (p) => -p.returns, 'sub'], ['Net satışlar', (p) => p.netSales, 'strong'],
    ['Satılan malın maliyeti (−)', (p) => -p.cogs, 'sub'], ['Brüt kâr', (p) => p.gross, 'strong'], ['Brüt marj', (p) => p.grossMargin, 'sub', 'pct'],
    ...OPEX_GROUPS.map((g) => [`${GROUP_LABELS[g]} (−)`, (p) => -p[g], 'sub']),
    ['Faaliyet kârı', (p) => p.operating, 'strong'],
    ['Diğer gelirler (+)', (p) => p.otherIncome, 'sub'], ['Diğer giderler (−)', (p) => -p.otherExpense, 'sub'], ['Finansman giderleri (−)', (p) => -p.finansman, 'sub'],
    ['Net kâr (vergi öncesi)', (p) => p.netProfit, 'total'], ['Net marj', (p) => p.netMargin, 'sub', 'pct'],
  ];
  const cell = (v, fmt) => (fmt === 'pct' ? pctS(v) : money(v));
  const pnlRows = rowDefs.map(([label, f, cls = '', fmt]) => `<tr class="${cls}"><td>${label}</td>${cols.map((c) => `<td>${cell(f(c.p), fmt)}</td>`).join('')}<td><b>${cell(f(k.window), fmt)}</b></td><td>${cell(f(k.windowPrev), fmt)}</td><td>${fmt === 'pct' ? '' : label.endsWith('(−)') ? chg(-f(k.window), -f(k.windowPrev), true) : chg(f(k.window), f(k.windowPrev))}</td></tr>`);
  const ap = r.aging.apTotals, ar = r.aging.arTotals;
  const agingLabels = ['Vadesi gelmemiş', '1–30 gün gecikmiş', '31–60 gün gecikmiş', '60+ gün gecikmiş'];
  const agingColors = [SERIES(1), cssVar('--warning'), cssVar('--serious'), cssVar('--critical')];
  const days = (v) => (v == null ? '–' : `${Math.round(v)}`);

  const html = `
    ${section('Bilanço özeti', `${dmy(r.end)} itibarıyla`)}
    <div class="grid kpis">
      ${kpiCard('Nakit + banka', money(b.cash), [`<span>${b.cashAccounts.length} hesap</span>`])}
      ${kpiCard('Ticari alacaklar', money(b.receivables), [`<span>Vadesi geçen ${pctS(q.overdueRatio)}</span>`])}
      ${kpiCard('Stok (ticari mal)', money(b.inventory), [`<span>Stokta kalma: ${days(q.dio)} gün</span>`])}
      ${kpiCard('Ticari borçlar', money(b.payables), [`<span>Ort. ödeme süresi: ${days(q.dpo)} gün</span>`])}
      ${kpiCard('Banka kredileri', money(b.loans), [])}
      ${kpiCard('İşletme sermayesi', money(b.workingCapital), ['<span>Nakit + alacak + stok − ticari borç</span>'])}
    </div>

    ${section('Nakit döngüsü', 'Son 90 günlük hareketlere göre')}
    <div class="grid kpis">
      ${kpiCard('Tahsilat süresi (DSO)', days(q.dso), ['<span>Müşteriler ortalama kaç günde ödüyor</span>'], 'gün')}
      ${kpiCard('Ödeme süresi (DPO)', days(q.dpo), ['<span>Tedarikçilere ortalama kaç günde ödeniyor</span>'], 'gün')}
      ${kpiCard('Stok süresi (DIO)', days(q.dio), ['<span>Mal ortalama kaç gün stokta</span>'], 'gün')}
      ${kpiCard('Nakit döngüsü (CCC)', days(q.ccc), ['<span>DSO + DIO − DPO: finanse edilmesi gereken gün</span>'], 'gün')}
      ${kpiCard('Aylık sabit gider + finansman', money(q.monthlyBurn), [`<span>Nakit ≈ ${q.runwayMonths != null ? q.runwayMonths.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : '–'} ay yeter</span>`])}
    </div>

    ${section('Gelir tablosu', `Son ${cols.length} dönem, ${MODE_TEXT[r.mode].win.toLowerCase()} toplamı ve önceki eşit dönem`)}
    <div class="card">${table(['Kalem', ...cols.map((c) => c.label), 'Dönem toplamı', 'Önceki dönem', 'Değişim'], pnlRows)}</div>

    <div class="grid cols-2" style="margin-top:14px">
      ${chartCard('c-opex', 'Faaliyet ve finansman giderleri', 'Dönem bazında kırılım', '', legendHtml([...OPEX_GROUPS, 'finansman'].map((g) => [GROUP_LABELS[g], SERIES(GROUP_COLOR[g])])))}
      ${chartCard('c-cash', 'Nakit + banka bakiyesi', 'Her dönem sonundaki toplam bakiye')}
      ${chartCard('c-flow', 'Tahsilatlar ve tedarikçi ödemeleri', 'Alıcı / satıcı hesap hareketlerine göre', '', legendHtml([['Tahsilat', SERIES(3)], ['Tedarikçi ödemesi', SERIES(2)]]))}
      <div class="card"><h3>Banka ve kasa hesapları</h3><p class="hint">${dmy(r.end)} bakiyeleri</p>
        ${table(['Hesap', 'No', 'Bakiye'], [...b.cashAccounts.map((a) => `<tr><td class="name">${esc(a.name)}</td><td>${esc(a.no)}</td><td>${moneyFull(a.balance)}</td></tr>`), `<tr class="total"><td>Toplam</td><td></td><td>${moneyFull(b.cash)}</td></tr>`])}
      </div>
    </div>

    ${section('Alacak ve borç yaşlandırma', r.aging.asOf ? `${dmy(r.aging.asOf)} itibarıyla (BC yaşlandırma raporu)` : '')}
    <div class="grid cols-2">
      ${chartCard('c-aging', 'Vade dağılımı', '', '', legendHtml(agingLabels.map((l, i) => [l, agingColors[i]])))}
      <div class="card"><h3>Vadesi geçmiş alacağı en yüksek müşteriler</h3><p class="hint">Tahsilat önceliği</p>
        ${table(['Müşteri', 'Toplam', 'Gecikmiş', '60+ gün'], r.aging.receivables.filter((x) => x.p1 + x.p2 + x.p3 > 0).sort((a, b2) => (b2.p1 + b2.p2 + b2.p3) - (a.p1 + a.p2 + a.p3)).slice(0, 10).map((x) => `<tr><td class="name">${esc(x.name)}</td><td>${money(x.total)}</td><td>${money(x.p1 + x.p2 + x.p3)}</td><td>${money(x.p3)}</td></tr>`))}
      </div>
    </div>`;

  const after = () => {
    const s = r.series.pnl;
    makeChart('c-opex', { data: { labels, datasets: [...OPEX_GROUPS, 'finansman'].map((g) => bar(GROUP_LABELS[g], s.map((p) => p[g]), SERIES(GROUP_COLOR[g]), { stack: 'x' })) }, options: baseOptions({ stacked: true }) });
    makeChart('c-cash', { data: { labels, datasets: [line('Nakit + banka', r.series.cash, SERIES(1), { fill: { target: 'origin', above: hexA(SERIES(1), 0.12) } })] }, options: baseOptions() });
    makeChart('c-flow', { data: { labels, datasets: [bar('Tahsilat', r.series.flows.map((f) => f.collections), SERIES(3)), bar('Tedarikçi ödemesi', r.series.flows.map((f) => f.vendorPayments), SERIES(2))] }, options: baseOptions() });
    const keys = ['current', 'p1', 'p2', 'p3'];
    makeChart('c-aging', { data: { labels: ['Alacaklar', 'Borçlar'], datasets: keys.map((key, i) => bar(agingLabels[i], [ar[key], ap[key]], agingColors[i], { stack: 'a', maxBarThickness: 44 })) }, options: baseOptions({ horizontal: true, stacked: true }) });
  };
  return { html, after };
}

function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// ---------- Satınalma & Lojistik ----------
function viewOps(r) {
  const labels = r.buckets.map((b) => bucketLabel(b.key, r.mode));
  const pu = r.purchasing, k = r.kpis;
  const s = r.series.pnl;
  const perTon = (x, tons) => (tons ? x / tons : null);
  const logiW = k.window.logistics, logiP = k.windowPrev.logistics;

  const html = `
    ${section(`${MODE_TEXT[r.mode].win} satınalma ve lojistik`, `${rangeLabel(r.periods.window, 'week')} · önceki eşit dönemle karşılaştırma`)}
    <div class="grid kpis">
      ${kpiCard('Satınalma tutarı', money(pu.total), [delta(pu.total, pu.prevTotal, { label: 'önceki döneme göre' })])}
      ${kpiCard('Alınan miktar', num(pu.tons), [], 'ton')}
      ${kpiCard('Ortalama alış fiyatı', money(perTon(pu.total, pu.tons)), [], '/ ton')}
      ${kpiCard('Lojistik giderleri', money(logiW), [delta(logiW, logiP, { label: 'önceki döneme göre', invert: true }), '<span>Nakliye + depo + gümrük</span>'])}
      ${kpiCard('Lojistik / net satış', pctS(k.window.logisticsRatio, 2), [deltaPp(k.window.logisticsRatio, k.windowPrev.logisticsRatio, 'önceki döneme göre', { invert: true })])}
      ${kpiCard('Satılan ton başına lojistik', money(perTon(logiW, r.sales.window.tons)), [delta(perTon(logiW, r.sales.window.tons), perTon(logiP, r.sales.windowPrev.tons), { label: 'önceki döneme göre', invert: true })], '/ ton')}
    </div>

    <div class="grid cols-2" style="margin-top:14px">
      ${chartCard('c-purch', 'Satınalma tutarı', 'Satınalma faturaları (KDV hariç)')}
      ${chartCard('c-logi', 'Lojistik giderleri', 'Nakliye, depo ve gümrük kırılımı', '', legendHtml(LOGISTICS_GROUPS.map((g) => [GROUP_LABELS[g], SERIES(GROUP_COLOR[g])])))}
      ${chartCard('c-logi-r', 'Lojistik giderlerinin satışlara oranı', 'Düşük olması iyi')}
      <div class="card"><h3>Tedarikçiler</h3><p class="hint">Satınalma tutarına göre</p>
        ${table(['Tedarikçi', 'Tutar', 'Pay', 'Ton', 'Değişim'], pu.vendors.map((v) => `<tr><td class="name">${esc(v.name)}</td><td>${money(v.net)}</td><td>${pctS(v.share)}</td><td>${num(v.tons)}</td><td>${chg(v.net, v.prev)}</td></tr>`))}
      </div>
    </div>`;

  const after = () => {
    makeChart('c-purch', { data: { labels, datasets: [bar('Satınalma', r.series.purchases, SERIES(1))] }, options: baseOptions() });
    makeChart('c-logi', { data: { labels, datasets: LOGISTICS_GROUPS.map((g) => bar(GROUP_LABELS[g], s.map((p) => p[g]), SERIES(GROUP_COLOR[g]), { stack: 'l' })) }, options: baseOptions({ stacked: true }) });
    makeChart('c-logi-r', { data: { labels, datasets: [line('Lojistik / satış', s.map((p) => p.logisticsRatio), SERIES(1))] }, options: baseOptions({ fmt: (v) => pctS(v) }) });
  };
  return { html, after };
}

// ---------- Veri & Ayarlar ----------
function viewData(r, status) {
  const m = r.meta;
  const ds = state.dataset;
  const groups = {};
  for (const a of ds.accounts) (groups[a.group] ||= []).push(a);
  const html = `
    ${section('Veri kaynağı')}
    <div class="grid cols-2">
      <div class="card">
        <h3>${{ bc: 'Business Central (API)', excel: 'Business Central (Excel dışa aktarımı)', demo: 'Demo veri' }[m.source] || m.source}</h3>
        <p class="hint">Son güncelleme: ${new Date(m.syncedAt).toLocaleString('tr-TR')}</p>
        ${table(['Kayıt', 'Adet'], [
          ['Genel muhasebe (günlük özet)', ds.gl.length], ['Satış belgeleri', ds.sales.length], ['Satınalma belgeleri', ds.purchases.length],
          ['Müşteriler', ds.customers.length], ['Tedarikçiler', ds.vendors.length], ['Stok kartları', ds.items.length], ['Hesaplar', ds.accounts.length],
        ].map(([a, b]) => `<tr><td>${a}</td><td>${num(b)}</td></tr>`))}
        ${STATIC ? '<p class="note" style="margin-top:12px">Bu, anlık görüntüdür; canlı güncelleme için sunucu sürümünü kullanın.</p>' : `<p style="margin-top:12px"><button class="btn primary" id="sync-btn">Şimdi güncelle</button> <span id="sync-msg" class="hint"></span></p>`}
        ${status?.lastError ? `<p class="error" style="padding:8px;text-align:left">Son hata: ${esc(status.lastError.message)}</p>` : ''}
      </div>
      <div class="card">
        <h3>Uyarılar</h3>
        ${m.warnings?.length ? `<ul class="warn-list">${m.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '<p class="note">Uyarı yok.</p>'}
        <h3 style="margin-top:16px">Hesaplama notları</h3>
        <ul class="warn-list">
          <li>Kâr/zarar rakamları genel muhasebe kayıtlarından (TL) hesaplanır; USD görünümü her kaydı kendi tarihindeki kurla çevirir.</li>
          <li>Müşteri/ürün kırılımları satış faturalarından, iadeler düşülerek hesaplanır.</li>
          <li>Tonaj, ölçü birimi TON/KG olan satırlardan hesaplanır.</li>
          <li>Hesapların gruplara eşlemesi <code>config/hesap-plani.json</code> dosyasından yapılır; aşağıdaki listeyi kontrol edip düzeltme isteyebilirsiniz.</li>
        </ul>
      </div>
    </div>
    ${section('Hesap planı eşlemesi', 'Hangi hesap hangi analiz grubunda sayılıyor')}
    <div class="card">${table(['Hesap', 'Ad', 'Grup'], ds.accounts.filter((a) => a.group !== 'other').sort((a, b) => a.no.localeCompare(b.no)).map((a) => `<tr><td>${esc(a.no)}</td><td style="text-align:left">${esc(a.name)}</td><td>${esc(GROUP_LABELS[a.group] || a.group)}</td></tr>`))}
      <p class="hint" style="margin-top:10px">${(groups.other || []).length} hesap “diğer” grubunda (bilanço/KDV vb.; analizlere dahil edilmez).</p>
    </div>`;
  const after = () => {
    document.getElementById('sync-btn')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      document.getElementById('sync-msg').textContent = 'Business Central’dan veriler çekiliyor…';
      try {
        const res = await fetch('api/sync', { method: 'POST' });
        if (!res.ok) throw new Error((await res.json()).error);
        await load();
      } catch (err) {
        document.getElementById('sync-msg').textContent = `Hata: ${err.message}`;
        e.target.disabled = false;
      }
    });
  };
  return { html, after };
}

// ---------- Uygulama ----------
const VIEWS = { ceo: viewCeo, sales: viewSales, finance: viewFinance, ops: viewOps, data: viewData };
let lastStatus = null;

function render() {
  const main = document.getElementById('view');
  destroyCharts();
  if (!state.dataset) return;
  state.result = analyze(state.dataset, { mode: state.mode, end: state.end, currency: state.currency });
  const r = state.result;
  if (!VIEWS[state.tab]) state.tab = 'ceo';
  const { html, after } = VIEWS[state.tab](r, lastStatus);
  main.innerHTML = html;
  after();
  syncControls();
}

function syncControls() {
  for (const [id, v] of [['mode', state.mode], ['currency', state.result?.currency || state.currency]]) {
    document.querySelectorAll(`#${id} button`).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === v)));
  }
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === state.tab)));
  const m = state.dataset?.meta;
  if (m) {
    document.getElementById('company').textContent = m.company;
    document.getElementById('source-line').innerHTML = `${m.source === 'demo' ? '<span class="badge demo">DEMO VERİ</span>' : '<span class="badge">Business Central</span>'} · Güncelleme: ${new Date(m.syncedAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}`;
  }
  const usdBtn = document.querySelector('#currency button[data-v="USD"]');
  if (usdBtn && state.result && state.currency === 'USD' && state.result.currency !== 'USD') usdBtn.title = 'Kur verisi olmadığı için USD görünümü kullanılamıyor';
}

async function load() {
  const main = document.getElementById('view');
  try {
    if (STATIC) {
      state.dataset = window.__BUTEO_DATASET__;
    } else {
      const res = await fetch('api/dataset');
      if (!res.ok) throw new Error(`Veri alınamadı (${res.status})`);
      state.dataset = await res.json();
      lastStatus = await fetch('api/status').then((x) => x.json()).catch(() => null);
    }
    // Varsayılan bitiş bugündür; veri bir haftadan eskiyse (ör. anlık görüntü) son veri tarihi kullanılır.
    const lastData = state.dataset.sales.reduce((m, s) => (s.date > m ? s.date : m), '');
    const today = todayIso();
    const stale = lastData && (Date.parse(today) - Date.parse(lastData)) / 864e5 > 7;
    state.end = document.getElementById('end').value || (stale ? lastData : today);
    document.getElementById('end').value = state.end;
    render();
  } catch (err) {
    main.innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
}

function bindSeg(id, key, persist = true) {
  document.getElementById(id).addEventListener('click', (e) => {
    const v = e.target.closest('button')?.dataset.v;
    if (!v) return;
    state[key] = v;
    if (persist) save(key, v);
    render();
  });
}

bindSeg('mode', 'mode');
bindSeg('currency', 'currency');
document.getElementById('tabs').addEventListener('click', (e) => {
  const t = e.target.closest('button')?.dataset.tab;
  if (!t) return;
  state.tab = t;
  save('tab', t);
  history.replaceState(null, '', `#${t}`);
  render();
});
document.getElementById('end').addEventListener('change', (e) => { if (e.target.value) { state.end = e.target.value; render(); } });
document.getElementById('theme').addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  save('theme', root.dataset.theme);
  render();
});
const theme = saved('theme', '');
if (theme) document.documentElement.dataset.theme = theme;
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render());

load();
