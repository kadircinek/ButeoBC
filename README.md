# Buteo Analiz – Yönetim Paneli

Buteo Petrokimya'nın Microsoft Dynamics 365 **Business Central** verilerinden günlük, haftalık, aylık ve
yıllık yönetim analizleri üreten web paneli. CEO, CFO, satış müdürü ve lojistik bakış açılarıyla:

| Sekme | İçerik |
|---|---|
| **CEO Özeti** | Şirket sağlık skoru (0–100), otomatik analist yorumları, net satış / brüt kâr / net kâr / tonaj / nakit / alacak KPI'ları (önceki dönem ve geçen yılla karşılaştırmalı), trend grafikleri |
| **Satış** | En büyük müşteriler, ürün bazında satış ve tahmini marj, ton başına fiyat trendi, satış temsilcileri, yeni ve kaybedilen müşteriler, müşteri yoğunlaşması |
| **Finans (CFO)** | Bilanço özeti, DSO/DPO/DIO ve nakit döngüsü, dönemsel gelir tablosu, gider kırılımı, nakit bakiyesi, tahsilat/ödeme akışı, banka-kasa bakiyeleri, alacak/borç yaşlandırma |
| **Satınalma & Lojistik** | Satınalma tutarı ve tonajı, tedarikçiler, nakliye/depo/gümrük giderleri, lojistik giderinin satışa oranı ve ton başına maliyeti |
| **Veri & Ayarlar** | Senkronizasyon durumu, uyarılar, hesap planı eşlemesi |

Tüm ekranlar **TL / USD** arasında geçiş yapabilir (USD görünümü enflasyon etkisini ayırarak gerçek büyümeyi gösterir)
ve açık/koyu temayı destekler.

## Hızlı başlangıç (demo veriyle)

```bash
npm install
npm start          # http://localhost:3000
```

Business Central bağlantısı tanımlı değilse panel, gerçekçi ama **tamamen kurgusal** bir demo veriyle açılır
(üst kısımda "DEMO VERİ" etiketi görünür). Gerçek verilere bağlanmak için: **[docs/KURULUM.md](docs/KURULUM.md)**.

## Mimari

```
Business Central API v2.0 ──(OAuth, salt okuma)──> server/bc/sync.js ──> data/dataset.json (önbellek)
                                                                               │
tarayıcı  <── public/ (arayüz + Chart.js) <── /api/dataset (şifre korumalı) ◄──┘
             public/js/analytics.js : tüm hesaplamalar (KPI, K/Z, oranlar, skor, yorumlar)
```

- `server/` – Express sunucusu, BC istemcisi, senkronizasyon, demo veri üreticisi
- `config/hesap-plani.json` – hesapların analiz gruplarına eşlenmesi (nakliye, depo, gümrük…)
- `public/js/analytics.js` – analiz motoru (saf JS; tarayıcıda ve testlerde çalışır)
- `scripts/export-static.js` – paneli tek HTML dosyasına gömer (`npm run export -- --demo`)

## Komutlar

| Komut | Açıklama |
|---|---|
| `npm start` | Paneli başlatır |
| `npm run sync` | BC'den verileri bir kez çeker |
| `npm run demo` | Demo veriyi yeniden üretir |
| `npm run export` | Paneli tek dosyalık HTML olarak dışa aktarır |
| `npm test` | Analiz motoru testleri |

## Yol haritası (sonraki adımlar)

- Gerçek BC verisiyle hesap planı eşlemesinin doğrulanması ve ince ayar
- Bütçe / hedef girişi ve gerçekleşen–hedef karşılaştırması
- Ürün bazında gerçek maliyet (kalem hareketleri) ve stok devir analizi
- Döviz pozisyonu (USD alacak–borç dengesi) ve kur riski
- Çek/senet portföyü ve vadeli nakit akış projeksiyonu
- Haftalık özetin e-posta ile gönderimi, yapay zekâ destekli yorumlar
