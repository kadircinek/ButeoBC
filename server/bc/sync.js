// BC'den verileri çekip panelin kullandığı ortak veri modeline dönüştürür.
import { config } from '../config.js';
import { getAll, resolveCompany } from './client.js';
import { makeClassifier, loadAccountConfig } from '../classify.js';

const day = (s) => (s || '').slice(0, 10);
const num = (v) => Number(v) || 0;

export async function syncFromBC(log = console.log) {
  const company = await resolveCompany();
  const cid = company.id;
  const from = config.syncFromDate;
  const warnings = [];

  // Opsiyonel uç noktalar: yetki/sürüm eksikse panelin geri kalanı yine çalışsın.
  const safe = async (label, fn) => {
    try {
      const rows = await fn();
      log(`  ${label}: ${rows.length} kayıt`);
      return rows;
    } catch (err) {
      warnings.push(`${label} alınamadı: ${err.message.split('\n')[0]}`);
      log(`  ${label}: HATA ${err.message}`);
      return [];
    }
  };

  log(`BC senkronizasyonu: ${company.name} (${from} sonrası)`);
  const [accounts, gl, openingGl, customers, vendors, items, rates, salesInv, salesCr, purchInv, purchCr, agedAR, agedAP] = await Promise.all([
    safe('Hesap planı', () => getAll(cid, 'accounts', { $select: 'number,displayName,category,subCategory,accountType' })),
    safe('Genel muhasebe kayıtları', () => getAll(cid, 'generalLedgerEntries', {
      $select: 'postingDate,accountNumber,debitAmount,creditAmount',
      $filter: `postingDate ge ${from}`,
    })),
    safe('Açılış bakiyeleri', () => getAll(cid, 'generalLedgerEntries', {
      $select: 'accountNumber,debitAmount,creditAmount',
      $filter: `postingDate lt ${from}`,
    })),
    safe('Müşteriler', () => getAll(cid, 'customers', { $select: 'number,displayName,city,country,salespersonCode' })),
    safe('Tedarikçiler', () => getAll(cid, 'vendors', { $select: 'number,displayName,city,country' })),
    safe('Stok kartları', () => getAll(cid, 'items', { $select: 'number,displayName,itemCategoryCode,baseUnitOfMeasureCode' })),
    safe('Döviz kurları', () => getAll(cid, 'currencyExchangeRates')),
    safe('Satış faturaları', () => getAll(cid, 'salesInvoices', { $filter: `invoiceDate ge ${from}`, $expand: 'salesInvoiceLines' })),
    safe('Satış iadeleri', () => getAll(cid, 'salesCreditMemos', { $filter: `creditMemoDate ge ${from}`, $expand: 'salesCreditMemoLines' })),
    safe('Satınalma faturaları', () => getAll(cid, 'purchaseInvoices', { $filter: `invoiceDate ge ${from}`, $expand: 'purchaseInvoiceLines' })),
    safe('Satınalma iadeleri', () => getAll(cid, 'purchaseCreditMemos', { $filter: `creditMemoDate ge ${from}`, $expand: 'purchaseCreditMemoLines' })),
    safe('Yaşlandırılmış alacaklar', () => getAll(cid, 'agedAccountsReceivables')),
    safe('Yaşlandırılmış borçlar', () => getAll(cid, 'agedAccountsPayables')),
  ]);

  const classify = makeClassifier();
  const acctCfg = loadAccountConfig();
  const toLcy = makeFx(rates);

  const doc = (type, d, partyNo, partyName, linesKey, dateKey) => {
    const cur = d.currencyCode || '';
    const date = day(d[dateKey] || d.postingDate);
    const fx = toLcy(cur, date);
    const status = d.status || '';
    return {
      type, no: d.number, date, due: day(d.dueDate), party: d[partyNo], partyName: d[partyName],
      sp: d.salesperson || d.salespersonCode || '', cur, fx,
      net: num(d.totalAmountExcludingTax) * fx,
      gross: num(d.totalAmountIncludingTax) * fx,
      remaining: d.remainingAmount != null ? num(d.remainingAmount) * fx : null,
      status,
      lines: (d[linesKey] || []).filter((l) => l.lineType !== 'Comment').map((l) => ({
        item: l.lineObjectNumber || '', desc: l.description || '', kind: l.lineType || '',
        qty: num(l.quantity), uom: l.unitOfMeasureCode || '',
        net: num(l.amountExcludingTax ?? l.netAmount) * fx,
      })),
    };
  };
  const posted = (d) => !['Draft', 'Canceled'].includes(d.status);

  const dataset = {
    meta: {
      source: 'bc', company: company.displayName || company.name, lcy: 'TRY',
      syncedAt: new Date().toISOString(), fromDate: from, warnings,
      tonnageUnits: acctCfg.tonnageUnits,
    },
    accounts: accounts.filter((a) => a.accountType !== 'Heading').map((a) => ({ no: a.number, name: a.displayName, ...classify(a.number, a.displayName) })),
    rates: ratesByCurrency(rates),
    gl: [...openingRows(openingGl, from), ...aggregateGl(gl)],
    customers: customers.map((c) => ({ no: c.number, name: c.displayName, city: c.city, country: c.country, sp: c.salespersonCode || '' })),
    vendors: vendors.map((v) => ({ no: v.number, name: v.displayName, city: v.city, country: v.country })),
    items: items.map((i) => ({ no: i.number, name: i.displayName, category: i.itemCategoryCode, uom: i.baseUnitOfMeasureCode })),
    sales: [
      ...salesInv.filter(posted).map((d) => doc('invoice', d, 'customerNumber', 'customerName', 'salesInvoiceLines', 'invoiceDate')),
      ...salesCr.filter(posted).map((d) => doc('credit', d, 'customerNumber', 'customerName', 'salesCreditMemoLines', 'creditMemoDate')),
    ],
    purchases: [
      ...purchInv.filter(posted).map((d) => doc('invoice', d, 'vendorNumber', 'vendorName', 'purchaseInvoiceLines', 'invoiceDate')),
      ...purchCr.filter(posted).map((d) => doc('credit', d, 'vendorNumber', 'vendorName', 'purchaseCreditMemoLines', 'creditMemoDate')),
    ],
    aging: {
      asOf: new Date().toISOString().slice(0, 10),
      periodLength: agedAR[0]?.agingPeriodLength || agedAP[0]?.agingPeriodLength || '30D',
      receivables: agedRows(agedAR, 'customerNumber'),
      payables: agedRows(agedAP, 'vendorNumber'),
    },
  };
  return dataset;
}

// Aynı gün + hesap için borç/alacak toplanır; veri boyutu ciddi şekilde küçülür.
function aggregateGl(entries) {
  const map = new Map();
  for (const e of entries) {
    const key = `${day(e.postingDate)}|${e.accountNumber}`;
    const row = map.get(key) || { d: day(e.postingDate), a: e.accountNumber, dr: 0, cr: 0 };
    row.dr += num(e.debitAmount);
    row.cr += num(e.creditAmount);
    map.set(key, row);
  }
  return [...map.values()].map((r) => ({ ...r, dr: round2(r.dr), cr: round2(r.cr) }));
}

// Senkron başlangıcından önceki bilanço hareketleri tek bir açılış satırına indirgenir
// (kasa/banka/alacak/borç bakiyeleri doğru çıksın diye). Gelir-gider hesapları gerekmez.
function openingRows(entries, from) {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const date = d.toISOString().slice(0, 10);
  return aggregateGl(entries.filter((e) => /^[1-5]/.test(e.accountNumber)).map((e) => ({ ...e, postingDate: date })));
}

function agedRows(rows, noKey) {
  return rows.filter((r) => r[noKey] && r[noKey] !== '').map((r) => ({
    no: r[noKey], name: r.name,
    total: num(r.balanceDue), current: num(r.currentAmount),
    p1: num(r.period1Amount), p2: num(r.period2Amount), p3: num(r.period3Amount),
  }));
}

function ratesByCurrency(rates) {
  const out = {};
  for (const r of rates) {
    (out[r.currencyCode] ||= []).push([day(r.startingDate), num(r.relationalExchangeRateAmount) / (num(r.exchangeRateAmount) || 1)]);
  }
  for (const list of Object.values(out)) list.sort((a, b) => a[0].localeCompare(b[0]));
  return out;
}

// BC kur tablosu: 1 birim döviz = relational / exchange TL (başlangıç tarihine göre en yakın geçmiş kur).
function makeFx(rates) {
  const byCur = new Map();
  for (const r of rates) {
    const list = byCur.get(r.currencyCode) || [];
    list.push({ date: day(r.startingDate), rate: num(r.relationalExchangeRateAmount) / (num(r.exchangeRateAmount) || 1) });
    byCur.set(r.currencyCode, list);
  }
  for (const list of byCur.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return (cur, date) => {
    if (!cur || cur === 'TRY' || cur === 'TL') return 1;
    const list = byCur.get(cur);
    if (!list?.length) return 1;
    let rate = list[0].rate;
    for (const r of list) { if (r.date <= date) rate = r.rate; else break; }
    return rate;
  };
}

const round2 = (n) => Math.round(n * 100) / 100;
