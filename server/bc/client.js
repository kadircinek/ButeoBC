// Business Central API v2.0 istemcisi (Microsoft Entra "client credentials" akışı).
import { config } from '../config.js';

const API_ROOT = 'https://api.businesscentral.dynamics.com/v2.0';
let token = null;

async function getToken() {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const { tenantId, clientId, clientSecret } = config.bc;
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://api.businesscentral.dynamics.com/.default',
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Token alınamadı: ${body.error_description || body.error || res.status}`);
  token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return token.value;
}

async function request(url, attempt = 0) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${await getToken()}`, Accept: 'application/json', 'Data-Access-Intent': 'ReadOnly' },
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    const wait = Number(res.headers.get('Retry-After')) * 1000 || 2 ** attempt * 2000;
    await new Promise((r) => setTimeout(r, wait));
    return request(url, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`BC API ${res.status} ${url}\n${text.slice(0, 500)}`);
  }
  return res.json();
}

const baseUrl = () => `${API_ROOT}/${config.bc.tenantId}/${encodeURIComponent(config.bc.environment)}/api/v2.0`;

export async function listCompanies() {
  return (await request(`${baseUrl()}/companies`)).value;
}

export async function resolveCompany() {
  const companies = await listCompanies();
  const { companyId, companyName } = config.bc;
  const hit = companyId ? companies.find((c) => c.id === companyId)
    : companyName ? companies.find((c) => c.name === companyName || c.displayName === companyName)
    : companies[0];
  if (!hit) throw new Error(`Şirket bulunamadı. Mevcut şirketler: ${companies.map((c) => c.name).join(', ')}`);
  return hit;
}

// Bir varlık kümesinin tüm sayfalarını çeker (@odata.nextLink takip edilir).
export async function getAll(companyId, entity, query = {}) {
  const qs = Object.entries(query).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  let url = `${baseUrl()}/companies(${companyId})/${entity}${qs ? `?${qs}` : ''}`;
  const rows = [];
  while (url) {
    const page = await request(url);
    rows.push(...page.value);
    url = page['@odata.nextLink'];
  }
  return rows;
}
