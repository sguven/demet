(function () {
  "use strict";
  var SVGNS = "http://www.w3.org/2000/svg";
  var $ = function (id) { return document.getElementById(id); };
  $("yil").textContent = new Date().getFullYear();
  var DUZEN_MODU = /[?&]duzen\b/.test(location.search);

  /* ---------- Sekmeler ---------- */
  var SEKMELER = ["gezilerim", "yemeklerim", "eserlerim", "ben"];
  function sekmeAc() {
    var h = location.hash.replace("#", "");
    if (SEKMELER.indexOf(h) < 0) h = "gezilerim";
    SEKMELER.forEach(function (s) { $(s).hidden = s !== h; });
    document.querySelectorAll(".sekmeler a").forEach(function (a) {
      a.classList.toggle("aktif", a.dataset.sekme === h);
    });
    panelKapat(true);
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", sekmeAc);

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function getJSON(yol) {
    return fetch(yol, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(yol + " " + r.status);
      return r.json();
    });
  }
  // Düzenleme modunda yeni yüklenen fotoğraflar yayına girene kadar önizlemeden gösterilir
  function kaynak(src) { return (window.DUZEN && window.DUZEN.kaynak) ? window.DUZEN.kaynak(src) : src; }
  function paragraflar(metin, ilkSinif) {
    return String(metin || "").split(/\n\s*\n/).filter(function (p) { return p.trim(); }).map(function (p, i) {
      return "<p" + (i === 0 && ilkSinif ? ' class="' + ilkSinif + '"' : "") + ">" + esc(p.trim()).replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }

  /* ---------- Harita ---------- */
  // iller.js ile aynı projeksiyon (enlem/boylam -> SVG koordinatı)
  var C = Math.cos(39 * Math.PI / 180), K = 1000 / ((44.82 - 25.66) * C);
  function proj(lat, lon) { return [(lon - 25.66) * C * K, (42.12 - lat) * K]; }
  function tersProj(x, y) { return [42.12 - y / K, x / (C * K) + 25.66]; }

  var svg = $("harita"), ipucu = $("ipucu"), cerceve = svg.parentNode;
  var dokunmatik = window.matchMedia("(hover: none)").matches;
  var V = { gezi: null, yemek: null, eser: null, ben: null };
  var ilKayit = {}, ilceKayit = {}, ilElem = {}, pinElem = {}, secili = null;

  function haritaKur() {
    var veri = V.gezi;
    ilKayit = {}; ilceKayit = {}; ilElem = {}; pinElem = {};
    svg.setAttribute("viewBox", window.TR_VIEWBOX);
    svg.innerHTML = "";
    var gIl = document.createElementNS(SVGNS, "g");
    var gPin = document.createElementNS(SVGNS, "g");
    svg.appendChild(gIl); svg.appendChild(gPin);

    window.TR_RENK = window.TR_RENK || {};
    veri.iller.forEach(function (k) { ilKayit[k.ad] = k; if (k.renk != null) window.TR_RENK[k.ad] = k.renk; });
    veri.ilceler.forEach(function (k) { ilceKayit[k.ad] = k; });
    (veri.yurtdisi || []).forEach(function (k) { ilceKayit[k.ad] = k; });

    // Yurt dışında gidilen ülkeler (yalnızca gidilenler çizilir)
    var gidilenUlke = {};
    (veri.yurtdisi || []).forEach(function (k) { gidilenUlke[k.ulke] = gidilenUlke[k.ulke] || k.ad; });
    Object.keys(gidilenUlke).forEach(function (ulke) {
      var d = (window.TR_ULKELER || {})[ulke];
      if (!d) return;
      var p = document.createElementNS(SVGNS, "path");
      p.setAttribute("d", d);
      p.setAttribute("class", "il gez ulke r" + renk(ulke));
      p.setAttribute("tabindex", "0");
      p.setAttribute("role", "button");
      p.setAttribute("aria-label", ulke + ", detayları aç");
      p.dataset.ulke = ulke;
      p.dataset.sehir = gidilenUlke[ulke];
      gIl.appendChild(p);
    });

    Object.keys(window.TR_ILLER).forEach(function (ad) {
      var p = document.createElementNS(SVGNS, "path");
      p.setAttribute("d", window.TR_ILLER[ad]);
      p.setAttribute("class", "il");
      p.dataset.ad = ad;
      if (ilKayit[ad]) {
        p.classList.add("gez", "r" + renk(ad));
        p.setAttribute("tabindex", "0");
        p.setAttribute("role", "button");
        p.setAttribute("aria-label", ad + ", detayları aç");
      }
      gIl.appendChild(p);
      ilElem[ad] = p;
    });

    veri.ilceler.concat(veri.yurtdisi || []).forEach(function (k) {
      if (!k.konum) return;
      var xy = proj(k.konum[0], k.konum[1]);
      var g = document.createElementNS(SVGNS, "g");
      g.setAttribute("class", "pin");
      g.setAttribute("transform", "translate(" + xy[0].toFixed(1) + "," + xy[1].toFixed(1) + ")");
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", k.ad + ", detayları aç");
      g.dataset.ilce = k.ad;
      g.innerHTML = '<circle class="vur" r="' + (window.innerWidth < 700 ? 26 : 14) + '"/><circle class="ic" r="5.5"/><text x="8" y="-7">' + esc(k.ad) + "</text>";
      gPin.appendChild(g);
      pinElem[k.ad] = g;
    });
  }

  // Olaylar (bir kez bağlanır)
  svg.addEventListener("mousemove", function (e) {
    var hedef = hedefBul(e.target);
    if (!hedef || dokunmatik) { ipucu.hidden = true; return; }
    var r = cerceve.getBoundingClientRect();
    ipucu.style.left = (e.clientX - r.left) + "px";
    ipucu.style.top = (e.clientY - r.top) + "px";
    ipucu.innerHTML = esc(hedef.ad) + "<small>" + esc(hedef.alt) + "</small>";
    ipucu.hidden = false;
  });
  svg.addEventListener("mouseover", function (e) {
    var t = e.target;
    if (t.classList && t.classList.contains("gez") && !t.dataset.ulke && t.parentNode.lastChild !== t) t.parentNode.appendChild(t);
  });
  svg.addEventListener("mouseleave", function () { ipucu.hidden = true; });
  svg.addEventListener("click", function (e) {
    // Düzenleme: haritada yer seçme modu
    if (window.DUZEN && window.DUZEN.konumBekliyor) {
      var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      var m = svg.getScreenCTM(); if (!m) return;
      var p = pt.matrixTransform(m.inverse());
      var ll = tersProj(p.x, p.y);
      window.DUZEN.konumSecildi(+ll[0].toFixed(4), +ll[1].toFixed(4));
      return;
    }
    var hedef = hedefBul(e.target);
    if (hedef && hedef.ac) hedef.ac();
  });
  svg.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var hedef = hedefBul(e.target);
    if (hedef && hedef.ac) { e.preventDefault(); hedef.ac(); }
  });

  function hedefBul(el) {
    var pin = el.closest && el.closest(".pin");
    if (pin) {
      var k = ilceKayit[pin.dataset.ilce];
      return { ad: k.ad, alt: (k.il || k.ulke) + " · tıkla", ac: function () { detayAc("ilce", k.ad); } };
    }
    if (el.dataset && el.dataset.ulke) {
      var sehir = el.dataset.sehir;
      return { ad: el.dataset.ulke, alt: "Yurt dışı · tıkla", ac: function () { detayAc("ilce", sehir); } };
    }
    if (el.classList && el.classList.contains("il")) {
      var ad = el.dataset.ad;
      if (ilKayit[ad]) return { ad: ad, alt: (ilKayit[ad].ozet || "Gezdim") + " · tıkla", ac: function () { detayAc("il", ad); } };
      if (window.DUZEN) return { ad: ad, alt: "Gittiysen eklemek için tıkla", ac: function () { window.DUZEN.ilEkle(ad); } };
      return { ad: ad, alt: "Sırada" };
    }
    return null;
  }

  var RENKLER = ["var(--m0)", "var(--m1)", "var(--m2)", "var(--m3)", "var(--m4)"];
  function renk(ad) { var r = (window.TR_RENK || {})[ad]; return r == null ? 0 : r; }
  function renkVar(ad) { return RENKLER[renk(ad)]; }

  /* ---------- Yan panel ---------- */
  var panel = $("panel"), perde = $("perde"), sonOdak = null;

  function panelGoster(o) {
    panel.style.setProperty("--p", o.renk || "var(--m0)");
    $("p-tur").textContent = o.tur || "";
    $("p-ad").textContent = o.ad || "";
    $("p-tarih").textContent = o.tarih || "";
    $("p-govde").innerHTML = o.govde || "";
    if (!panel.classList.contains("acik")) sonOdak = document.activeElement;
    perde.hidden = false;
    panel.classList.add("acik");
    panel.setAttribute("aria-hidden", "false");
    panel.scrollTop = 0;
    ipucu.hidden = true;
    $("p-kapat").focus({ preventScroll: true });
  }

  function fotolar(liste) {
    if (!liste || !liste.length) {
      return '<div class="foto-izgara"><div class="foto-yer">Fotoğraf</div><div class="foto-yer">Fotoğraf</div></div>';
    }
    return '<div class="foto-izgara">' + liste.map(function (f) {
      if (typeof f === "string") f = { src: f };
      return '<figure><img loading="lazy" src="' + esc(kaynak(f.src)) + '" alt="' + esc(f.aciklama || "") + '">' +
        (f.aciklama ? "<figcaption>" + esc(f.aciklama) + "</figcaption>" : "") + "</figure>";
    }).join("") + "</div>";
  }

  function yerKaydi(tur, ad) { return tur === "il" ? ilKayit[ad] : ilceKayit[ad]; }
  function yerTuru(tur, k) { return tur === "il" ? "İl" : (k.ulke ? "Yurt dışı · " + k.ulke : "İlçe · " + k.il); }
  function yerRengi(tur, k) { return renkVar(tur === "il" ? k.ad : (k.il || k.ulke)); }

  function detayAc(tur, ad) {
    var k = yerKaydi(tur, ad);
    if (!k) return;
    if (secili) secili.classList.remove("secili");
    secili = tur === "il" ? ilElem[ad] : pinElem[ad];
    if (secili) secili.classList.add("secili");

    var h;
    if (window.DUZEN) {
      h = window.DUZEN.yerFormu(tur, k);
    } else {
      h = "";
      if (k.ozet) h += "<p><strong>" + esc(k.ozet) + "</strong></p>";
      h += paragraflar(k.aciklama);
      if (!k.ozet && !k.aciklama && !(k.fotograflar && k.fotograflar.length)) {
        h += '<div class="bos-not">Bu yer için henüz not yazılmadı. Detaylar yakında burada olacak.</div>';
      }
      h += fotolar(k.fotograflar);
      if (k.etiketler && k.etiketler.length) {
        h += '<div class="etiketler">' + k.etiketler.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div>";
      }
    }
    if (tur === "il") {
      var alt = Object.keys(ilceKayit).filter(function (n) { return ilceKayit[n].il === ad; });
      if (alt.length) {
        h += '<div class="alt-baslik">Bu ilde uğradığım yerler</div><div class="cipler">' +
          alt.map(function (n) { return '<button class="cip ilce" data-ilce="' + esc(n) + '">' + esc(n) + "</button>"; }).join("") + "</div>";
      }
    } else if (ilKayit[k.il]) {
      h += '<div class="alt-baslik">Bağlı olduğu il</div><div class="cipler"><button class="cip" data-il="' + esc(k.il) + '">' + esc(k.il) + "</button></div>";
    }
    panelGoster({ renk: yerRengi(tur, k), tur: yerTuru(tur, k), ad: k.ad, tarih: !window.DUZEN && k.tarih ? "Ziyaret: " + k.tarih : "", govde: h });
  }

  function panelKapat(zorla) {
    if (!panel.classList.contains("acik")) return;
    if (!zorla && window.DUZEN && window.DUZEN.kapatilabilir && !window.DUZEN.kapatilabilir()) return;
    panel.classList.remove("acik");
    panel.setAttribute("aria-hidden", "true");
    perde.hidden = true;
    if (secili) { secili.classList.remove("secili"); secili = null; }
    if (window.DUZEN && window.DUZEN.kapandi) window.DUZEN.kapandi();
    if (sonOdak && sonOdak.focus) sonOdak.focus({ preventScroll: true });
  }

  $("p-kapat").addEventListener("click", function () { panelKapat(); });
  perde.addEventListener("click", function () { panelKapat(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") panelKapat(); });
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button[data-il],button[data-ilce]");
    if (!b) return;
    if (window.DUZEN && window.DUZEN.kapatilabilir && !window.DUZEN.kapatilabilir()) return;
    if (b.dataset.ilce) detayAc("ilce", b.dataset.ilce); else detayAc("il", b.dataset.il);
  });

  /* ---------- Liste ve sayaçlar ---------- */
  function listeKur() {
    var veri = V.gezi;
    var tr = function (a, b) { return a.ad.localeCompare(b.ad, "tr"); };
    var html = veri.iller.slice().sort(tr).map(function (k) {
      return '<button class="cip" style="--r:' + renkVar(k.ad) + '" data-il="' + esc(k.ad) + '">' + esc(k.ad) + "</button>";
    }).concat(veri.ilceler.concat(veri.yurtdisi || []).slice().sort(tr).map(function (k) {
      return '<button class="cip ilce" style="--r:' + renkVar(k.il || k.ulke) + '" data-ilce="' + esc(k.ad) + '">' + esc(k.ad) + "</button>";
    })).join("");
    $("liste").innerHTML = html;
    var ulkeler = {}; (veri.yurtdisi || []).forEach(function (k) { ulkeler[k.ulke] = 1; });
    sayac($("s-il"), veri.iller.length, "");
    sayac($("s-ilce"), veri.ilceler.length, "");
    if ($("s-ulke")) sayac($("s-ulke"), Object.keys(ulkeler).length, "");
    sayac($("s-oran"), Math.round(veri.iller.length / 81 * 100), "%");
  }
  function sayac(el, deger, ek) { el.textContent = (ek === "%" ? "%" : "") + deger; }

  /* ---------- Yemekler / Eserler / Ben ---------- */
  var KARTLAR = {
    yemek: { el: "yemek-izgara", anahtar: "yemekler", ust: function (k) { return k.kategori; } },
    eser: { el: "eser-izgara", anahtar: "eserler", ust: function (k) { return [k.tur, k.yil].filter(Boolean).join(" · "); }, link: "baglanti" }
  };
  function kartlarKur(tur) {
    var K_ = KARTLAR[tur], liste = V[tur][K_.anahtar];
    $(K_.el).innerHTML = liste.map(function (k, i) {
      var foto = k.foto ? '<img loading="lazy" src="' + esc(kaynak(k.foto)) + '" alt="' + esc(k.ad) + '">' : "<span>" + esc((k.ad || "?").charAt(0)) + "</span>";
      var u = K_.ust(k);
      return '<article class="kart" data-tur="' + tur + '" data-i="' + i + '"><div class="kart-foto">' + foto + '</div><div class="kart-ic">' +
        (u ? '<div class="ust-yazi">' + esc(u) + "</div>" : "") +
        "<h3>" + esc(k.ad) + "</h3><p>" + esc(k.ozet) + "</p>" +
        (k.tarif ? '<button class="kart-devam" data-tarif="' + i + '">Tarifi gör →</button>' : "") +
        (K_.link && k[K_.link] ? '<a href="' + esc(k[K_.link]) + '" target="_blank" rel="noopener">Göz at →</a>' : "") +
        "</div></article>";
    }).join("") + (window.DUZEN ? '<button class="kart kart-ekle" data-yeni="' + tur + '"><span>+</span>Yeni ekle</button>' : "");
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-tarif]");
    if (!b || window.DUZEN) return;
    var k = V.yemek.yemekler[+b.dataset.tarif];
    panelGoster({ renk: "var(--m1)", tur: k.kategori || "Tarif", ad: k.ad, govde: (k.foto ? fotolar([{ src: k.foto }]) : "") + paragraflar(k.tarif) });
  });
  function benKur() {
    var b = V.ben;
    if (b.foto) $("ben-foto").src = kaynak(b.foto);
    $("ben-yazi").innerHTML = paragraflar(b.yazi, "giris");
  }

  /* ---------- Başlat ---------- */
  function basla(yukle) {
    sekmeAc();
    yukle("veri/gezilerim.json").then(function (v) {
      v.ilceler = v.ilceler || [];
      V.gezi = v; haritaKur(); listeKur();
    }).catch(function (e) { console.error(e); $("liste").textContent = "Gezi verisi yüklenemedi."; });
    yukle("veri/yemeklerim.json").then(function (v) { V.yemek = v; kartlarKur("yemek"); }).catch(console.error);
    yukle("veri/eserlerim.json").then(function (v) { V.eser = v; kartlarKur("eser"); }).catch(console.error);
    yukle("veri/ben.json").then(function (v) { V.ben = v; benKur(); }).catch(function () {});
  }

  window.SITE = {
    V: V, esc: esc, paragraflar: paragraflar, renkVar: renkVar, basla: basla,
    panelGoster: panelGoster, panelKapat: panelKapat, detayAc: detayAc,
    yerKaydi: yerKaydi, yerRengi: yerRengi,
    yenidenCiz: function () {
      if (V.gezi) { haritaKur(); listeKur(); }
      if (V.yemek) kartlarKur("yemek");
      if (V.eser) kartlarKur("eser");
      if (V.ben) benKur();
    }
  };

  if (DUZEN_MODU) {
    var s = document.createElement("script");
    s.src = "js/duzen.js";
    document.body.appendChild(s);
  } else {
    basla(getJSON);
  }
})();
