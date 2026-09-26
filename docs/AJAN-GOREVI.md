# Ajan görevi: Business Central'dan düzenli veri indirme ve analiz

Bu doküman, **sizin bilgisayarınızda Chrome'u kullanan Claude ajanına** verilecek talimattır.
Ajan, oturum açık olan Chrome'unuzda Business Central'a girer, listeleri **salt okunur** şekilde Excel'e aktarır,
panele yükler ve kapsamlı analiz raporunu üretir.

> Neden bilgisayarınızda? BC, girişi sizin Microsoft hesabınızla yapar. Bulut oturumları bu girişe erişemez;
> ajan sizin Chrome'unuzda zaten açık olan oturumu kullanır. Hiçbir şifre ajana verilmez.

---

## 1. Bir kerelik kurulum (siz)

1. **Claude masaüstü uygulamasını** kurun ve giriş yapın.
2. Chrome'a **Claude in Chrome** eklentisini kurun, eklentiyi masaüstü uygulamasına bağlayın.
   Eklentide `businesscentral.dynamics.com` sitesine izin verin.
3. Chrome'da BC'ye bir kez giriş yapın ve "oturumu açık tut" seçeneğini işaretleyin:
   <https://businesscentral.dynamics.com/bc2c40d4-460f-4c3b-ab63-938831dee508/>
4. Bu depoyu bilgisayarınıza indirin (ör. `Belgeler/ButeoBC`), içinde bir kez `npm install` çalıştırın.
   (Node.js 20 veya üzeri gerekir: <https://nodejs.org>)
5. Masaüstü uygulamasında bu klasörü çalışma klasörü olarak açın ve aşağıdaki **ilk keşif çalışmasını** başlatın.

## 2. İlk keşif çalışması (siz izlerken, bir kez)

Ajana şunu yazın:

> `docs/AJAN-GOREVI.md` dosyasını oku. "İndirilecek listeler" tablosundaki her sayfayı Chrome'da BC'de aç,
> sayfanın gerçek adını ve görünen sütun başlıklarını `imports/KESIF.md` dosyasına yaz. Sonra her listeyi
> Excel'e aktarıp `imports/` klasörüne tablodaki adla kaydet, `npm run import` çalıştır ve sonucu bana göster.
> Bir sütun eksikse veya bir sayfayı bulamazsan dur ve bana sor. BC'de hiçbir kaydı değiştirme.

Keşif sonunda `npm run import` hatasız çalışıyorsa zamanlanmış göreve geçin. Sütun hatası çıkarsa
çıktıyı bu projedeki Claude oturumuna iletin; içe aktarma aracını sizin BC'nizin başlıklarına göre güncelleriz.

## 3. İndirilecek listeler

BC'de **Alt+Q** (veya büyüteç) ile sayfa adını arayın. Liste açıldıktan sonra filtreyi uygulayın, ardından
**Paylaş** simgesi → **Excel'de aç** (İngilizce arayüzde *Share → Open in Excel*). İnen dosyayı
`imports/` klasörüne **tablodaki dosya adıyla** kaydedin (varsa üzerine yazın).

| # | BC sayfası (TR / EN) | Filtre | Dosya adı | Gerekli sütunlar |
|---|---|---|---|---|
| 1 | Hesap Planı / Chart of Accounts | yok | `hesap-plani.xlsx` | No., Ad, Hesap Türü |
| 2 | Genel Muhasebe Kayıtları / General Ledger Entries | Nakil Tarihi: `01.01.2024..` | `genel-muhasebe.xlsx` | Nakil Tarihi, Genel Muhasebe Hesap No., Tutar (varsa Borç Tutarı, Alacak Tutarı) |
| 3 | Kalem Hareketleri / Item Ledger Entries | Nakil Tarihi: `01.01.2024..`, Hareket Türü: `Satış\|Satınalma` | `kalem-hareketleri.xlsx` | Nakil Tarihi, Hareket Türü, Belge No., Madde No., Açıklama, **Kaynak No.**, Miktar, Satış Tutarı (Gerçek), Maliyet Tutarı (Gerçek) |
| 4 | Müşteriler / Customers | yok | `musteriler.xlsx` | No., Ad, Şehir, Satış Elemanı Kodu |
| 5 | Satıcılar / Vendors | yok | `saticilar.xlsx` | No., Ad |
| 6 | Maddeler (Stoklar) / Items | yok | `stoklar.xlsx` | No., Açıklama, Temel Ölçü Birimi |
| 7 | Müşteri Hareketleri / Customer Ledger Entries | Açık: `Evet` | `musteri-hareketleri.xlsx` | Müşteri No., Müşteri Adı, Vade Tarihi, Kalan Tutar (UPB) |
| 8 | Satıcı Hareketleri / Vendor Ledger Entries | Açık: `Evet` | `satici-hareketleri.xlsx` | Satıcı No., Satıcı Adı, Vade Tarihi, Kalan Tutar (UPB) |
| 9 | Döviz Kurları / Currency Exchange Rates | yok | `doviz-kurlari.xlsx` | Başlangıç Tarihi, Para Birimi Kodu, Döviz Kuru Tutarı, İlgili Döviz Kuru Tutarı |

- 1 ve 2 zorunludur (kâr/zarar, giderler, banka/kasa). Diğerleri müşteri, ürün, tonaj, marj ve yaşlandırma analizlerini açar.
- "Excel'de aç" yalnızca **ekranda görünen sütunları** aktarır. Gerekli bir sütun görünmüyorsa (ör. *Kaynak No.*)
  ajan önce size sorar; onay verirseniz sayfada **Kişiselleştir → Alan ekle** ile sütunu bir kez ekler.
  Bu yalnızca sizin ekran görünümünüzü değiştirir, veriye dokunmaz.
- Çok büyük listelerde (yüz binlerce satır) tarih filtresini yıl yıl uygulayın ve ajan dosyaları birleştirmesin;
  bu durumda bize haber verin, çoklu dosya desteği ekleriz.

## 4. Zamanlanmış görev

Keşif başarılı olduktan sonra masaüstü uygulamasında **zamanlanmış görev** oluşturun (ör. hafta içi her sabah 08:45)
ve talimat olarak şunu verin:

> ButeoBC klasöründe çalış. `docs/AJAN-GOREVI.md` dosyasındaki "İndirilecek listeler" tablosunu uygula:
> Chrome'da yeni bir sekmede BC'yi aç, her listeyi filtreleriyle Excel'e aktar ve `imports/` klasörüne
> tablodaki adla kaydet. Sonra sırayla `npm run import` ve `npm run report` çalıştır.
> Bitince bana şunları özetle: bugünkü / bu haftaki / bu ayki net satış, brüt kâr ve net kâr (önceki dönem ve
> geçen yılla değişimleriyle), nakit durumu, vadesi geçen alacak oranı, sağlık skoru ve raporun "Analist yorumları"
> bölümündeki ilk 5 madde. Rapor dosyasının yolunu da yaz.
> Kurallar: BC'de sadece listele, filtrele ve Excel'e aktar; hiçbir kaydı açıp değiştirme, "Naklet", "Sil",
> "Düzenle", "Yeni" gibi düğmelere basma. BC giriş ekranı çıkarsa veya bir hata olursa dur ve bana bildir.
> Tamamladıktan sonra açtığın sekmeleri kapat.

## 5. Sonuçlar nerede?

| Çıktı | Yer |
|---|---|
| Kapsamlı Excel raporu | `reports/Buteo-Analiz-YYYY-MM-DD.xlsx`: Özet, Günlük / Haftalık / Aylık / Yıllık K-Z, Müşteriler, Ürünler, Satış ekibi, Tedarikçiler, Nakit ve Bilanço, Yaşlandırma |
| Web paneli | `npm start` → <http://localhost:3000> (imports/ klasöründeki son verilerle açılır) |
| Tek dosyalık panel | `npm run export` → `dist/buteo-panel.html` (e-postayla paylaşılabilir, sunucu gerektirmez) |

`imports/` ve `reports/` klasörleri şirket verisi içerdiği için git'e eklenmez.

## Güvenlik notları

- Ajan yalnızca sizin Chrome oturumunuzun zaten gördüğü verileri, sizin yetkinizle görür.
- Talimatta BC'de değişiklik yapmak yasaktır; yine de ilk çalışmaları izlemenizi öneririz.
- Kalıcı ve daha sağlam çözüm isterseniz, API bağlantısı (`docs/KURULUM.md`) tarayıcı otomasyonuna gerek bırakmaz.
