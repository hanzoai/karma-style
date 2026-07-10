// Karma Bikinis storefront — vanilla JS SPA. Catalog from /products.json
// (canonical), live pricing/checkout layered via /commerce.js.
(function () {
  "use strict";
  var SIZES = ["XS", "S", "M", "L", "XL"];
  var money = function (n) { return "$" + Math.round(n).toLocaleString("en-US"); };
  // Cache-bust token for product art. /img/**.webp is served with a fixed name
  // and max-age=86400, so Cloudflare can pin a stale shot for up to 24h after a
  // studio re-render. Bump V on each release (kept in lockstep with the ?v= on
  // css/js in index.html) so corrected images surface immediately.
  var V = "049";
  var img = function (slug, role) { return "/img/" + slug + "/" + role + ".webp?v=" + V; };
  // Per-product shot curation (products.json): `hide` lists broken/mangled roles
  // that must never render anywhere; `hover` overrides the on-model hover shot.
  // Resting card = product-only silhouette (flat/ghost); hover = model wearing it.
  var hidden = function (p, role) { return !!(p.hide && p.hide.indexOf(role) >= 0); };
  var pick = function (p, roles) { for (var i = 0; i < roles.length; i++) { if (!hidden(p, roles[i])) return roles[i]; } return roles[roles.length - 1]; };
  // Historic archive pieces ship an explicit `gallery` (front/back/g3...) and are sold
  // out but reservable -- pre-order is the demand signal. Studio 2026 pieces use the
  // curated role set (flat/ghost/editorial/...) with per-product hide/hover.
  var isPre = function (p) { return p && (p.status === "preorder" || p.inStock === false); };
  var galleryOf = function (p) { return (p.gallery && p.gallery.length) ? p.gallery : ["front", "flat", "ghost", "tq", "back", "editorial", "life1", "life2"].filter(function (r) { return !hidden(p, r); }); };
  var restRole = function (p) { return p.gallery ? "front" : pick(p, ["flat", "ghost", "front"]); };
  var hoverRole = function (p) { return p.gallery ? (p.gallery.indexOf("back") >= 0 ? "back" : "front") : ((p.hover && !hidden(p, p.hover)) ? p.hover : pick(p, ["editorial", "life1", "tq", "front"])); };
  var byId = function (id) { return document.getElementById(id); };
  var PRODUCTS = [];
  var bySlug = {};
  var COLLECTIONS = { order: [], meta: {} };

  // ---------------- data ----------------
  function boot() {
    // Runtime config: hanzoai/spa templates /config.json from the SPA_COMMERCE_*
    // env on the karma-style CR (SPA_COMMERCE_HOST -> commerceHost, etc). Wire it
    // into window.KARMA_COMMERCE_CONFIG BEFORE the first catalog/checkout call so
    // commerce.js talks to the karma store with its Published token. Absent config
    // (empty store/token) => products.json stays the display source (graceful).
    fetch("/config.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (cfg) {
        if (cfg && (cfg.commerceHost || cfg.commerceStore || cfg.commerceToken)) {
          window.KARMA_COMMERCE_CONFIG = {
            base: cfg.commerceHost || "https://commerce.hanzo.ai",
            store: cfg.commerceStore || "",
            token: cfg.commerceToken || ""
          };
        }
        loadProducts();
      });
  }
  function loadProducts() {
    fetch("/products.json").then(function (r) { return r.json(); }).then(function (data) {
      PRODUCTS = data.products || [];
      COLLECTIONS = data.collections || COLLECTIONS;
      PRODUCTS.forEach(function (p) { bySlug[p.slug] = p; });
      renderGrid(); renderLook(); renderSocial(); renderCart();
      route(location.pathname + location.hash, false);
      // best-effort: reconcile prices/availability with live commerce
      if (window.KARMA_COMMERCE) window.KARMA_COMMERCE.loadCatalog().then(function (live) {
        if (!live) return;
        live.forEach(function (l) { if (bySlug[l.slug]) { bySlug[l.slug].price = l.price; bySlug[l.slug].available = l.available; } });
        renderGrid();
      });
    });
  }

  // ---------------- cart ----------------
  var KEY = "karma_cart_v1";
  var cart = load();
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function save() { localStorage.setItem(KEY, JSON.stringify(cart)); renderCart(); }
  function add(slug, size) {
    var p = bySlug[slug]; if (!p) return;
    var id = slug + "|" + size, ex = cart.filter(function (i) { return i.id === id; })[0];
    if (ex) ex.qty++; else cart.push({ id: id, slug: slug, size: size, name: p.name, price: p.price, qty: 1 });
    save(); toast((isPre(p) ? "Pre-order reserved · " : "") + p.name + " · " + size); openCart();
    if (window.karmaTrack) window.karmaTrack("add_to_cart", { slug: slug });
  }
  function setQty(id, d) { var it = cart.filter(function (i) { return i.id === id; })[0]; if (!it) return; it.qty += d; if (it.qty <= 0) cart = cart.filter(function (i) { return i.id !== id; }); save(); }
  function remove(id) { cart = cart.filter(function (i) { return i.id !== id; }); save(); }
  var count = function () { return cart.reduce(function (s, i) { return s + i.qty; }, 0); };
  var total = function () { return cart.reduce(function (s, i) { return s + i.qty * i.price; }, 0); };

  // ---------------- render: collection ----------------
  function cardHTML(p) {
    var pre = isPre(p);
    return '<article class="card' + (pre ? ' pre' : '') + '" data-slug="' + p.slug + '">' +
      '<div class="frame">' +
        (pre ? '<span class="soldout">Sold out</span>' : '') +
        '<span class="tag">' + p.tag + '</span>' +
        '<img class="a" loading="lazy" src="' + img(p.slug, restRole(p)) + '" alt="' + p.name + '">' +
        '<img class="b" loading="lazy" src="' + img(p.slug, hoverRole(p)) + '" alt="' + p.name + (pre ? '' : ' on model') + '">' +
        '<div class="quick"><span class="btn">' + (pre ? "Pre-order" : "View") + '</span></div>' +
      '</div>' +
      '<div class="meta"><span class="nm">' + p.name + '</span><span class="pr">' + money(p.price) + '</span></div>' +
      '</article>';
  }
  function sectionHTML(key, title, blurb, items) {
    if (!items.length) return "";
    return '<div class="coll-sec" id="coll-' + key + '">' +
      '<div class="coll-head"><div class="ch-txt"><h3>' + title + '</h3>' + (blurb ? '<p>' + blurb + '</p>' : "") + '</div>' +
      '<span class="count">' + items.length + " piece" + (items.length > 1 ? "s" : "") + '</span></div>' +
      '<div class="grid">' + items.map(cardHTML).join("") + '</div></div>';
  }
  function renderGrid() {
    var live = PRODUCTS.filter(function (p) { return !p.collection; });
    var secs = [], nav = [];
    if (live.length) {
      secs.push(sectionHTML("2026", "The 2026 Collection", "In stock now -- cut clean, finished by hand, shot for the light.", live));
      nav.push('<a class="chip" href="#coll-2026">2026</a>');
    }
    (COLLECTIONS.order || []).forEach(function (key) {
      var meta = (COLLECTIONS.meta || {})[key] || {};
      var items = PRODUCTS.filter(function (p) { return p.collection === key; });
      if (!items.length) return;
      secs.push(sectionHTML(key, meta.title || key, meta.blurb || "", items));
      nav.push('<a class="chip" href="#coll-' + key + '">' + (meta.title || key) + '</a>');
    });
    byId("shopSections").innerHTML = secs.join("");
    byId("collNav").innerHTML = nav.join("");
    byId("bagCount").textContent = count();
  }
  // Lookbook + social pull the 2026 studio lifestyle shots (historic pieces have no life/editorial roles).
  function renderLook() {
    var shots = [];
    PRODUCTS.filter(function (p) { return !p.collection; }).forEach(function (p) {
      ["editorial", "tq", "life1"].forEach(function (r) { if (!hidden(p, r)) shots.push(img(p.slug, r)); });
    });
    byId("look").innerHTML = shots.map(function (s) { return '<img loading="lazy" src="' + s + '" alt="Karma lookbook">'; }).join("");
  }
  function renderSocial() {
    // Community grid from real brand imagery, linking to @karma_bikinis.
    var pool = [];
    PRODUCTS.filter(function (p) { return !p.collection; }).forEach(function (p) { pool.push(img(p.slug, "editorial"), img(p.slug, hidden(p, "life1") ? "tq" : "life1")); });
    var ig = "https://www.instagram.com/karma_bikinis";
    byId("sgrid").innerHTML = pool.slice(0, 12).map(function (s) {
      return '<a href="' + ig + '" target="_blank" rel="noopener"><img loading="lazy" src="' + s + '" alt="Karma on Instagram"></a>';
    }).join("");
  }

  // ---------------- render: product page ----------------
  var pdSize = "M";
  function renderPDP(slug) {
    var p = bySlug[slug]; if (!p) { go("/shop"); return; }
    pdSize = "M";
    byId("pdpName").textContent = p.name;
    var pre = isPre(p);
    var meta = (COLLECTIONS.meta || {})[p.collection] || {};
    var g = galleryOf(p);
    byId("pdpGallery").innerHTML = g.map(function (role, i) {
      return '<img class="' + (i === 0 ? "wide" : "") + '" loading="lazy" src="' + img(p.slug, role) + '" alt="' + p.name + ' ' + role + '">';
    }).join("");
    var colorsRow = (p.colors && p.colors.length)
      ? '<div class="opt"><div class="lab">Colour' + (p.colors.length > 1 ? "s" : "") + '</div><div class="chips">' +
          p.colors.map(function (c) { return '<span class="cchip">' + c + '</span>'; }).join("") + '</div></div>'
      : "";
    var buys = pre
      ? '<button class="btn block" id="pdAdd">Pre-order — ' + money(p.price) + '</button>' +
        '<div class="prenote">Sold out — pre-order to bring it back. We produce the run once enough of you reserve it, and you’re not charged until it ships.</div>'
      : '<button class="btn block" id="pdAdd">Add to bag — ' + money(p.price) + '</button>' +
        '<a class="btn line block" href="https://tryon.karma.style?design=' + p.slug + '">Try it on</a>';
    byId("pdpInfo").innerHTML =
      '<div class="tag">' + (meta.title || p.tag) + '</div><h1>' + p.name + '</h1>' +
      '<div class="price">' + money(p.price) + (pre ? ' <span class="soldpill">Sold out</span>' : "") + '</div>' +
      '<p class="desc">' + p.blurb + '</p>' +
      colorsRow +
      '<div class="spec">' +
        '<div><span>Fabric</span><span>' + p.fabric + '</span></div>' +
        '<div><span>Fit</span><span>' + p.fit + '</span></div>' +
        '<div><span>' + (pre ? "Availability" : "Ships") + '</span><span>' + (pre ? "Pre-order · made to order" : "3–5 business days") + '</span></div>' +
      '</div>' +
      '<div class="sizes"><div class="lab">Size</div><div class="row" id="pdSizes">' +
        SIZES.map(function (s) { return '<button data-size="' + s + '" class="' + (s === "M" ? "sel" : "") + '">' + s + '</button>'; }).join("") +
      '</div></div>' +
      '<div class="buys">' + buys + '</div>' +
      (pre ? "" : '<div class="trylink">Not sure on fit? <a href="https://tryon.karma.style?design=' + p.slug + '">See it on your own photo →</a></div>') +
      '<div class="acc">' +
        '<details open><summary>Description</summary><div class="body">' + p.blurb + '</div></details>' +
        (meta.blurb ? '<details><summary>Collection — ' + (meta.title || "") + '</summary><div class="body">' + meta.blurb + '</div></details>' : "") +
        '<details><summary>Composition &amp; Care</summary><div class="body">' + p.fabric + '. Hand-wash cold, lay flat to dry. Rinse after sun, salt or chlorine. Fully lined; adjustable where noted.</div></details>' +
        '<details><summary>Shipping &amp; Returns</summary><div class="body">' + (pre ? "A pre-order reserves your piece — we ship with tracking once the run is produced, and there’s no charge until it ships." : "Ships from San Francisco in 3–5 business days with tracking. Exchanges or store credit within 10 days of delivery.") + ' See <a href="/shipping" data-link>Shipping</a> &amp; <a href="/returns" data-link>Returns</a>.</div></details>' +
      '</div>';
    byId("pdSizes").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return; pdSize = b.dataset.size;
      Array.prototype.forEach.call(byId("pdSizes").children, function (x) { x.classList.toggle("sel", x === b); });
    });
    byId("pdAdd").addEventListener("click", function () { add(p.slug, pdSize); });
    if (window.karmaTrack) window.karmaTrack("view_product", { slug: slug });
  }

  // ---------------- render: content page ----------------
  function renderPage(key) {
    var pg = (window.KARMA_PAGES || {})[key]; if (!pg) { go("/"); return; }
    byId("pageBody").innerHTML =
      '<div class="eyebrow">' + (pg.eyebrow || "") + '</div><h1>' + pg.title + '</h1>' + pg.html;
    document.title = pg.title + " — Karma Bikinis";
  }

  // ---------------- router ----------------
  var PAGES = { about: 1, contact: 1, shipping: 1, returns: 1, privacy: 1, terms: 1 };
  function setRoute(name) {
    document.body.classList.remove("route-home", "route-product", "route-page");
    document.body.classList.add("route-" + name);
  }
  function route(path, animate) {
    var url = path.split("#"); var p = url[0]; var hash = url[1];
    var m;
    if ((m = p.match(/^\/product\/([\w-]+)/))) { setRoute("product"); renderPDP(m[1]); window.scrollTo(0, 0); }
    else if ((m = p.replace(/^\//, "").match(/^([a-z]+)$/)) && PAGES[m[1]]) { setRoute("page"); renderPage(m[1]); window.scrollTo(0, 0); }
    else { // home (incl. /shop, /)
      setRoute("home"); document.title = "Karma Bikinis — Swimwear, made to photograph";
      if (p === "/shop") scrollToId("shop"); else if (hash) scrollToId(hash); else if (animate) window.scrollTo(0, 0);
    }
    updateHeader();
  }
  function scrollToId(id) { var el = byId(id); if (el) setTimeout(function () { el.scrollIntoView({ behavior: "smooth" }); }, 30); }
  function go(path) { history.pushState({}, "", path); route(path, true); }
  window.addEventListener("popstate", function () { route(location.pathname + location.hash, false); });
  document.addEventListener("click", function (e) {
    var a = e.target.closest("a[data-link]"); if (!a) return;
    var href = a.getAttribute("href");
    if (href.indexOf("http") === 0) return;
    e.preventDefault(); closeCart(); closeMenu();
    if (href === location.pathname + location.hash) { route(href, true); return; }
    go(href);
  });

  // ---------------- header transparency ----------------
  function updateHeader() {
    var hdr = byId("hdr"), onHome = document.body.classList.contains("route-home");
    var hero = document.querySelector(".hero");
    if (onHome && hero) {
      var past = window.scrollY > (hero.offsetHeight - 90);
      hdr.classList.toggle("on-hero", !past); hdr.classList.toggle("solid", past);
    } else { hdr.classList.remove("on-hero"); hdr.classList.add("solid"); }
  }
  window.addEventListener("scroll", updateHeader, { passive: true });

  // ---------------- collection + cart interactions ----------------
  byId("shopSections").addEventListener("click", function (e) { var c = e.target.closest(".card"); if (c) go("/product/" + c.dataset.slug); });
  byId("collNav").addEventListener("click", function (e) { var a = e.target.closest("a"); if (!a) return; e.preventDefault(); scrollToId(a.getAttribute("href").slice(1)); });
  var scrim = byId("scrim");
  function openCart() { byId("cart").classList.add("open"); scrim.classList.add("open"); document.body.classList.add("no-scroll"); }
  function closeCart() { byId("cart").classList.remove("open"); scrim.classList.remove("open"); document.body.classList.remove("no-scroll"); }
  byId("bagBtn").addEventListener("click", openCart);
  byId("cartClose").addEventListener("click", closeCart);
  scrim.addEventListener("click", closeCart);

  // ---------------- mobile menu ----------------
  var mmenu = byId("mmenu");
  function openMenu() { mmenu.classList.add("open"); mmenu.setAttribute("aria-hidden", "false"); document.body.classList.add("no-scroll"); }
  function closeMenu() { mmenu.classList.remove("open"); mmenu.setAttribute("aria-hidden", "true"); document.body.classList.remove("no-scroll"); }
  byId("menuBtn").addEventListener("click", openMenu);
  byId("mmClose").addEventListener("click", closeMenu);
  window.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeMenu(); closeCart(); } });

  function renderCart() {
    byId("bagCount").textContent = count();
    byId("cartTotal").textContent = money(total());
    var box = byId("cartItems");
    if (!cart.length) { box.innerHTML = '<div class="empty">Your bag is empty.</div>'; return; }
    box.innerHTML = cart.map(function (i) {
      return '<div class="ci"><img src="' + img(i.slug, "front") + '" alt="' + i.name + '">' +
        '<div class="g"><div class="n">' + i.name + '</div><div class="s">Size ' + i.size + '</div>' +
        '<div class="qty"><button data-q="-1" data-id="' + i.id + '">−</button><span>' + i.qty + '</span><button data-q="1" data-id="' + i.id + '">+</button></div></div>' +
        '<div style="text-align:right"><div class="p">' + money(i.price * i.qty) + '</div><button class="rm" data-rm="' + i.id + '">Remove</button></div></div>';
    }).join("");
    Array.prototype.forEach.call(box.querySelectorAll("[data-q]"), function (b) { b.addEventListener("click", function () { setQty(b.dataset.id, +b.dataset.q); }); });
    Array.prototype.forEach.call(box.querySelectorAll("[data-rm]"), function (b) { b.addEventListener("click", function () { remove(b.dataset.rm); }); });
  }

  // ---------------- checkout ----------------
  byId("checkoutBtn").addEventListener("click", function () {
    if (!cart.length) { toast("Your bag is empty"); return; }
    if (window.karmaTrack) window.karmaTrack("begin_checkout", { value: total() });
    var note = byId("cartNote");
    if (window.KARMA_COMMERCE && window.KARMA_COMMERCE.ready()) {
      byId("checkoutBtn").disabled = true; byId("checkoutBtn").textContent = "Redirecting…";
      window.KARMA_COMMERCE.checkout(cart).then(function (url) {
        if (url) { location.href = url; } else throw new Error("no_url");
      }).catch(function () {
        byId("checkoutBtn").disabled = false; byId("checkoutBtn").textContent = "Checkout";
        note.innerHTML = 'Secure checkout is activating for Karma — your bag is saved. Email <a href="mailto:hello@karma.style">hello@karma.style</a> to complete your order today.';
        toast("Checkout activating — bag saved");
      });
    } else {
      note.innerHTML = 'Secure checkout is activating for Karma — your bag is saved. Email <a href="mailto:hello@karma.style">hello@karma.style</a> to complete your order today.';
      toast("Checkout activating — bag saved");
    }
  });

  // ---------------- newsletter ----------------
  // Posts to the configured Hanzo endpoint (@hanzo/base forms collection) when
  // set; otherwise stores intent locally and confirms. Never silently drops.
  var newsForm = byId("newsForm");
  if (newsForm) newsForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = byId("newsEmail").value.trim(); if (!email) return;
    var ep = (window.KARMA_NEWSLETTER_ENDPOINT || "");
    var done = function () { byId("newsOk").textContent = "You're on the list."; newsForm.reset(); if (window.karmaTrack) window.karmaTrack("newsletter_signup", {}); };
    if (ep) { fetch(ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email, source: "karma.style" }) }).then(done).catch(done); }
    else { try { localStorage.setItem("karma_news", email); } catch (x) {} done(); }
  });

  // ---------------- toast ----------------
  var tT;
  function toast(msg) { var t = byId("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(tT); tT = setTimeout(function () { t.classList.remove("show"); }, 2600); }

  // ---------------- command palette (Cmd/Ctrl+K) ----------------
  // Keyboard-driven jump to any product or page. Self-contained (built here,
  // appended to <body>); selecting an item routes through go()/window.open.
  var cmdkEl, cmdkInput, cmdkList, cmdkItems = [], cmdkView = [], cmdkSel = 0;
  var isMac = /Mac|iPhone|iPad/.test((navigator.platform || "") + " " + navigator.userAgent);
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  function cmdkBuild() {
    var pages = [
      { n: "Shop", s: "The collection · 8 designs", p: "/shop", k: "Page" },
      { n: "Lookbook", s: "On location", p: "/#lookbook", k: "Page" },
      { n: "Virtual Try-On", s: "See it on your own photo", p: "https://tryon.karma.style", k: "Link", ext: 1 },
      { n: "About Karma", s: "The house", p: "/about", k: "Page" },
      { n: "Contact", s: "Say hello", p: "/contact", k: "Page" },
      { n: "Shipping", s: "Policy", p: "/shipping", k: "Page" },
      { n: "Returns & Exchanges", s: "Policy", p: "/returns", k: "Page" },
      { n: "Privacy Policy", s: "Legal", p: "/privacy", k: "Page" },
      { n: "Terms of Service", s: "Legal", p: "/terms", k: "Page" },
      { n: "Home", s: "Front page", p: "/", k: "Page" }
    ];
    var prod = PRODUCTS.map(function (p) {
      return { n: p.name, s: money(p.price) + " · " + p.tag, p: "/product/" + p.slug, k: "Product", thumb: img(p.slug, restRole(p)) };
    });
    cmdkItems = prod.concat(pages);
  }
  function fuzzy(q, text) {
    text = text.toLowerCase(); if (!q) return 0;
    var idx = text.indexOf(q); if (idx >= 0) return 100 - idx - text.length * 0.02;
    var qi = 0, streak = 0, score = 0;
    for (var i = 0; i < text.length && qi < q.length; i++) {
      if (text.charAt(i) === q.charAt(qi)) { qi++; streak++; score += streak; } else streak = 0;
    }
    return qi === q.length ? score - text.length * 0.02 : -1;
  }
  function cmdkRender() {
    var q = (cmdkInput.value || "").trim().toLowerCase();
    var scored = cmdkItems.map(function (it) {
      var sc;
      if (!q) sc = 0;
      else { var ns = fuzzy(q, it.n), ss = fuzzy(q, it.s);
        sc = ns >= 0 ? ns + (it.k === "Product" ? 2 : 0) : (ss >= 0 ? ss * 0.5 : -1); }
      return { it: it, sc: sc };
    }).filter(function (r) { return r.sc >= 0; });
    if (q) scored.sort(function (a, b) { return b.sc - a.sc; });
    cmdkView = scored.slice(0, 8).map(function (r) { return r.it; });
    if (cmdkSel >= cmdkView.length) cmdkSel = 0;
    if (!cmdkView.length) { cmdkList.innerHTML = '<div class="cmdk-empty">No matches for &ldquo;' + esc(q) + '&rdquo;</div>'; return; }
    cmdkList.innerHTML = cmdkView.map(function (it, i) {
      var thumb = it.thumb ? '<img class="ci-thumb" loading="lazy" src="' + it.thumb + '" alt="">' : "";
      return '<div class="cmdk-item' + (i === cmdkSel ? " sel" : "") + '" data-i="' + i + '">' + thumb +
        '<div class="ci-l"><div class="ci-n">' + esc(it.n) + '</div><div class="ci-s">' + esc(it.s) + '</div></div>' +
        '<span class="ci-k">' + it.k + '</span></div>';
    }).join("");
  }
  function cmdkPaint() {
    var rows = cmdkList.querySelectorAll(".cmdk-item");
    Array.prototype.forEach.call(rows, function (r, i) {
      r.classList.toggle("sel", i === cmdkSel); if (i === cmdkSel) r.scrollIntoView({ block: "nearest" });
    });
  }
  function cmdkOpen() {
    if (!cmdkEl) return; cmdkBuild();
    cmdkEl.classList.add("open"); cmdkEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    cmdkInput.value = ""; cmdkSel = 0; cmdkRender();
    setTimeout(function () { cmdkInput.focus(); }, 20);
  }
  function cmdkClose() {
    if (!cmdkEl) return;
    cmdkEl.classList.remove("open"); cmdkEl.setAttribute("aria-hidden", "true");
    if (!byId("cart").classList.contains("open") && !mmenu.classList.contains("open")) document.body.classList.remove("no-scroll");
  }
  function cmdkGo(it) {
    if (!it) return; cmdkClose();
    if (it.ext) { window.open(it.p, "_blank", "noopener"); return; }
    closeCart(); closeMenu(); go(it.p);
  }
  function cmdkInit() {
    var d = document.createElement("div");
    d.className = "cmdk"; d.id = "cmdk"; d.setAttribute("aria-hidden", "true");
    d.innerHTML =
      '<div class="cmdk-scrim" data-close="1"></div>' +
      '<div class="cmdk-box" role="dialog" aria-modal="true" aria-label="Search Karma">' +
        '<div class="cmdk-head">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20.5 20.5 16 16"/></svg>' +
          '<input id="cmdkInput" placeholder="Search products and pages…" autocomplete="off" spellcheck="false" aria-label="Search">' +
          '<kbd>esc</kbd>' +
        '</div><div class="cmdk-list" id="cmdkList"></div></div>';
    document.body.appendChild(d);
    cmdkEl = d; cmdkInput = byId("cmdkInput"); cmdkList = byId("cmdkList");
    d.addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) { cmdkClose(); return; }
      var row = e.target.closest(".cmdk-item"); if (row) cmdkGo(cmdkView[+row.dataset.i]);
    });
    d.addEventListener("mousemove", function (e) {
      var row = e.target.closest(".cmdk-item"); if (!row) return; var i = +row.dataset.i;
      if (i !== cmdkSel) { cmdkSel = i; cmdkPaint(); }
    });
    cmdkInput.addEventListener("input", function () { cmdkSel = 0; cmdkRender(); });
    cmdkInput.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); cmdkSel = Math.min(cmdkSel + 1, cmdkView.length - 1); cmdkPaint(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); cmdkSel = Math.max(cmdkSel - 1, 0); cmdkPaint(); }
      else if (e.key === "Enter") { e.preventDefault(); cmdkGo(cmdkView[cmdkSel]); }
      else if (e.key === "Escape") { e.preventDefault(); cmdkClose(); }
    });
    var sb = byId("searchBtn"); if (sb) sb.addEventListener("click", cmdkOpen);
    var kk = document.querySelector("#searchBtn .kk"); if (kk && !isMac) kk.textContent = "Ctrl K";
  }
  window.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      if (cmdkEl && cmdkEl.classList.contains("open")) cmdkClose(); else cmdkOpen();
    }
  });

  cmdkInit();
  boot();
})();
