// Komut satırından tek seferlik senkronizasyon: npm run sync
import { sync, status } from '../server/store.js';
await sync();
console.log(JSON.stringify(status(), null, 2));
