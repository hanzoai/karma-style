// Hanzo Commerce integration for the karma store. Prices/inventory/checkout
// are server-authoritative; products.json is the display fallback + image map.
// Config is injected at build time once the karma store + Published storefront
// token exist (browser-safe: Published scope only, org-bound to `karma`).
(function () {
  // Config is read LAZILY (not captured at load) so app.js can populate
  // window.KARMA_COMMERCE_CONFIG from the runtime /config.json (templated by
  // hanzoai/spa from the SPA_COMMERCE_* env on the karma-style CR) BEFORE the
  // first catalog/checkout call. Browser-safe: the token is a Published,
  // org-bound (karma) key — read scope + checkout only, never admin/write.
  function CFG() {
    return window.KARMA_COMMERCE_CONFIG || {
      base: "https://commerce.hanzo.ai",
      store: "",   // <STORE_ID>            (empty = use products.json fallback)
      token: ""    // <Published token>     (empty = catalog display only)
    };
  }
  function ready() { var c = CFG(); return !!(c.store && c.token); }
  function H() { return { Authorization: "Bearer " + CFG().token }; }

  // Load the live catalog (object keyed by slug) -> array; else null (fallback).
  async function loadCatalog() {
    if (!ready()) return null;
    try {
      var c = CFG();
      var r = await fetch(c.base + "/v1/store/" + c.store + "/listing", { headers: H() });
      if (!r.ok) return null;
      var map = await r.json();
      return Object.entries(map).map(function (e) {
        var l = e[1];
        return { slug: e[0], name: l.name, price: (l.price || 0) / 100,
                 image: l.headerImage && l.headerImage.url, description: l.description,
                 available: l.available !== false };
      });
    } catch (e) { return null; }
  }

  // Create a checkout session -> hosted checkout URL. Throws on any failure so
  // the caller can fall back to the honest "checkout activating" state (this is
  // expected until the karma org's Square credentials are added to KMS).
  async function checkout(cart, customer) {
    if (!ready()) throw new Error("commerce_not_configured");
    var items = cart.map(function (i) { return { productSlug: i.slug, quantity: i.qty }; });
    var r = await fetch(CFG().base + "/v1/checkout/sessions", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, H()),
      body: JSON.stringify({
        currency: "usd", items: items, customer: customer || {},
        successUrl: "https://karma.style/thank-you",
        cancelUrl: "https://karma.style/shop"
      })
    });
    if (!r.ok) { var j = await r.json().catch(function () { return {}; });
      throw new Error((j.error && j.error.message) || "checkout_unavailable"); }
    var out = await r.json();
    return out.checkoutUrl;
  }

  window.KARMA_COMMERCE = { ready: ready, loadCatalog: loadCatalog, checkout: checkout };
})();
