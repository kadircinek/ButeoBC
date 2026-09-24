import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config, bcConfigured } from './config.js';
import { getDataset, status, sync } from './store.js';

const app = express();
const root = (p) => fileURLToPath(new URL(p, import.meta.url));

if (bcConfigured() && !config.dashboardPassword) {
  console.error('HATA: Gerçek BC verisi için DASHBOARD_PASSWORD tanımlanmalı (.env).');
  process.exit(1);
}
if (!config.dashboardPassword) console.warn('Uyarı: DASHBOARD_PASSWORD tanımlı değil, panel şifresiz (yalnızca demo veri).');

// Basit HTTP Basic kimlik doğrulaması
const safeEq = (a, b) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
app.use((req, res, next) => {
  if (!config.dashboardPassword || req.path === '/healthz') return next();
  const [scheme, value] = (req.headers.authorization || '').split(' ');
  if (scheme === 'Basic' && value) {
    const [user, ...rest] = Buffer.from(value, 'base64').toString().split(':');
    if (safeEq(user, config.dashboardUser) && safeEq(rest.join(':'), config.dashboardPassword)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Buteo Analiz", charset="UTF-8"').status(401).send('Giriş gerekli');
});

app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' });
  next();
});

app.get('/healthz', (req, res) => res.send('ok'));
app.get('/api/status', (req, res) => res.json(status()));
app.get('/api/dataset', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store').json(await getDataset());
  } catch (err) { next(err); }
});
app.post('/api/sync', async (req, res, next) => {
  try { await sync(); res.json(status()); } catch (err) { next(err); }
});

app.get('/vendor/chart.umd.js', (req, res) => res.sendFile(root('../node_modules/chart.js/dist/chart.umd.js')));
app.use(express.static(root('../public'), { extensions: ['html'] }));

app.use((err, req, res, _next) => res.status(500).json({ error: err.message }));

app.listen(config.port, () => {
  console.log(`Buteo Analiz: http://localhost:${config.port}  (veri kaynağı: ${bcConfigured() ? 'Business Central' : 'DEMO'})`);
  if (bcConfigured() && config.syncIntervalMinutes > 0) {
    setInterval(() => sync().catch(() => {}), config.syncIntervalMinutes * 60_000);
  }
});
