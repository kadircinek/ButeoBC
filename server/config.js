// Ortam değişkenleri (.env dosyası varsa otomatik yüklenir).
try { process.loadEnvFile(); } catch { /* .env yok */ }

const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  // Varsayılan olarak yalnızca bu bilgisayardan erişilir; ağa açmak için HOST=0.0.0.0 ve şifre gerekir.
  host: env.HOST || '127.0.0.1',
  dashboardUser: env.DASHBOARD_USER || 'buteo',
  dashboardPassword: env.DASHBOARD_PASSWORD || '',
  dataFile: env.DATA_FILE || new URL('../data/dataset.json', import.meta.url).pathname,
  syncIntervalMinutes: Number(env.SYNC_INTERVAL_MINUTES || 60),
  syncFromDate: env.SYNC_FROM_DATE || defaultFromDate(),
  bc: {
    tenantId: env.BC_TENANT_ID || 'bc2c40d4-460f-4c3b-ab63-938831dee508',
    environment: env.BC_ENVIRONMENT || 'Production',
    clientId: env.BC_CLIENT_ID || '',
    clientSecret: env.BC_CLIENT_SECRET || '',
    companyName: env.BC_COMPANY_NAME || '',
    companyId: env.BC_COMPANY_ID || '',
  },
};

export const bcConfigured = () => Boolean(config.bc.clientId && config.bc.clientSecret);

function defaultFromDate() {
  const d = new Date();
  return `${d.getFullYear() - 3}-01-01`;
}
