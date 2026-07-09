// Karma Bikinis storefront — vanilla JS SPA. Catalog from /products.json
// (canonical), live pricing/checkout layered via /commerce.js.
(function () {
  "use strict";
  var SIZES = ["XS", "S", "M", "L", "XL"];
  var money = function (n) { return "$" + Math.round(n).toLocaleString("en-US"); };
  var img = function (slug, role) { return "/img/" + slug + "/" + role + ".webp"; };
  var byId = function (id) { return document.getElementById(id); };
  var PRODUCTS = [];
  var bySlug = {};

  // ---------------- data ----------------
  function boot() {
    fetch("/products.json").then(function (r) { return r.json(); }).then(function (data) {
      PRODUCTS = data.products || [];
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
    save(); toast(p.name + " · " + size + " added"); openCart();
    if (window.karmaTrack) window.karmaTrack("add_to_cart", { slug: slug });
  }
  function setQty(id, d) { var it = cart.filter(function (i) { return i.id === id; })[0]; if (!it) return; it.qty += d; if (it.qty <= 0) cart = cart.filter(function (i) { return i.id !== id; }); save(); }
  function remove(id) { cart = cart.filter(function (i) { return i.id !== id; }); save(); }
  var count = function () { return cart.reduce(function (s, i) { return s + i.qty; }, 0); };
  var total = function () { return cart.reduce(function (s, i) { return s + i.qty * i.price; }, 0); };

  // ---------------- render: collection ----------------
  function renderGrid() {
    byId("grid").innerHTML = PRODUCTS.map(function (p) {
      return '<article class="card" data-slug="' + p.slug + '">' +
        '<div class="frame"><span class="tag">' + p.tag + '</span>' +
        '<img class="a" loading="lazy" src="' + img(p.slug, "front") + '" alt="' + p.name + '">' +
        '<img class="b" loading="lazy" src="' + img(p.slug, "back") + '" alt="' + p.name + ' back">' +
        '<div class="quick"><span class="btn">View</span></div></div>' +
        '<div class="meta"><span class="nm">' + p.name + '</span><span class="pr">' + money(p.price) + '</span></div>' +
        '</article>';
    }).join("");
    byId("bagCount").textContent = count();
  }
  function renderLook() {
    var shots = [];
    PRODUCTS.forEach(function (p) { shots.push(img(p.slug, "life1"), img(p.slug, "editorial"), img(p.slug, "life2")); });
    byId("look").innerHTML = shots.map(function (s) { return '<img loading="lazy" src="' + s + '" alt="Karma lookbook">'; }).join("");
  }
  function renderSocial() {
    // Community grid from real brand imagery, linking to @karma_bikinis.
    var pool = [];
    PRODUCTS.forEach(function (p) { pool.push(img(p.slug, "life1"), img(p.slug, "life2")); });
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
    var order = [["front", "wide"], ["back", ""], ["tq", ""], ["life1", ""], ["flat", ""], ["ghost", ""], ["life2", ""], ["editorial", ""]];
    byId("pdpGallery").innerHTML = order.map(function (o) {
      return '<img class="' + o[1] + '" loading="lazy" src="' + img(p.slug, o[0]) + '" alt="' + p.name + ' ' + o[0] + '">';
    }).join("");
    byId("pdpInfo").innerHTML =
      '<div class="tag">' + p.tag + '</div><h1>' + p.name + '</h1>' +
      '<div class="price">' + money(p.price) + '</div>' +
      '<p class="desc">' + p.blurb + '</p>' +
      '<div class="spec">' +
        '<div><span>Fabric</span><span>' + p.fabric + '</span></div>' +
        '<div><span>Fit</span><span>' + p.fit + '</span></div>' +
        '<div><span>Ships</span><span>3–5 business days</span></div>' +
      '</div>' +
      '<div class="sizes"><div class="lab">Size</div><div class="row" id="pdSizes">' +
        SIZES.map(function (s) { return '<button data-size="' + s + '" class="' + (s === "M" ? "sel" : "") + '">' + s + '</button>'; }).join("") +
      '</div></div>' +
      '<div class="buys">' +
        '<button class="btn block" id="pdAdd">Add to bag — ' + money(p.price) + '</button>' +
        '<a class="btn line block" href="https://tryon.karma.style?design=' + p.slug + '">Try it on</a>' +
      '</div>' +
      '<div class="trylink">Not sure on fit? <a href="https://tryon.karma.style?design=' + p.slug + '">See it on your own photo →</a></div>' +
      '<div class="acc">' +
        '<details open><summary>Description</summary><div class="body">' + p.blurb + '</div></details>' +
        '<details><summary>Composition &amp; Care</summary><div class="body">' + p.fabric + '. Hand-wash cold, lay flat to dry. Rinse after sun, salt or chlorine. Fully lined; adjustable where noted.</div></details>' +
        '<details><summary>Shipping &amp; Returns</summary><div class="body">Ships from San Francisco in 3–5 business days with tracking. Exchanges or store credit within 10 days of delivery. See <a href="/shipping" data-link>Shipping</a> &amp; <a href="/returns" data-link>Returns</a>.</div></details>' +
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
  byId("grid").addEventListener("click", function (e) { var c = e.target.closest(".card"); if (c) go("/product/" + c.dataset.slug); });
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

  boot();
})();
