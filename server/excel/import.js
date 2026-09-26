// BC'den "Excel'de aç" ile indirilen listeleri panel veri modeline dönüştürür.
// Sütunlar Türkçe veya İngilizce başlıklarla tanınır; eksik zorunlu sütunlar anlaşılır bir hatayla bildirilir.
import ExcelJS from 'exceljs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { makeClassifier, loadAccountConfig } from '../classify.js';

// Dosya adları (uzantısız, küçük harf). Ajan dosyaları bu adlarla kaydeder.
export const FILES = {
  accounts: { name: 'hesap-plani', required: true, label: 'Hesap Planı' },
  gl: { name: 'genel-muhasebe', required: true, label: 'Genel Muhasebe Kayıtları' },
  items: { name: 'kalem-hareketleri', required: false, label: 'Kalem Hareketleri (satış + alış)' },
  customers: { name: 'musteriler', required: false, label: 'Müşteriler' },
  vendors: { name: 'saticilar', required: false, label: 'Satıcılar' },
  itemCards: { name: 'stoklar', required: false, label: 'Stoklar' },
  custLedger: { name: 'musteri-hareketleri', required: false, label: 'Müşteri Hareketleri (açık)' },
  vendLedger: { name: 'satici-hareketleri', required: false, label: 'Satıcı Hareketleri (açık)' },
  rates: { name: 'doviz-kurlari', required: false, label: 'Döviz Kurları' },
};

// Sütun eş anlamlıları (BC Türkçe ve İngilizce arayüz başlıkları).
const COLS = {
  postingDate: ['nakil tarihi', 'kayıt tarihi', 'deftere nakil tarihi', 'posting date'],
  docNo: ['belge no', 'belge no.', 'document no', 'document no.'],
  docType: ['belge türü', 'document type'],
  glAccount: ['genel muhasebe hesap no', 'genel muhasebe hesabı no', 'g/l hesap no', 'hesap no', 'g/l account no', 'g/l account no.'],
  amount: ['tutar', 'amount'],
  debit: ['borç tutarı', 'borç', 'debit amount'],
  credit: ['alacak tutarı', 'alacak', 'credit amount'],
  no: ['no', 'no.', 'numara'],
  name: ['ad', 'adı', 'isim', 'name', 'açıklama', 'description'],
  accountType: ['hesap türü', 'hesap tipi', 'account type'],
  entryType: ['hareket türü', 'giriş türü', 'kayıt türü', 'entry type'],
  itemNo: ['madde no', 'kalem no', 'stok no', 'ürün no', 'item no', 'item no.'],
  description: ['açıklama', 'description'],
  sourceNo: ['kaynak no', 'source no', 'source no.'],
  quantity: ['miktar', 'quantity'],
  uom: ['ölçü birimi kodu', 'birim kodu', 'unit of measure code', 'temel ölçü birimi', 'base unit of measure'],
  salesAmount: ['satış tutarı (gerçek)', 'satış tutarı (fiili)', 'satış tutarı', 'sales amount (actual)'],
  costAmount: ['maliyet tutarı (gerçek)', 'maliyet tutarı (fiili)', 'maliyet tutarı', 'cost amount (actual)'],
  city: ['şehir', 'il', 'city'],
  country: ['ülke/bölge kodu', 'ülke kodu', 'country/region code'],
  salesperson: ['satış elemanı kodu', 'satış temsilcisi kodu', 'satışçı kodu', 'salesperson code'],
  category: ['madde kategorisi kodu', 'kalem kategorisi kodu', 'stok kategorisi kodu', 'item category code'],
  customerNo: ['müşteri no', 'müşteri no.', 'customer no', 'customer no.'],
  customerName: ['müşteri adı', 'customer name'],
  vendorNo: ['satıcı no', 'satıcı no.', 'vendor no', 'vendor no.'],
  vendorName: ['satıcı adı', 'vendor name'],
  dueDate: ['vade tarihi', 'son ödeme tarihi', 'due date'],
  remainingLcy: ['kalan tutar (upb)', 'kalan tutar (ypb)', 'kalan tutar (yerel para birimi)', 'kalan tutar (tl)', 'kalan tutar', 'remaining amt. (lcy)', 'remaining amount (lcy)', 'remaining amount'],
  startingDate: ['başlangıç tarihi', 'starting date'],
  currencyCode: ['para birimi kodu', 'döviz kodu', 'currency code'],
  exchangeAmount: ['döviz kuru tutarı', 'kur tutarı', 'exchange rate amount'],
  relationalAmount: ['ilgili döviz kuru tutarı', 'ilişkili kur tutarı', 'relational exch. rate amount', 'relational exch. rate amt'],
};

const norm = (s) => String(s ?? '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').replace(/[.]+$/, '').trim();

async function readSheet(path) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  // BC dışa aktarımında veriler ilk sayfadadır; başlık satırı ilk dolu satırdır.
  const ws = wb.worksheets[0];
  const rows = [];
  let headers = null;
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values.slice(1).map(cellValue);
    if (!headers) {
      if (values.filter((v) => typeof v === 'string' && v.trim()).length >= 2) headers = values.map(norm);
      return;
    }
    rows.push(values);
  });
  return { headers: headers || [], rows };
}

function cellValue(v) {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return v.result;
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return v.text;
  }
  return v;
}

function picker(file, headers, want, optional = []) {
  const idx = {};
  const missing = [];
  for (const key of [...want, ...optional]) {
    const aliases = COLS[key].map(norm);
    const i = headers.findIndex((h) => aliases.includes(h));
    if (i >= 0) idx[key] = i;
    else if (want.includes(key)) missing.push(key);
  }
  // Borç/alacak yoksa tek "tutar" sütunu yeterli (GL için).
  if (missing.length) {
    const err = new Error(`${file}: gerekli sütun(lar) bulunamadı: ${missing.map((k) => `${k} (${COLS[k].slice(0, 2).join(' / ')})`).join(', ')}.\n  Dosyadaki başlıklar: ${headers.filter(Boolean).join(' | ')}`);
    err.code = 'MISSING_COLUMNS';
    throw err;
  }
  return (row, key) => (idx[key] == null ? null : row[idx[key]]);
}

function toDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10); // Excel seri tarihi
  const m = String(v).trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/); // 25.09.2026
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const iso = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}

function toNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/\s|₺|TL|TRY/g, '');
  if (/,\d+$/.test(s) || /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56 / 1.234.567
  else s = s.replace(/,/g, ''); // 1,234.56
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const str = (v) => (v == null ? '' : String(v).trim());
const isSale = (t) => /satış|sale/i.test(str(t));
const isPurchase = (t) => /satınalma|satın alma|alış|purchase/i.test(str(t));

async function findFiles(dir) {
  const names = await readdir(dir);
  const found = {};
  for (const [key, spec] of Object.entries(FILES)) {
    const hit = names.find((n) => n.toLowerCase().replace(/\.(xlsx|xls)$/, '') === spec.name && /\.xlsx$/i.test(n));
    if (hit) found[key] = join(dir, hit);
  }
  return found;
}

export async function importExcelFolder(dir, { log = console.log, asOf = new Date().toISOString().slice(0, 10) } = {}) {
  const files = await findFiles(dir);
  const warnings = [];
  for (const [key, spec] of Object.entries(FILES)) {
    if (!files[key]) {
      if (spec.required) throw new Error(`Zorunlu dosya yok: ${spec.name}.xlsx (${spec.label}) → ${dir}`);
      warnings.push(`${spec.label} dosyası (${spec.name}.xlsx) yok; ilgili analizler eksik kalır.`);
    }
  }
  const load = async (key) => {
    if (!files[key]) return null;
    const sheet = await readSheet(files[key]);
    log(`  ${FILES[key].name}.xlsx: ${sheet.rows.length} satır`);
    return sheet;
  };

  const classify = makeClassifier();
  const acctCfg = loadAccountConfig();

  // Hesap planı
  const accSheet = await load('accounts');
  const pa = picker('hesap-plani.xlsx', accSheet.headers, ['no', 'name'], ['accountType']);
  const accounts = accSheet.rows
    .filter((r) => str(pa(r, 'no')) && !/başlık|heading|toplam|total|begin|end/i.test(str(pa(r, 'accountType'))))
    .map((r) => ({ no: str(pa(r, 'no')), name: str(pa(r, 'name')), ...classify(str(pa(r, 'no')), str(pa(r, 'name'))) }));

  // Genel muhasebe: gün + hesap bazında toplanır
  const glSheet = await load('gl');
  const pg = picker('genel-muhasebe.xlsx', glSheet.headers, ['postingDate', 'glAccount'], ['debit', 'credit', 'amount']);
  const glMap = new Map();
  let glSkipped = 0;
  for (const r of glSheet.rows) {
    const d = toDate(pg(r, 'postingDate'));
    const a = str(pg(r, 'glAccount'));
    if (!d || !a) { glSkipped++; continue; }
    let dr = toNum(pg(r, 'debit'));
    let cr = toNum(pg(r, 'credit'));
    if (!dr && !cr) { const amt = toNum(pg(r, 'amount')); if (amt >= 0) dr = amt; else cr = -amt; }
    const key = `${d}|${a}`;
    const row = glMap.get(key) || { d, a, dr: 0, cr: 0 };
    row.dr += dr; row.cr += cr;
    glMap.set(key, row);
  }
  if (glSkipped) warnings.push(`Genel muhasebe dosyasında tarihi veya hesabı okunamayan ${glSkipped} satır atlandı.`);
  const gl = [...glMap.values()].map((r) => ({ ...r, dr: round2(r.dr), cr: round2(r.cr) }));

  // Kartlar
  const cards = async (key, file) => {
    const s = await load(key);
    if (!s) return [];
    const p = picker(file, s.headers, ['no', 'name'], ['city', 'country', 'salesperson', 'category', 'uom']);
    return s.rows.filter((r) => str(p(r, 'no'))).map((r) => ({
      no: str(p(r, 'no')), name: str(p(r, 'name')), city: str(p(r, 'city')), country: str(p(r, 'country')),
      sp: str(p(r, 'salesperson')), category: str(p(r, 'category')), uom: str(p(r, 'uom')),
    }));
  };
  const customers = await cards('customers', 'musteriler.xlsx');
  const vendors = await cards('vendors', 'saticilar.xlsx');
  const items = await cards('itemCards', 'stoklar.xlsx');
  const custById = new Map(customers.map((c) => [c.no, c]));
  const vendById = new Map(vendors.map((v) => [v.no, v]));
  const itemById = new Map(items.map((i) => [i.no, i]));

  // Kalem hareketleri → satış / alış belgeleri (tutarlar yerel para biriminde, maliyet dahil)
  const sales = [], purchases = [];
  const ile = await load('items');
  if (ile) {
    const p = picker('kalem-hareketleri.xlsx', ile.headers, ['postingDate', 'entryType', 'docNo', 'itemNo', 'quantity'], ['sourceNo', 'description', 'salesAmount', 'costAmount', 'uom', 'docType']);
    const docs = new Map();
    for (const r of ile.rows) {
      const type = p(r, 'entryType');
      const sale = isSale(type), purch = isPurchase(type);
      if (!sale && !purch) continue;
      const date = toDate(p(r, 'postingDate'));
      if (!date) continue;
      const qty = toNum(p(r, 'quantity'));
      // Satışta miktar negatif (stoktan çıkış); iadede pozitif. Alışta tersi.
      const signedQty = sale ? -qty : qty;
      const net = sale ? toNum(p(r, 'salesAmount')) : toNum(p(r, 'costAmount'));
      const cost = sale ? -toNum(p(r, 'costAmount')) : 0;
      const party = str(p(r, 'sourceNo'));
      const docNo = str(p(r, 'docNo'));
      const credit = signedQty < 0 || net < 0;
      const key = `${sale ? 'S' : 'P'}|${docNo}|${credit ? 'C' : 'I'}`;
      const item = str(p(r, 'itemNo'));
      const doc = docs.get(key) || {
        sale, type: credit ? 'credit' : 'invoice', no: docNo, date, due: date, party,
        partyName: (sale ? custById : vendById).get(party)?.name || party,
        sp: sale ? custById.get(party)?.sp || '' : '', cur: '', fx: 1, net: 0, gross: 0, remaining: null, cost: 0, lines: [],
      };
      const sign = credit ? -1 : 1;
      doc.net += sign * net; doc.gross = doc.net; doc.cost += sign * cost;
      doc.lines.push({
        item, desc: str(p(r, 'description')) || itemById.get(item)?.name || item, kind: 'Item',
        qty: Math.abs(signedQty), uom: str(p(r, 'uom')) || itemById.get(item)?.uom || '', net: Math.abs(net), cost: Math.abs(cost),
      });
      docs.set(key, doc);
    }
    for (const d of docs.values()) {
      const { sale, ...rest } = d;
      rest.net = round2(Math.abs(rest.net)); rest.gross = rest.net; rest.cost = round2(Math.abs(rest.cost));
      (sale ? sales : purchases).push(rest);
    }
    warnings.push('Satış ve alış tutarları kalem hareketlerinden (KDV hariç, TL) alındı; KDV dahil tutarlar olmadığından tahsilat/ödeme süreleri yaklaşık hesaplanır.');
  }

  // Açık cari hareketlerden yaşlandırma
  const aging = async (key, file, noKey, nameKey, byId) => {
    const s = await load(key);
    if (!s) return [];
    const p = picker(file, s.headers, [noKey, 'dueDate', 'remainingLcy'], [nameKey]);
    const map = new Map();
    const t = Date.parse(`${asOf}T00:00:00Z`);
    for (const r of s.rows) {
      const no = str(p(r, noKey));
      const rem = toNum(p(r, 'remainingLcy'));
      if (!no || !rem) continue;
      const due = toDate(p(r, 'dueDate')) || asOf;
      const row = map.get(no) || { no, name: str(p(r, nameKey)) || byId.get(no)?.name || no, total: 0, current: 0, p1: 0, p2: 0, p3: 0 };
      const overdue = (t - Date.parse(`${due}T00:00:00Z`)) / 864e5;
      const bucket = overdue <= 0 ? 'current' : overdue <= 30 ? 'p1' : overdue <= 60 ? 'p2' : 'p3';
      const amt = key === 'vendLedger' ? -rem : rem; // satıcı kalanları BC'de negatiftir
      row[bucket] += amt; row.total += amt;
      map.set(no, row);
    }
    return [...map.values()].filter((r) => Math.abs(r.total) > 0.5);
  };
  const receivables = await aging('custLedger', 'musteri-hareketleri.xlsx', 'customerNo', 'customerName', custById);
  const payables = await aging('vendLedger', 'satici-hareketleri.xlsx', 'vendorNo', 'vendorName', vendById);

  // Döviz kurları (USD görünümü için)
  const rates = {};
  const rs = await load('rates');
  if (rs) {
    const p = picker('doviz-kurlari.xlsx', rs.headers, ['startingDate', 'currencyCode', 'exchangeAmount', 'relationalAmount']);
    for (const r of rs.rows) {
      const cur = str(p(r, 'currencyCode'));
      const d = toDate(p(r, 'startingDate'));
      const rate = toNum(p(r, 'relationalAmount')) / (toNum(p(r, 'exchangeAmount')) || 1);
      if (cur && d && rate) (rates[cur] ||= []).push([d, rate]);
    }
    for (const list of Object.values(rates)) list.sort((a, b) => a[0].localeCompare(b[0]));
  }

  const unmapped = accounts.filter((a) => a.group === 'other' && /^[67]/.test(a.no));
  if (unmapped.length) warnings.push(`Hiçbir gider/gelir grubuna düşmeyen ${unmapped.length} hesap var: ${unmapped.slice(0, 6).map((a) => `${a.no} ${a.name}`).join('; ')}${unmapped.length > 6 ? '…' : ''} (config/hesap-plani.json → overrides).`);

  return {
    meta: {
      source: 'excel', company: 'Buteo Petrokimya', lcy: 'TRY', syncedAt: new Date().toISOString(),
      fromDate: gl.reduce((m, r) => (r.d < m ? r.d : m), '9999'), warnings, tonnageUnits: acctCfg.tonnageUnits,
    },
    accounts, rates, gl, customers, vendors, items,
    sales: sales.sort((a, b) => a.date.localeCompare(b.date)),
    purchases: purchases.sort((a, b) => a.date.localeCompare(b.date)),
    aging: { asOf, periodLength: '30D', receivables, payables },
  };
}

const round2 = (n) => Math.round(n * 100) / 100;
