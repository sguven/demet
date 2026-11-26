/* Düzenleme modu: site.js tarafından ?duzen adresinde yüklenir.
   Site birebir aynı görünür; yerler, kartlar ve "Ben" yerinde düzenlenir ve GitHub'a kaydedilir. */
(function () {
  "use strict";
  var A = { sahip: "sguven", depo: "demet", dal: "main", kok: "" };
  var ANAHTAR_KEY = "demet-panel-anahtar";
  var S = window.SITE, V = S.V, esc = S.esc;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Anahtar ---------- */
  var anahtar = "";
  try { anahtar = localStorage.getItem(ANAHTAR_KEY) || ""; } catch (e) {}
  (function () {
    var m = location.hash.match(/[#&](?:key|anahtar)=([^&]+)/);
    if (!m) return;
    anahtar = decodeURIComponent(m[1]).trim();
    try { localStorage.setItem(ANAHTAR_KEY, anahtar); } catch (e) {}
    history.replaceState(null, "", location.pathname + location.search + "#gezilerim");
  })();

  function slug(s) {
    var m = { "ç": "c", "ğ": "g", "ı": "i", "İ": "i", "ö": "o", "ş": "s", "ü": "u", "Ç": "c", "Ğ": "g", "Ö": "o", "Ş": "s", "Ü": "u" };
    return String(s).replace(/[çğıİöşüÇĞÖŞÜ]/g, function (c) { return m[c]; })
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "foto";
  }
  function kopya(o) { return JSON.parse(JSON.stringify(o)); }
  function geriYukle(hedef, yedek) {
    Object.keys(hedef).forEach(function (k) { delete hedef[k]; });
    Object.assign(hedef, kopya(yedek));
  }

  /* ---------- GitHub ---------- */
  function api(yol, secenek) {
    secenek = secenek || {};
    secenek.headers = Object.assign({ "Authorization": "Bearer " + anahtar, "Accept": "application/vnd.github+json" }, secenek.headers || {});
    return fetch("https://api.github.com/repos/" + A.sahip + "/" + A.depo + yol, secenek).then(function (r) {
      if (r.status === 401) throw hata("Giriş anahtarı geçersiz ya da süresi dolmuş.", r.status);
      if (r.status === 403) throw hata("Bu anahtarın bu siteye yazma izni yok.", r.status);
      if (!r.ok) return r.text().then(function (t) { throw hata("GitHub hatası " + r.status + ": " + t.slice(0, 160), r.status); });
      return r.json();
    });
  }
  function hata(m, kod) { var e = new Error(m); e.kod = kod; return e; }
  function b64Coz(b64) {
    var bin = atob(b64.replace(/\n/g, "")), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function b64Kodla(metin) {
    var bytes = new TextEncoder().encode(metin), bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function icerikYolu(yol) { return "/contents/" + encodeURI(A.kok + yol); }
  function dosyaOku(yol) {
    return api(icerikYolu(yol) + "?ref=" + A.dal + "&t=" + Date.now()).then(function (j) { return JSON.parse(b64Coz(j.content)); });
  }
  function dosyaYaz(yol, icerikB64, mesaj, sha) {
    var govde = { message: mesaj, content: icerikB64, branch: A.dal };
    if (sha) govde.sha = sha;
    return api(icerikYolu(yol), { method: "PUT", body: JSON.stringify(govde) });
  }
  function jsonKaydet(yol, veri, mesaj) {
    // Her kayıtta en güncel sha alınır
    return api(icerikYolu(yol) + "?ref=" + A.dal + "&t=" + Date.now()).then(function (j) { return j.sha; }, function (e) {
      if (e.kod === 404) return null; throw e;
    }).then(function (sha) {
      return dosyaYaz(yol, b64Kodla(JSON.stringify(veri, null, 2) + "\n"), mesaj, sha);
    });
  }
  var BEN_VARSAYILAN = { foto: "img/adiyaman-nemrut.jpg", yazi: "" };
  function yukle(yol) {
    return dosyaOku(yol).catch(function (e) {
      if (e.kod === 404 && /ben\.json$/.test(yol)) return kopya(BEN_VARSAYILAN);
      if (e.kod === 401 || e.kod === 403) girisGoster(e.message);
      throw e;
    });
  }

  /* ---------- Fotoğraf ---------- */
  var onizleme = {}; // yeni yüklenen fotoğraf -> data URL (site yayına girene kadar)
  function kucult(dosya) {
    return new Promise(function (coz, red) {
      var img = new Image(), url = URL.createObjectURL(dosya);
      img.onload = function () {
        var o = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * o); c.height = Math.round(img.naturalHeight * o);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        var veriUrl = c.toDataURL("image/jpeg", 0.82);
        coz({ b64: veriUrl.split(",")[1], onizleme: veriUrl, aciklama: "" });
      };
      img.onerror = function () { red(new Error(dosya.name + " açılamadı. JPEG ya da PNG fotoğraf seç.")); };
      img.src = url;
    });
  }
  function fotoYukle(f, onEk) {
    var ad = "img/" + slug(onEk) + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) + ".jpg";
    return dosyaYaz(ad, f.b64, "Düzenleme: fotoğraf eklendi (" + onEk + ")").then(function () { onizleme[ad] = f.onizleme; return ad; });
  }

  /* ---------- Panel durumu ---------- */
  // aktif: {tip:"yer"|"kart"|"ben"|"yeni-il"|"yeni-pin", k, yedek, bekleyen:[], kirli, ...}
  var aktif = null;
  function durum(m, tur) { var d = $("d-durum"); if (d) { d.textContent = m; d.className = "durum" + (tur ? " " + tur : ""); } }
  function vazgec() { if (aktif && aktif.kirli && aktif.yedek) geriYukle(aktif.k, aktif.yedek); }
  function kirlet() { if (aktif) aktif.kirli = true; }
  function kaydetDugmeleri(silYazi) {
    return '<div class="satir"><button class="dugme" data-eylem="kaydet">Kaydet ve yayınla</button>' +
      (silYazi ? '<button class="dugme tehlike" data-eylem="sil">' + silYazi + "</button>" : "") +
      '</div><div class="durum" id="d-durum"></div>';
  }
  function alan(id, etiket, deger, tip, ek) {
    return '<label for="' + id + '">' + etiket + "</label>" + (tip === "textarea"
      ? '<textarea id="' + id + '"' + (ek || "") + ">" + esc(deger) + "</textarea>"
      : '<input id="' + id + '" type="text" value="' + esc(deger) + '"' + (ek || "") + ">");
  }
  function deger(id) { var el = $(id); return el ? el.value.trim() : ""; }

  /* ---------- Yer formu (il / ilçe / yurt dışı) ---------- */
  function fotoDuzen(liste, bekleyen, tek) {
    var h = (liste || []).map(function (f, i) {
      return '<div class="f"><img src="' + esc(kaynak(f.src)) + '" alt="" loading="lazy">' +
        (tek ? "" : '<input type="text" data-foto="' + i + '" value="' + esc(f.aciklama || "") + '" placeholder="Fotoğraf açıklaması">') +
        '<div class="alt"><span>Yayında</span><button type="button" data-fsil="' + i + '">Kaldır</button></div></div>';
    }).join("") + (bekleyen || []).map(function (f, i) {
      return '<div class="f yeni"><img src="' + f.onizleme + '" alt="">' +
        (tek ? "" : '<input type="text" data-bekleyen="' + i + '" value="' + esc(f.aciklama || "") + '" placeholder="Fotoğraf açıklaması">') +
        '<div class="alt"><span>Kaydedince eklenecek</span><button type="button" data-bsil="' + i + '">Kaldır</button></div></div>';
    }).join("");
    var dolu = tek && ((liste && liste.length) || (bekleyen && bekleyen.length));
    return '<div class="foto-duzen' + (tek ? " tek-foto" : "") + '">' + h +
      '<label class="yukle" for="d-dosya">' + (dolu ? "Fotoğrafı değiştir" : "+ Fotoğraf ekle" + (tek ? "" : "<small>birden fazla seçebilirsin</small>")) + "</label></div>" +
      '<input id="d-dosya" type="file" accept="image/*"' + (tek ? "" : " multiple") + " hidden>";
  }

  function yerFormu(tur, k) {
    if (!aktif || aktif.k !== k) {
      vazgec();
      aktif = { tip: "yer", tur: tur, k: k, yedek: kopya(k), bekleyen: [], kirli: false };
    }
    k.fotograflar = k.fotograflar || [];
    return '<div class="duzen-form">' +
      alan("d-tarih", 'Ne zaman gittin? <small>ör. Ağustos 2023</small>', k.tarih) +
      alan("d-ozet", 'Kısa not <small>haritada üstüne gelince görünür</small>', k.ozet, "text", ' maxlength="90"') +
      alan("d-aciklama", 'Anlatmak istediklerin <small>paragrafları boş satırla ayır</small>', k.aciklama, "textarea") +
      "<label>Fotoğraflar</label>" + fotoDuzen(k.fotograflar, aktif.bekleyen) +
      alan("d-etiket", 'Etiketler <small>virgülle ayır, ör. deniz, yemek, aile</small>', (k.etiketler || []).join(", ")) +
      kaydetDugmeleri("Bu yeri haritadan kaldır") + "</div>";
  }
  function yerFormuOku() {
    var k = aktif.k;
    if (!$("d-tarih")) return;
    k.tarih = deger("d-tarih"); k.ozet = deger("d-ozet"); k.aciklama = deger("d-aciklama");
    k.etiketler = deger("d-etiket").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    document.querySelectorAll("#p-govde input[data-foto]").forEach(function (inp) {
      var f = k.fotograflar[+inp.dataset.foto]; if (f) f.aciklama = inp.value.trim();
    });
  }
  function yerYenile(mesaj, tur) {
    var a = aktif;
    S.detayAc(a.tur, a.k.ad);
    if (mesaj) durum(mesaj, tur);
  }
  function yerKaydet(btn) {
    var a = aktif; yerFormuOku();
    btn.disabled = true;
    var sira = Promise.resolve(), say = 0, n = a.bekleyen.length;
    a.bekleyen.forEach(function (f) {
      sira = sira.then(function () {
        durum("Fotoğraf yükleniyor (" + (++say) + "/" + n + ")…");
        return fotoYukle(f, a.k.ad).then(function (src) { a.k.fotograflar.push({ src: src, aciklama: (f.aciklama || "").trim() }); a.bekleyen.shift(); });
      });
    });
    sira.then(function () {
      durum("Kaydediliyor…");
      return jsonKaydet("veri/gezilerim.json", V.gezi, "Düzenleme: " + a.k.ad + " güncellendi");
    }).then(function () {
      a.yedek = kopya(a.k); a.kirli = false;
      S.yenidenCiz(); yerYenile("Kaydedildi. Sitede 1–2 dakika içinde görünür.", "iyi");
    }).catch(function (e) { btn.disabled = false; durum("Kaydedilemedi: " + e.message, "hata"); });
  }
  function yerSil(btn) {
    var a = aktif, k = a.k;
    if (!confirm("“" + k.ad + "” haritadan kaldırılsın mı?")) return;
    var liste = a.tur === "il" ? V.gezi.iller : (k.ulke ? V.gezi.yurtdisi : V.gezi.ilceler);
    var i = liste.indexOf(k);
    if (i < 0) return;
    vazgec(); liste.splice(i, 1);
    btn.disabled = true; durum("Kaldırılıyor…");
    jsonKaydet("veri/gezilerim.json", V.gezi, "Düzenleme: " + k.ad + " kaldırıldı").then(function () {
      aktif = null; S.panelKapat(true); S.yenidenCiz();
    }).catch(function (e) { liste.splice(i, 0, k); btn.disabled = false; durum("Kaldırılamadı: " + e.message, "hata"); });
  }

  /* ---------- Yeni il (gidilmemiş ile tıklayınca) ---------- */
  function bosYer(ek) { return Object.assign(ek, { tarih: "", ozet: "", aciklama: "", fotograflar: [], etiketler: [] }); }
  function renkSec(ad) {
    // Komşu (kutuları kesişen) gezilmiş illerde kullanılmayan bir renk seç
    var el = document.querySelector('#harita .il[data-ad="' + ad + '"]');
    if (!el) return 0;
    var b = el.getBBox(), kullanilan = {};
    document.querySelectorAll("#harita .il.gez[data-ad]").forEach(function (p) {
      var c = p.getBBox();
      if (c.x <= b.x + b.width + 2 && b.x <= c.x + c.width + 2 && c.y <= b.y + b.height + 2 && b.y <= c.y + c.height + 2) {
        var r = (window.TR_RENK || {})[p.dataset.ad]; if (r != null) kullanilan[r] = 1;
      }
    });
    for (var r = 0; r < 5; r++) if (!kullanilan[r]) return r;
    return 0;
  }
  function ilEkle(ad) {
    if (aktif && !kapatilabilir()) return;
    vazgec();
    aktif = { tip: "yeni-il", ad: ad };
    S.panelGoster({ renk: "var(--yok)", tur: "Henüz eklenmemiş il", ad: ad,
      govde: '<div class="duzen-form"><p><strong>' + esc(ad) + "</strong> ilini gezdin mi? Eklersen haritada boyanır, sonra yazı ve fotoğraf ekleyebilirsin.</p>" +
        '<div class="satir"><button class="dugme" data-eylem="il-ekle">Gittim, haritaya ekle</button></div><div class="durum" id="d-durum"></div></div>' });
  }
  function ilEkleKaydet(btn, ad) {
    if (V.gezi.iller.some(function (k) { return k.ad === ad; })) { S.detayAc("il", ad); return; }
    var yeni = bosYer({ ad: ad, renk: renkSec(ad) });
    V.gezi.iller.push(yeni);
    btn.disabled = true; durum("Ekleniyor…");
    jsonKaydet("veri/gezilerim.json", V.gezi, "Düzenleme: yeni il " + ad).then(function () {
      aktif = null; S.yenidenCiz(); S.detayAc("il", ad);
      durum(ad + " eklendi. Şimdi yazı ve fotoğraf ekleyebilirsin.", "iyi");
    }).catch(function (e) { V.gezi.iller.pop(); btn.disabled = false; durum("Eklenemedi: " + e.message, "hata"); });
  }

  /* ---------- Yeni iğne (ilçe / şehir / yurt dışı) ---------- */
  var C = Math.cos(39 * Math.PI / 180), K = 1000 / ((44.82 - 25.66) * C);
  function proj(lat, lon) { return [(lon - 25.66) * C * K, (42.12 - lat) * K]; }
  function ilBul(lat, lon) {
    var xy = proj(lat, lon), bulunan = "";
    var pt = $("harita").createSVGPoint(); pt.x = xy[0]; pt.y = xy[1];
    document.querySelectorAll("#harita .il[data-ad]").forEach(function (p) {
      try { if (!bulunan && p.isPointInFill(pt)) bulunan = p.dataset.ad; } catch (e) {}
    });
    return bulunan;
  }
  function pinBaslat() {
    if (aktif && !kapatilabilir()) return;
    S.panelKapat(true);
    DUZEN.konumBekliyor = true;
    document.body.classList.add("konum-sec");
    $("d-pin-not").hidden = false;
    $("harita").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function pinIptal() {
    DUZEN.konumBekliyor = false;
    document.body.classList.remove("konum-sec");
    $("d-pin-not").hidden = true;
  }
  function konumSecildi(lat, lon) {
    pinIptal();
    var il = ilBul(lat, lon);
    var iller = Object.keys(window.TR_ILLER).sort(function (a, b) { return a.localeCompare(b, "tr"); });
    aktif = { tip: "yeni-pin", konum: [lat, lon] };
    S.panelGoster({ renk: il ? S.renkVar(il) : "var(--m3)", tur: "Yeni iğne", ad: "Yeni yer",
      govde: '<div class="duzen-form">' +
        alan("d-ad", "Yerin adı", "", "text", ' placeholder="ör. Kaş"') +
        '<label for="d-nerede">Nerede?</label><select id="d-nerede"><option value="tr"' + (il ? " selected" : "") + '>Türkiye’de</option><option value="yd"' + (il ? "" : " selected") + ">Yurt dışında</option></select>" +
        '<div id="d-il-kutu"' + (il ? "" : " hidden") + '><label for="d-il">Bağlı olduğu il</label><select id="d-il">' +
        iller.map(function (n) { return "<option" + (n === il ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("") + "</select></div>" +
        '<div id="d-ulke-kutu"' + (il ? " hidden" : "") + ">" + alan("d-ulke", "Ülke", "", "text", ' placeholder="ör. Gürcistan"') + "</div>" +
        '<p class="ipucu-yazi">Konum: ' + lat.toFixed(3) + ", " + lon.toFixed(3) + ' · <button type="button" class="metin-dugme" data-eylem="pin-tekrar">Haritada başka yer seç</button></p>' +
        '<div class="satir"><button class="dugme" data-eylem="pin-ekle">Haritaya ekle</button></div><div class="durum" id="d-durum"></div></div>' });
    setTimeout(function () { var a = $("d-ad"); if (a) a.focus(); }, 50);
  }
  function pinEkleKaydet(btn) {
    var ad = deger("d-ad"), yd = $("d-nerede").value === "yd";
    if (!ad) return durum("Yerin adını yaz.", "hata");
    var hepsi = V.gezi.ilceler.concat(V.gezi.yurtdisi || []);
    if (hepsi.some(function (k) { return k.ad === ad; })) return durum("Bu adda bir yer zaten var.", "hata");
    var yeni, liste, eklenenIl = null;
    if (yd) {
      var ulke = deger("d-ulke"); if (!ulke) return durum("Ülkeyi yaz.", "hata");
      yeni = bosYer({ ad: ad, ulke: ulke, konum: aktif.konum });
      V.gezi.yurtdisi = V.gezi.yurtdisi || []; liste = V.gezi.yurtdisi;
    } else {
      var il = $("d-il").value;
      yeni = bosYer({ ad: ad, il: il, konum: aktif.konum }); liste = V.gezi.ilceler;
      if (!V.gezi.iller.some(function (k) { return k.ad === il; })) { eklenenIl = bosYer({ ad: il, renk: renkSec(il) }); V.gezi.iller.push(eklenenIl); }
    }
    liste.push(yeni);
    btn.disabled = true; durum("Ekleniyor…");
    jsonKaydet("veri/gezilerim.json", V.gezi, "Düzenleme: yeni yer " + ad).then(function () {
      aktif = null; S.yenidenCiz(); S.detayAc("ilce", ad);
      durum(ad + " eklendi. Şimdi yazı ve fotoğraf ekleyebilirsin.", "iyi");
    }).catch(function (e) {
      liste.pop(); if (eklenenIl) V.gezi.iller.pop();
      btn.disabled = false; durum("Eklenemedi: " + e.message, "hata");
    });
  }

  /* ---------- Yemek / Eser kartları ---------- */
  var KART = {
    yemek: { dosya: "veri/yemeklerim.json", anahtar: "yemekler", baslik: "Yemek", renk: "var(--m1)",
      alanlar: [["ad", "Yemeğin adı"], ["kategori", 'Kategori <small>ör. Tatlı, Ana yemek</small>'], ["ozet", "Kısa açıklama"], ["tarif", 'Tarif <small>isteğe bağlı</small>', "textarea"]] },
    eser: { dosya: "veri/eserlerim.json", anahtar: "eserler", baslik: "Eser", renk: "var(--m2)",
      alanlar: [["ad", "Eserin adı"], ["tur", 'Türü <small>ör. Resim, Yazı</small>'], ["yil", "Yılı"], ["ozet", "Kısa açıklama"], ["baglanti", 'Bağlantı <small>isteğe bağlı</small>']] }
  };
  function kartAc(tur, i) {
    if (aktif && !kapatilabilir()) return;
    vazgec();
    var T = KART[tur], liste = V[tur][T.anahtar], yeni = i == null;
    var k = yeni ? (function () { var o = { foto: "" }; T.alanlar.forEach(function (a) { o[a[0]] = ""; }); return o; })() : liste[i];
    aktif = { tip: "kart", tur: tur, k: k, yeni: yeni, yedek: kopya(k), bekleyen: [], kirli: false };
    kartCiz();
  }
  function kartCiz(mesaj, tur) {
    var a = aktif, T = KART[a.tur], k = a.k;
    S.panelGoster({ renk: T.renk, tur: a.yeni ? "Yeni " + T.baslik.toLocaleLowerCase("tr") : T.baslik, ad: a.yeni ? "Yeni ekle" : (k.ad || "(adsız)"),
      govde: '<div class="duzen-form">' + T.alanlar.map(function (al) { return alan("d-k-" + al[0], al[1], k[al[0]], al[2]); }).join("") +
        "<label>Fotoğraf</label>" + fotoDuzen(a.bekleyen.length ? [] : (k.foto ? [{ src: k.foto }] : []), a.bekleyen, true) +
        kaydetDugmeleri(a.yeni ? "" : "Sil") + "</div>" });
    if (mesaj) durum(mesaj, tur);
  }
  function kartOku() { var a = aktif; KART[a.tur].alanlar.forEach(function (al) { if ($("d-k-" + al[0])) a.k[al[0]] = deger("d-k-" + al[0]); }); }
  function kartKaydet(btn) {
    var a = aktif, T = KART[a.tur]; kartOku();
    if (!a.k.ad) return durum("Bir ad yaz.", "hata");
    btn.disabled = true;
    var once = a.bekleyen.length ? (durum("Fotoğraf yükleniyor…"), fotoYukle(a.bekleyen[0], a.tur + "-" + a.k.ad).then(function (src) { a.k.foto = src; a.bekleyen = []; })) : Promise.resolve();
    var liste = V[a.tur][T.anahtar], eklendi = false;
    once.then(function () {
      if (a.yeni) { liste.push(a.k); eklendi = true; }
      durum("Kaydediliyor…");
      return jsonKaydet(T.dosya, V[a.tur], "Düzenleme: " + T.baslik + " · " + a.k.ad);
    }).then(function () {
      a.yeni = false; a.yedek = kopya(a.k); a.kirli = false;
      S.yenidenCiz(); kartCiz("Kaydedildi. Sitede 1–2 dakika içinde görünür.", "iyi");
    }).catch(function (e) { if (eklendi) liste.pop(); btn.disabled = false; durum("Kaydedilemedi: " + e.message, "hata"); });
  }
  function kartSil(btn) {
    var a = aktif, T = KART[a.tur], liste = V[a.tur][T.anahtar], i = liste.indexOf(a.k);
    if (i < 0 || !confirm("“" + (a.k.ad || "Bu kayıt") + "” silinsin mi?")) return;
    vazgec(); liste.splice(i, 1);
    btn.disabled = true; durum("Siliniyor…");
    jsonKaydet(T.dosya, V[a.tur], "Düzenleme: " + T.baslik + " · " + (a.k.ad || "kayıt") + " silindi").then(function () {
      aktif = null; S.panelKapat(true); S.yenidenCiz();
    }).catch(function (e) { liste.splice(i, 0, a.k); btn.disabled = false; durum("Silinemedi: " + e.message, "hata"); });
  }

  /* ---------- Ben ---------- */
  function benAc() {
    if (aktif && !kapatilabilir()) return;
    vazgec();
    if (!V.ben) V.ben = kopya(BEN_VARSAYILAN);
    aktif = { tip: "ben", k: V.ben, yedek: kopya(V.ben), bekleyen: [], kirli: false };
    benCiz();
  }
  function benCiz(mesaj, tur) {
    var a = aktif;
    S.panelGoster({ renk: "var(--m3)", tur: "Ben sayfası", ad: "Hakkımda",
      govde: '<div class="duzen-form"><label>Fotoğrafım</label>' + fotoDuzen(a.bekleyen.length ? [] : (a.k.foto ? [{ src: a.k.foto }] : []), a.bekleyen, true) +
        alan("d-yazi", 'Kendini anlatan yazı <small>paragrafları boş satırla ayır</small>', a.k.yazi, "textarea", ' style="min-height:220px"') +
        kaydetDugmeleri("") + "</div>" });
    if (mesaj) durum(mesaj, tur);
  }
  function benKaydet(btn) {
    var a = aktif; a.k.yazi = deger("d-yazi");
    btn.disabled = true;
    var once = a.bekleyen.length ? (durum("Fotoğraf yükleniyor…"), fotoYukle(a.bekleyen[0], "ben").then(function (src) { a.k.foto = src; a.bekleyen = []; })) : Promise.resolve();
    once.then(function () {
      durum("Kaydediliyor…");
      var veri = Object.assign({ _nasil: "Ben sayfası. foto: fotoğraf yolu, yazi: paragrafları boş satırla ayır." }, a.k);
      return jsonKaydet("veri/ben.json", veri, "Düzenleme: Ben sayfası güncellendi");
    }).then(function () {
      a.yedek = kopya(a.k); a.kirli = false;
      S.yenidenCiz(); benCiz("Kaydedildi. Sitede 1–2 dakika içinde görünür.", "iyi");
    }).catch(function (e) { btn.disabled = false; durum("Kaydedilemedi: " + e.message, "hata"); });
  }

  /* ---------- Panel olayları ---------- */
  function formuOku() {
    if (!aktif) return;
    if (aktif.tip === "yer") yerFormuOku();
    else if (aktif.tip === "kart") kartOku();
    else if (aktif.tip === "ben" && $("d-yazi")) aktif.k.yazi = deger("d-yazi");
  }
  function yenidenGoster(mesaj, tur) {
    if (aktif.tip === "yer") yerYenile(mesaj, tur);
    else if (aktif.tip === "kart") kartCiz(mesaj, tur);
    else if (aktif.tip === "ben") benCiz(mesaj, tur);
  }
  var govde = $("p-govde");
  govde.addEventListener("input", function (e) {
    if (!aktif) return;
    var t = e.target;
    if (t.dataset.bekleyen != null && aktif.bekleyen) aktif.bekleyen[+t.dataset.bekleyen].aciklama = t.value;
    if (aktif.tip === "yer" || aktif.tip === "kart" || aktif.tip === "ben") kirlet();
  });
  govde.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "d-nerede") {
      $("d-il-kutu").hidden = t.value !== "tr"; $("d-ulke-kutu").hidden = t.value === "tr"; return;
    }
    if (t.id !== "d-dosya" || !t.files.length || !aktif) return;
    var dosyalar = Array.prototype.slice.call(t.files), tek = aktif.tip !== "yer";
    if (tek) dosyalar = dosyalar.slice(0, 1);
    formuOku();
    durum("Fotoğraf hazırlanıyor…");
    Promise.all(dosyalar.map(kucult)).then(function (ler) {
      if (tek) aktif.bekleyen = ler; else ler.forEach(function (f) { aktif.bekleyen.push(f); });
      kirlet();
      yenidenGoster(tek ? "Fotoğraf seçildi. “Kaydet”e basınca yüklenir." : ler.length + " fotoğraf eklendi. İstersen açıklama yaz, sonra “Kaydet”e bas.", "iyi");
    }).catch(function (err) { durum(err.message, "hata"); });
  });
  govde.addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t || !aktif) return;
    if (t.dataset.fsil != null) {
      formuOku();
      if (aktif.tip === "yer") aktif.k.fotograflar.splice(+t.dataset.fsil, 1); else aktif.k.foto = "";
      kirlet(); yenidenGoster("Kaldırmak için “Kaydet”e bas.");
      return;
    }
    if (t.dataset.bsil != null) {
      formuOku(); aktif.bekleyen.splice(+t.dataset.bsil, 1); yenidenGoster(); return;
    }
    var ey = t.dataset.eylem; if (!ey) return;
    if (ey === "kaydet") { if (aktif.tip === "yer") yerKaydet(t); else if (aktif.tip === "kart") kartKaydet(t); else if (aktif.tip === "ben") benKaydet(t); }
    else if (ey === "sil") { if (aktif.tip === "yer") yerSil(t); else if (aktif.tip === "kart") kartSil(t); }
    else if (ey === "il-ekle") ilEkleKaydet(t, aktif.ad);
    else if (ey === "pin-ekle") pinEkleKaydet(t);
    else if (ey === "pin-tekrar") { aktif = null; pinBaslat(); }
  });

  // Kartlar ve "Yeni ekle"
  document.addEventListener("click", function (e) {
    var yeni = e.target.closest && e.target.closest(".kart-ekle[data-yeni]");
    if (yeni) { kartAc(yeni.dataset.yeni, null); return; }
    var kart = e.target.closest && e.target.closest("article.kart[data-tur]");
    if (kart && !e.target.closest("a")) kartAc(kart.dataset.tur, +kart.dataset.i);
  });

  function kapatilabilir() {
    if (!aktif || !aktif.kirli) return true;
    return confirm("Kaydedilmemiş değişikliklerin var. Kaydetmeden kapatılsın mı?");
  }
  function kapandi() { vazgec(); aktif = null; }
  function kaynak(src) { return onizleme[src] || src; }

  window.addEventListener("beforeunload", function (e) {
    if (aktif && aktif.kirli) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ---------- Düzenleme arayüzü ---------- */
  function arayuzKur() {
    document.body.classList.add("duzen-modu");
    document.title = "Düzenle · " + document.title;
    var cubuk = document.createElement("div");
    cubuk.className = "duzen-cubuk";
    cubuk.innerHTML = '<span class="duzen-rozet">✎ Düzenleme modu</span>' +
      '<span class="duzen-ipucu">Bir yere, karta ya da yazıya tıkla, değiştir ve “Kaydet ve yayınla” de.</span>' +
      '<a href="' + location.pathname + '" id="d-ziyaretci" target="_blank" rel="noopener">Ziyaretçi gibi gör ↗</a>' +
      '<button type="button" id="d-cikis">Çıkış</button>';
    document.body.appendChild(cubuk);
    $("d-cikis").addEventListener("click", function () {
      if (!confirm("Bu cihazdan çıkış yapılsın mı? Tekrar girmek için Serhat’ın verdiği bağlantı gerekir.")) return;
      try { localStorage.removeItem(ANAHTAR_KEY); } catch (e) {}
      location.href = location.pathname;
    });

    // Haritaya iğne ekleme
    var lejant = document.querySelector("#gezilerim .lejant");
    var arac = document.createElement("div");
    arac.className = "duzen-arac";
    arac.innerHTML = '<p class="duzen-not">Gittiğin yeni bir ili eklemek için haritada o ile tıkla.</p>' +
      '<button type="button" class="dugme ikincil" id="d-pin">+ İlçe, kasaba ya da yurt dışı şehri ekle</button>' +
      '<div class="konum-not" id="d-pin-not" hidden>Haritada yerin üstüne tıkla. <button type="button" class="metin-dugme" id="d-pin-iptal">Vazgeç</button></div>';
    lejant.parentNode.insertBefore(arac, lejant.nextSibling);
    $("d-pin").addEventListener("click", pinBaslat);
    $("d-pin-iptal").addEventListener("click", pinIptal);

    // Ben düzenle
    var linkler = document.querySelector("#ben .ben-linkler");
    var b = document.createElement("button");
    b.type = "button"; b.className = "dugme"; b.id = "d-ben"; b.textContent = "✎ Fotoğrafı ve yazıyı düzenle";
    linkler.parentNode.insertBefore(b, linkler);
    b.addEventListener("click", benAc);
    $("ben-foto").addEventListener("click", benAc);
  }

  /* ---------- Giriş ---------- */
  function girisGoster(mesaj) {
    var g = $("d-giris");
    if (!g) {
      g = document.createElement("div");
      g.id = "d-giris"; g.className = "giris-perde";
      g.innerHTML = '<div class="giris-kutu duzen-form"><h2>Merhaba Demet</h2>' +
        "<p>Siteyi düzenlemek için Serhat’ın gönderdiği bağlantıya bas. Ya da giriş anahtarını buraya yapıştır; bu cihazda bir kez yeterli.</p>" +
        '<label for="d-anahtar">Giriş anahtarı</label><input id="d-anahtar" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…">' +
        '<div class="satir"><button class="dugme" id="d-giris-dugme">Giriş yap</button><a href="' + location.pathname + '">Siteye dön</a></div>' +
        '<div class="durum" id="d-giris-durum"></div></div>';
      document.body.appendChild(g);
      $("d-giris-dugme").addEventListener("click", girisDene);
      $("d-anahtar").addEventListener("keydown", function (e) { if (e.key === "Enter") girisDene(); });
    }
    g.hidden = false;
    var d = $("d-giris-durum"); d.textContent = mesaj || ""; d.className = "durum" + (mesaj ? " hata" : "");
  }
  function girisDene() {
    anahtar = deger("d-anahtar");
    if (!anahtar) return;
    var d = $("d-giris-durum"); d.className = "durum"; d.textContent = "Kontrol ediliyor…";
    api("").then(function (depo) {
      if (!depo.permissions || !depo.permissions.push) throw new Error("Bu anahtarın bu siteye yazma izni yok.");
      try { localStorage.setItem(ANAHTAR_KEY, anahtar); } catch (e) {}
      $("d-giris").hidden = true; $("d-anahtar").value = "";
      if (basladi) location.reload(); else basla();
    }).catch(function (e) {
      try { localStorage.removeItem(ANAHTAR_KEY); } catch (x) {}
      girisGoster(e.message);
    });
  }

  var basladi = false;
  function basla() {
    if (basladi) return;
    basladi = true;
    arayuzKur();
    S.basla(yukle);
  }

  var DUZEN = window.DUZEN = {
    konumBekliyor: false,
    konumSecildi: konumSecildi,
    yerFormu: yerFormu,
    ilEkle: ilEkle,
    kapatilabilir: kapatilabilir,
    kapandi: kapandi,
    kaynak: kaynak
  };

  if (anahtar) basla(); else girisGoster();
})();
