// BC bağlantı testi: npm run bc:check
// Token alınabiliyor mu, şirketler görünüyor mu, her tabloya erişim var mı ve hesaplar nasıl gruplanıyor?
import { config, bcConfigured } from '../server/config.js';
import { listCompanies, resolveCompany, getAll } from '../server/bc/client.js';
import { makeClassifier } from '../server/classify.js';

if (!bcConfigured()) {
  console.error('BC_CLIENT_ID ve BC_CLIENT_SECRET tanımlı değil (.env dosyasına bakın, docs/KURULUM.md).');
  process.exit(1);
}

const step = async (label, fn) => {
  try {
    const out = await fn();
    console.log(`✓ ${label}${out ? `: ${out}` : ''}`);
    return true;
  } catch (err) {
    console.log(`✗ ${label}: ${err.message.split('\n')[0]}`);
    return false;
  }
};

console.log(`Kiracı: ${config.bc.tenantId}  Ortam: ${config.bc.environment}\n`);
if (!(await step('Şirketler', async () => (await listCompanies()).map((c) => c.name).join(', ')))) process.exit(1);
const company = await resolveCompany();
console.log(`  → kullanılacak şirket: ${company.name}\n`);

const entities = [
  'accounts', 'generalLedgerEntries', 'customers', 'vendors', 'items', 'currencyExchangeRates',
  'salesInvoices', 'salesCreditMemos', 'purchaseInvoices', 'purchaseCreditMemos',
  'agedAccountsReceivables', 'agedAccountsPayables',
];
for (const e of entities) {
  await step(e, async () => {
    const rows = await getAll(company.id, e, { $top: '1' });
    return rows.length ? 'erişim var' : 'erişim var (kayıt yok)';
  });
}

// Hesap planı eşlemesi: analiz grubuna düşen hesaplar ve "diğer"de kalan gelir/gider hesapları
const classify = makeClassifier();
const accounts = (await getAll(company.id, 'accounts', { $select: 'number,displayName,accountType' })).filter((a) => a.accountType !== 'Heading');
const byGroup = {};
for (const a of accounts) (byGroup[classify(a.number, a.displayName).group] ||= []).push(a);
console.log('\nHesap planı eşlemesi:');
for (const [g, list] of Object.entries(byGroup).sort()) {
  if (g === 'other') continue;
  console.log(`  ${g.padEnd(13)} ${list.length} hesap  (${list.slice(0, 4).map((a) => `${a.number} ${a.displayName}`).join('; ')}${list.length > 4 ? '; …' : ''})`);
}
const unmapped = (byGroup.other || []).filter((a) => /^[67]/.test(a.number));
if (unmapped.length) {
  console.log('\nGelir/gider olup hiçbir gruba düşmeyen hesaplar (config/hesap-plani.json → overrides):');
  for (const a of unmapped) console.log(`  ${a.number}  ${a.displayName}`);
}
