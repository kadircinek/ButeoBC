// Gerçekçi ama tamamen kurgusal bir petrokimya ticaret şirketi verisi üretir.
// Çıktı, BC senkronizasyonuyla birebir aynı veri modelindedir.
import { makeClassifier, loadAccountConfig } from '../classify.js';

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ACCOUNTS = [
  ['100.01', 'Merkez Kasa'],
  ['102.01', 'Banka 1 - TL Vadesiz'],
  ['102.02', 'Banka 1 - USD Vadesiz'],
  ['102.03', 'Banka 2 - TL Vadesiz'],
  ['120.01', 'Yurtiçi Alıcılar'],
  ['120.02', 'Yurtdışı Alıcılar'],
  ['153.01', 'Ticari Mallar'],
  ['191.01', 'İndirilecek KDV'],
  ['300.01', 'Banka Kredileri'],
  ['320.01', 'Yurtiçi Satıcılar'],
  ['320.02', 'Yurtdışı Satıcılar'],
  ['391.01', 'Hesaplanan KDV'],
  ['500.01', 'Sermaye'],
  ['600.01', 'Yurtiçi Satışlar'],
  ['601.01', 'Yurtdışı Satışlar'],
  ['610.01', 'Satıştan İadeler'],
  ['621.01', 'Satılan Ticari Mallar Maliyeti'],
  ['646.01', 'Kambiyo Karları'],
  ['656.01', 'Kambiyo Zararları'],
  ['760.01', 'Nakliye ve Navlun Giderleri'],
  ['760.02', 'Depolama ve Ardiye Giderleri'],
  ['760.03', 'Gümrük ve Müşavirlik Giderleri'],
  ['760.09', 'Diğer Pazarlama Satış Giderleri'],
  ['770.01', 'Personel Giderleri'],
  ['770.02', 'Kira Giderleri'],
  ['770.03', 'Ofis ve Genel Giderler'],
  ['770.04', 'Danışmanlık ve Muhasebe Giderleri'],
  ['780.01', 'Banka Faiz ve Komisyon Giderleri'],
];

const PRODUCTS = [
  ['PP-HOMO', 'PP Homopolimer', 'PP', 1150],
  ['PP-RKOP', 'PP Random Kopolimer', 'PP', 1260],
  ['HDPE-FLM', 'HDPE Film', 'PE', 1180],
  ['HDPE-ENJ', 'HDPE Enjeksiyon', 'PE', 1120],
  ['LDPE-FLM', 'LDPE Film', 'PE', 1320],
  ['LLDPE-C4', 'LLDPE C4 Film', 'PE', 1100],
  ['PVC-K67', 'PVC K67', 'PVC', 850],
  ['PET-SSE', 'PET Şişe Granülü', 'PET', 1010],
  ['GPPS', 'GPPS Kristal', 'PS', 1400],
  ['ABS-GEN', 'ABS Genel Amaçlı', 'ABS', 1720],
];

const CUSTOMER_NAMES = [
  ['Anadolu Plastik A.Ş.', 'Konya'], ['Ege Ambalaj San. Ltd.', 'İzmir'], ['Marmara Film Sanayi', 'Bursa'],
  ['Kuzey Boru Profil A.Ş.', 'Kocaeli'], ['Toros Enjeksiyon Ltd.', 'Mersin'], ['Başkent Poşet San.', 'Ankara'],
  ['Karadeniz Kalıp A.Ş.', 'Samsun'], ['Trakya Tekstil Plastik', 'Tekirdağ'], ['Çukurova Ambalaj', 'Adana'],
  ['Kapadokya Plastik', 'Kayseri'], ['Gediz Film Ltd.', 'Manisa'], ['Sakarya Oto Plastik', 'Sakarya'],
  ['Yıldız Pet Şişe A.Ş.', 'İstanbul'], ['Mavi Hortum San.', 'Gaziantep'], ['Özlem Ev Gereçleri', 'İstanbul'],
  ['Atlas Kablo Plastik', 'Kocaeli'], ['Deniz Ambalaj Ltd.', 'İzmir'], ['Aydın Tarım Film', 'Antalya'],
  ['Birlik Boru A.Ş.', 'Ankara'], ['Nova Oyuncak San.', 'İstanbul'], ['Ekin Çuval Ltd.', 'Şanlıurfa'],
  ['Pınar Kapak San.', 'Denizli'], ['Uludağ Enjeksiyon', 'Bursa'], ['Akdeniz Sera Film', 'Antalya'],
  ['Kent Mobilya Plastik', 'Kayseri'], ['Balkan Trading EOOD', 'Sofya', true], ['Caspian Polymers LLC', 'Bakü', true],
  ['Tiflis Pack Ltd.', 'Tiflis', true], ['Vardar Plast DOO', 'Üsküp', true], ['Güney Ambalaj', 'Hatay'],
];

const VENDORS = [
  ['Gulf Polymer Trading FZE', 'BAE'], ['Nordic Resin GmbH', 'Almanya'], ['Aegean Petrochem SA', 'Yunanistan'],
  ['Caspian Chemical JSC', 'Azerbaycan'], ['Asia Resin Pte Ltd', 'Singapur'], ['Yerli Polimer Dağıtım A.Ş.', 'Türkiye'],
];

const SALESPEOPLE = ['EK', 'MD', 'SA'];

export function generateDemo({ start = '2024-01-01', end = new Date().toISOString().slice(0, 10), seed = 42 } = {}) {
  const rnd = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const between = (a, b) => a + rnd() * (b - a);
  const classify = makeClassifier();
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const addDays = (d, n) => iso(Date.parse(`${d}T00:00:00Z`) + n * 864e5);
  const yearsFromStart = (ms) => (ms - startMs) / (365.25 * 864e5);

  // USD/TRY: yıllık ~%18 değer kaybı + küçük dalgalanma
  const usdTry = (ms) => 29.6 * Math.pow(1.18, yearsFromStart(ms)) * (1 + 0.01 * Math.sin(ms / 2.6e9));
  const inflation = (ms) => Math.pow(1.38, yearsFromStart(ms)); // TL giderler için

  const gl = new Map();
  const post = (d, a, dr, cr = 0) => {
    const key = `${d}|${a}`;
    const row = gl.get(key) || { d, a, dr: 0, cr: 0 };
    row.dr += dr; row.cr += cr;
    gl.set(key, row);
  };
  const journal = (d, lines) => lines.forEach(([a, amt]) => (amt >= 0 ? post(d, a, amt) : post(d, a, 0, -amt)));

  // Açılış bakiyesi
  const opening = addDays(start, -1);
  journal(opening, [['102.01', 9_500_000], ['102.02', 215_000_000], ['100.01', 150_000], ['153.01', 18_000_000], ['300.01', -110_000_000], ['500.01', -132_650_000]]);

  const customers = CUSTOMER_NAMES.map(([name, city, foreign], i) => ({
    no: `M${String(i + 1).padStart(4, '0')}`, name, city, country: foreign ? 'Yurtdışı' : 'Türkiye', foreign: !!foreign,
    sp: SALESPEOPLE[i % 3],
    weight: Math.pow(0.86, i) * between(0.7, 1.3),
    startMs: i < 18 ? startMs : startMs + between(0.1, 0.95) * (endMs - startMs),
    churnMs: i === 6 || i === 14 ? startMs + between(0.45, 0.7) * (endMs - startMs) : Infinity,
    payDelay: i % 7 === 3 ? between(20, 55) : between(-3, 12),
    dueDays: pick([30, 45, 60]),
    products: [...PRODUCTS].sort(() => rnd() - 0.5).slice(0, 2 + Math.floor(rnd() * 3)).map((p) => p[0]),
  }));
  const vendors = VENDORS.map(([name, country], i) => ({ no: `T${String(i + 1).padStart(4, '0')}`, name, country, city: '' }));
  const items = PRODUCTS.map(([no, name, category]) => ({ no, name, category, uom: 'TON' }));

  // Ürün fiyatları: aylık rastgele yürüyüş (USD/ton)
  const priceIdx = new Map(PRODUCTS.map((p) => [p[0], 1]));
  const monthPrices = new Map();
  const priceFor = (itemNo, d) => {
    const m = d.slice(0, 7);
    if (!monthPrices.has(m)) {
      for (const [no] of PRODUCTS) priceIdx.set(no, Math.min(1.25, Math.max(0.8, priceIdx.get(no) * (1 + between(-0.035, 0.035)))));
      monthPrices.set(m, new Map(PRODUCTS.map(([no, , , base]) => [no, base * priceIdx.get(no)])));
    }
    return monthPrices.get(m).get(itemNo);
  };

  const sales = [];
  const purchases = [];
  const stock = new Map(PRODUCTS.map((p) => [p[0], 120])); // ton
  const today = end;
  let invNo = 1, crNo = 1, pNo = 1;

  for (let ms = startMs; ms <= endMs; ms += 864e5) {
    const d = iso(ms);
    const dow = new Date(ms).getUTCDay();
    const fx = usdTry(ms);
    const infl = inflation(ms);
    if (dow === 0) continue;

    // ---- Satışlar ----
    if (dow !== 6) {
      const month = new Date(ms).getUTCMonth();
      const season = [0.85, 0.9, 1.05, 1.1, 1.1, 1.0, 0.95, 0.7, 1.05, 1.15, 1.1, 0.95][month];
      const growth = 1 + 0.22 * yearsFromStart(ms);
      const lambda = 2.6 * season * growth;
      const count = poisson(lambda, rnd);
      const active = customers.filter((c) => c.startMs <= ms && c.churnMs > ms);
      const totalW = active.reduce((s, c) => s + c.weight, 0);
      for (let k = 0; k < count; k++) {
        let r = rnd() * totalW; let cust = active[0];
        for (const c of active) { r -= c.weight; if (r <= 0) { cust = c; break; } }
        const usd = cust.foreign || rnd() < 0.65;
        const lines = [];
        const nLines = rnd() < 0.3 ? 2 : 1;
        for (let l = 0; l < nLines; l++) {
          const item = pick(cust.products);
          const qty = 25 * (1 + Math.floor(rnd() * (cust.weight > 0.5 ? 3 : 1.6)));
          const usdPrice = priceFor(item, d) * between(1.02, 1.085);
          const unitCostUsd = priceFor(item, d) * between(0.935, 0.965);
          stock.set(item, stock.get(item) - qty);
          lines.push({ item, desc: items.find((x) => x.no === item).name, kind: 'Item', qty, uom: 'TON', net: round(qty * usdPrice * fx), costUsd: qty * unitCostUsd });
        }
        const net = lines.reduce((s, l) => s + l.net, 0);
        const vat = cust.foreign ? 0 : round(net * 0.2);
        const gross = net + vat;
        const due = addDays(d, cust.dueDays);
        const payDate = addDays(due, Math.round(cust.payDelay + between(-5, 10)));
        const paid = payDate <= today;
        const no = `SF${String(invNo++).padStart(6, '0')}`;
        sales.push({
          type: 'invoice', no, date: d, due, party: cust.no, partyName: cust.name, sp: cust.sp,
          cur: usd ? 'USD' : '', fx: usd ? fx : 1, net, gross, remaining: paid ? 0 : gross, status: paid ? 'Paid' : 'Open',
          lines: lines.map(({ costUsd, ...l }) => l),
        });
        const recv = cust.foreign ? '120.02' : '120.01';
        journal(d, [[recv, gross], [cust.foreign ? '601.01' : '600.01', -net], ['391.01', -vat]]);
        const cogs = round(lines.reduce((s, l) => s + l.costUsd, 0) * fx);
        journal(d, [['621.01', cogs], ['153.01', -cogs]]);
        // Yurtiçi teslimat nakliyesi (TL/ton)
        const tons = lines.reduce((s, l) => s + l.qty, 0);
        if (!cust.foreign) {
          const freight = round(tons * 420 * infl * between(0.8, 1.2));
          journal(d, [['760.01', freight], ['102.01', -freight]]);
        }
        if (paid) {
          const payMs = Date.parse(`${payDate}T00:00:00Z`);
          const fxDiff = usd ? round(gross * (usdTry(payMs) / fx - 1)) : 0;
          journal(payDate, [[usd ? '102.02' : pick(['102.01', '102.03']), gross + fxDiff], [recv, -gross]]);
          if (fxDiff > 0) journal(payDate, [['646.01', -fxDiff]]);
          if (fxDiff < 0) journal(payDate, [['656.01', -fxDiff]]);
        }
        // Ara sıra iade
        if (rnd() < 0.015) {
          const crNet = round(net * between(0.05, 0.3));
          const crVat = cust.foreign ? 0 : round(crNet * 0.2);
          sales.push({
            type: 'credit', no: `SI${String(crNo++).padStart(5, '0')}`, date: addDays(d, 5), due: addDays(d, 5), party: cust.no,
            partyName: cust.name, sp: cust.sp, cur: usd ? 'USD' : '', fx, net: crNet, gross: crNet + crVat, remaining: 0, status: 'Paid',
            lines: [{ item: lines[0].item, desc: lines[0].desc, kind: 'Item', qty: round(lines[0].qty * crNet / net), uom: 'TON', net: crNet }],
          });
          journal(addDays(d, 5), [['610.01', crNet], ['391.01', crVat], [recv, -(crNet + crVat)]]);
        }
      }
    }

    // ---- İthalat alımları (haftada ~1-2 konteyner partisi) ----
    // Stok seviyesi hedefin altındaysa en düşük stoklu üründen parti alınır.
    const stockTarget = 1400 * (1 + 0.22 * yearsFromStart(ms));
    let lots = 0;
    while ((dow === 2 || dow === 4) && lots < 4 && [...stock.values()].reduce((a, b) => a + b, 0) < stockTarget) {
      lots++;
      const vend = pick(vendors);
      const item = [...stock.entries()].sort((a, b) => a[1] - b[1])[0][0];
      const qty = 25 * Math.round(between(6, 16));
      stock.set(item, stock.get(item) + qty);
      const unitUsd = priceFor(item, d) * between(0.92, 0.96);
      const net = round(qty * unitUsd * fx);
      const local = vend.country === 'Türkiye';
      const vat = local ? round(net * 0.2) : 0;
      const payDate = addDays(d, local ? 30 : pick([0, 15, 30]));
      purchases.push({
        type: 'invoice', no: `AF${String(pNo++).padStart(6, '0')}`, date: d, due: payDate, party: vend.no, partyName: vend.name, sp: '',
        cur: local ? '' : 'USD', fx: local ? 1 : fx, net, gross: net + vat, remaining: payDate <= today ? 0 : net + vat, status: payDate <= today ? 'Paid' : 'Open',
        lines: [{ item, desc: items.find((x) => x.no === item).name, kind: 'Item', qty, uom: 'TON', net }],
      });
      const pay = local ? '320.01' : '320.02';
      journal(d, [['153.01', net], ['191.01', vat], [pay, -(net + vat)]]);
      if (payDate <= today) journal(payDate, [[pay, net + vat], ['102.02', -(net + vat)]]);
      if (!local) {
        const customs = round(net * between(0.012, 0.02));
        const freight = round(qty * between(35, 55) * fx);
        journal(addDays(d, 3), [['760.03', customs], ['760.01', freight], ['102.01', -(customs + freight)]]);
      }
    }

    // ---- Aylık sabit giderler (ayın 1'i) ----
    if (d.endsWith('-01') || (d.slice(8) === '02' && new Date(ms - 864e5).getUTCDay() === 0)) {
      const monthly = [
        ['770.01', 1_150_000], ['770.02', 185_000], ['770.03', 95_000], ['770.04', 70_000],
        ['760.02', 240_000], ['760.09', 60_000],
      ];
      for (const [a, base] of monthly) {
        const amt = round(base * infl * between(0.92, 1.1));
        journal(d, [[a, amt], ['102.01', -amt]]);
      }
      const interest = round(110_000_000 * 0.03 * between(0.9, 1.1));
      journal(d, [['780.01', interest], ['102.03', -interest]]);
    }

    // Haftalık hazine dengelemesi: TL hesaplarda ~6 haftalık gider kalsın, fazlası USD hesabına.
    if (dow === 1) {
      const target = 6_000_000 * infl;
      for (const a of ['102.01', '102.03']) {
        let bal = 0;
        for (const r of gl.values()) if (r.a === a && r.d <= d) bal += r.dr - r.cr;
        const diff = round(bal - target);
        if (Math.abs(diff) > 500_000) journal(d, [['102.02', diff], [a, -diff]]);
      }
    }
  }

  const accounts = ACCOUNTS.map(([no, name]) => ({ no, name, ...classify(no, name) }));
  const glRows = [...gl.values()].map((r) => ({ ...r, dr: round(r.dr), cr: round(r.cr) })).sort((a, b) => a.d.localeCompare(b.d));

  return {
    meta: {
      source: 'demo', company: 'Buteo Petrokimya (DEMO VERİ)', lcy: 'TRY', syncedAt: new Date().toISOString(), fromDate: start,
      warnings: ['Bu veriler kurgusaldır. Gerçek veriler için Business Central bağlantısını kurun (docs/KURULUM.md).'],
      tonnageUnits: loadAccountConfig().tonnageUnits,
    },
    accounts,
    rates: { USD: weeklyRates(startMs, endMs, usdTry) },
    gl: glRows,
    customers: customers.map(({ no, name, city, country, sp }) => ({ no, name, city, country, sp })),
    vendors,
    items,
    sales,
    purchases,
    aging: {
      asOf: today,
      periodLength: '30D',
      receivables: agingFrom(sales, today, customers),
      payables: agingFrom(purchases, today, vendors),
    },
  };
}

function weeklyRates(startMs, endMs, fn) {
  const out = [];
  for (let ms = startMs; ms <= endMs; ms += 7 * 864e5) out.push([new Date(ms).toISOString().slice(0, 10), Math.round(fn(ms) * 10000) / 10000]);
  return out;
}

function agingFrom(docs, today, parties) {
  const map = new Map();
  const t = Date.parse(`${today}T00:00:00Z`);
  for (const doc of docs) {
    if (doc.type !== 'invoice' || !doc.remaining) continue;
    const p = parties.find((x) => x.no === doc.party);
    const row = map.get(doc.party) || { no: doc.party, name: p?.name || doc.partyName, total: 0, current: 0, p1: 0, p2: 0, p3: 0 };
    const overdue = (t - Date.parse(`${doc.due}T00:00:00Z`)) / 864e5;
    const key = overdue <= 0 ? 'current' : overdue <= 30 ? 'p1' : overdue <= 60 ? 'p2' : 'p3';
    row[key] += doc.remaining;
    row.total += doc.remaining;
    map.set(doc.party, row);
  }
  return [...map.values()];
}

function poisson(lambda, rnd) {
  const L = Math.exp(-lambda); let k = 0; let p = 1;
  do { k++; p *= rnd(); } while (p > L);
  return k - 1;
}

const round = (n) => Math.round(n * 100) / 100;
