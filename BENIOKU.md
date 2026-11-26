# Demet Güven kişisel site (sguven.github.io/demet/)

## Düzenleme modu
Site, `?duzen` adresinde birebir aynı görünür ve yerinde düzenlenir: ile tıkla yazı/fotoğraf ekle, gidilmemiş ile tıkla haritaya ekle, kartlara tıkla düzenle, Ben sayfasında "Düzenle". Her değişiklik "Kaydet ve yayınla" ile GitHub'a yazılır, sitede 1–2 dakikada görünür.

Tek tıkla giriş bağlantısı: `https://sguven.github.io/demet/admin/#key=ANAHTAR` (ya da `https://sguven.github.io/demet/?duzen#key=ANAHTAR`). Anahtar cihaza kaydedilir, adres çubuğundan silinir; bir daha sorulmaz.
Anahtar: GitHub fine-grained token, yalnızca `sguven/demet`, Contents: Read and write. Kod `js/duzen.js`.

Sekmeler: Gezdiğim Yerler, Yemeklerim, Eserlerim, Ben.

## İçerik nasıl doldurulur
- **Gezi detayları:** `veri/gezilerim.json`. Her il/ilçe için `tarih`, `ozet`, `aciklama` (paragrafları boş satırla ayırın), `fotograflar` ve `etiketler` alanları var.
  Fotoğrafları `img/` klasörüne koyup `"fotograflar": [{"src": "img/trabzon-1.jpg", "aciklama": "Uzungöl"}]` şeklinde ekleyin.
- **Yeni il:** `iller` listesine `{"ad": "Van", ...}` ekleyin (ad, haritadaki adla aynı olmalı; Afyon için "Afyonkarahisar").
- **Yeni ilçe/şehir iğnesi:** `ilceler` listesine `ad`, `il`, `konum: [enlem, boylam]` ile ekleyin.
- **Yemekler / Eserler:** `veri/yemeklerim.json`, `veri/eserlerim.json`.
- **Ben:** `veri/ben.json` (`foto`, `yazi`).

`js/iller.js` harita sınırlarıdır (kaynak: github.com/cihadturhan/tr-geojson), elle değiştirmeyin.
