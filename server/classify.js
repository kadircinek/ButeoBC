// Hesap numarası + adına göre analiz grubu belirler (config/hesap-plani.json).
import { readFileSync } from 'node:fs';

const CONFIG_URL = new URL('../config/hesap-plani.json', import.meta.url);

export function loadAccountConfig() {
  return JSON.parse(readFileSync(CONFIG_URL, 'utf8'));
}

const lower = (s) => (s || '').toLocaleLowerCase('tr-TR');

export function makeClassifier(cfg = loadAccountConfig()) {
  const prefixes = [...cfg.prefixGroups].sort((a, b) => b.prefix.length - a.prefix.length);
  const scope = cfg.keywordScope || [];
  const excludes = (cfg.keywordExclude || []).map(lower);

  return function classify(no, name) {
    const num = String(no || '').trim();
    if (cfg.overrides && cfg.overrides[num]) return { group: cfg.overrides[num], family: familyOf(num) };
    if ((cfg.transferPrefixes || []).some((p) => num.startsWith(p))) return { group: 'transfer', family: null };

    const base = prefixes.find((p) => num.startsWith(p.prefix));
    const n = lower(name);
    const inScope = scope.some((p) => num.startsWith(p));
    const isCore = base && ['revenue', 'returns', 'cogs'].includes(base.group);
    if (inScope && !isCore && !excludes.some((x) => n.includes(x))) {
      for (const kg of cfg.keywordGroups || []) {
        if (kg.keywords.some((k) => n.includes(lower(k)))) {
          return { group: kg.group, family: base?.family ?? familyOf(num) };
        }
      }
    }
    return base ? { group: base.group, family: base.family ?? null } : { group: 'other', family: null };
  };
}

function familyOf(num) {
  if (/^7[0-8]/.test(num)) return '7';
  if (/^6[3-6]/.test(num)) return '6';
  return null;
}
