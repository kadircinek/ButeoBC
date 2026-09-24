# Business Central bağlantısı ve yayına alma

Panel, Business Central (BC) verilerini **Microsoft'un resmi API'si (v2.0)** üzerinden, yalnızca
**okuma** amaçlı çeker. Bağlantı, sizin adınıza şifre saklamadan, Microsoft Entra ID'de tanımlanan bir
"uygulama" (servis hesabı) ile kurulur. Kurulum yaklaşık 15 dakika sürer ve BC/Azure yönetici hesabı gerektirir.

Kiracı (tenant) kimliğiniz: `bc2c40d4-460f-4c3b-ab63-938831dee508` (BC giriş linkinizden alındı).

## 1. Microsoft Entra ID'de uygulama kaydı

1. <https://portal.azure.com> → **Microsoft Entra ID** → **Uygulama kayıtları** → **Yeni kayıt**.
2. Ad: `Buteo Analiz`. Hesap türü: *Yalnızca bu kuruluş dizinindeki hesaplar*.
3. Yeniden yönlendirme URI'si: platform **Web**, adres `https://businesscentral.dynamics.com/OAuthLanding.htm` → **Kaydet**.
4. Açılan sayfadaki **Uygulama (istemci) kimliği** değerini not alın → `BC_CLIENT_ID`.
5. **API izinleri** → **İzin ekle** → **Dynamics 365 Business Central** → **Uygulama izinleri** →
   `API.ReadWrite.All` seçin → **Ekle** → **… için yönetici onayı ver**.
   (Microsoft uygulama izinlerinde salt-okunur seçenek sunmaz; okuma kısıtını 3. adımda BC tarafında koyacağız.)
6. **Sertifikalar ve gizli diziler** → **Yeni istemci gizli dizisi** → süre 24 ay →
   oluşan **Değer**'i hemen kopyalayın → `BC_CLIENT_SECRET`. (Sayfadan çıkınca bir daha gösterilmez.)

## 2. Ortam adını öğrenin

BC'de sağ üstteki **?** → **Yardım ve Destek** sayfasında *Ortam adı* yazar (genelde `Production`) → `BC_ENVIRONMENT`.
Birden fazla şirket kullanıyorsanız şirket adını `BC_COMPANY_NAME`'e yazın.

## 3. Business Central'da uygulamaya yetki verin (salt okuma)

1. BC'de arama (Alt+Q) → **Microsoft Entra Uygulamaları** → **Yeni**.
2. **İstemci Kimliği**: 1. adımdaki kimlik. Açıklama: `Buteo Analiz`. **Durum**: *Etkin*.
3. **Kullanıcı İzin Kümeleri** bölümüne `D365 READ` ekleyin (yalnızca okuma).
4. **İzin Ver** (Grant Consent) düğmesine basıp yönetici hesabıyla onaylayın.

## 4. Paneli çalıştırma

```bash
cp .env.example .env      # değerleri doldurun, DASHBOARD_PASSWORD'e güçlü bir şifre yazın
npm install
npm run sync              # ilk senkronizasyon; hangi tablodan kaç kayıt geldiğini yazar
npm start                 # http://localhost:3000
```

Sunucu açıkken veriler `SYNC_INTERVAL_MINUTES` (varsayılan 60 dk) aralıkla kendiliğinden yenilenir;
**Veri & Ayarlar** sekmesindeki **Şimdi güncelle** ile anında da yenileyebilirsiniz.

### Çekilen veriler

| BC API tablosu | Panelde kullanımı |
|---|---|
| `generalLedgerEntries`, `accounts` | Kâr/zarar, gider kırılımı (nakliye, depo, gümrük…), kasa/banka, alacak/borç bakiyeleri |
| `salesInvoices`, `salesCreditMemos` (+ satırlar) | Müşteri, ürün, tonaj, satış temsilcisi analizleri |
| `purchaseInvoices`, `purchaseCreditMemos` (+ satırlar) | Tedarikçi, alış fiyatı, tahmini ürün marjı |
| `agedAccountsReceivables`, `agedAccountsPayables` | Alacak / borç yaşlandırma |
| `currencyExchangeRates` | Dövizli faturaların TL karşılığı ve USD görünümü |
| `customers`, `vendors`, `items` | İsimler ve kategoriler |

### Hesap planı eşlemesi

Gider türleri (nakliye, depo/ardiye, gümrük, genel yönetim, finansman…) hesap numarası ve hesap adına göre
`config/hesap-plani.json` dosyasındaki kurallarla belirlenir (Tekdüzen Hesap Planı varsayılanlarıyla gelir).
İlk senkronizasyondan sonra **Veri & Ayarlar → Hesap planı eşlemesi** tablosunu kontrol edin; yanlış gruplanan
hesap varsa `overrides` bölümüne `"760.05": "gumruk"` gibi ekleyip `npm run sync` çalıştırın.

## 5. İnternette yayına alma (her yerden takip için)

Veriler hassas olduğundan panel **şifre korumalıdır** ve BC bağlıyken şifresiz açılmaz. Mutlaka HTTPS
arkasında yayınlayın. Önerilen seçenekler:

- **Azure App Service (Linux, Node 22)** – Microsoft 365/BC ile aynı ekosistem. Depoyu bağlayın, `.env`
  değerlerini *Uygulama ayarları*'na girin, başlangıç komutu `npm start`. HTTPS otomatik gelir.
- **Docker** çalıştırabilen herhangi bir sunucu:
  `docker build -t buteo-analiz . && docker run -d -p 3000:3000 --env-file .env -v buteo-data:/app/data buteo-analiz`
  (önüne HTTPS için Caddy/Nginx koyun).
- **Render / Railway** gibi platformlar: Node servisi olarak `npm start`; ortam değişkenlerini panelden girin.

## Sorun giderme

- `Token alınamadı: AADSTS7000215` → istemci gizli dizisi yanlış (Değer yerine Gizli Dizi Kimliği kopyalanmış olabilir).
- `BC API 401/403` → 3. adımdaki uygulama kaydı *Etkin* değil ya da izin onayı verilmedi.
- `Şirket bulunamadı` → hata mesajında listelenen şirket adlarından birini `BC_COMPANY_NAME`'e yazın.
- Bir tablo alınamazsa panel çalışmaya devam eder; eksik tablo **Veri & Ayarlar → Uyarılar** altında görünür.
