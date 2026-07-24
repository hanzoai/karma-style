// Karma checkout — the checkout.js (Stripe-like widget) layer.
//
// Drives the published `checkout.js` global (`window.HanzoCheckout`) to create a
// hosted checkout session at https://api.hanzo.ai/v1/checkout and redirect to it.
// Payment fields live on the cross-origin hosted page, never in the karma DOM —
// so session-replay can never capture card data by construction.
//
// The publishable key is NOT hardcoded: it arrives at runtime from /config.json
// (SPA_CHECKOUT_KEY on the karma-style CR) and is a publishable `pk_live_…` /
// `pk_test_…` key (safe to ship to the browser). No fallback secret.
//
// This layers ON TOP of the existing commerce.js (Square) path in app.js: the
// checkout button prefers this widget when a key is configured, and otherwise
// falls back to the existing flow — nothing is ripped out.
(function () {
  "use strict";
  var client = null;
  var cfg = {};
  var PENDING_KEY = "karma_pending_order";

  function origin() {
    try { return location.origin; } catch (e) { return "https://karma.style"; }
  }

  // cart item -> checkout.js line item. unitPrice is the SMALLEST currency unit
  // (cents) per the checkout.js contract; our catalog price is in dollars.
  function lineItemsOf(cart) {
    return cart.map(function (i) {
      return {
        id: i.slug,
        name: i.name + (i.size ? " · " + i.size : ""),
        unitPrice: Math.round((Number(i.price) || 0) * 100),
        quantity: i.qty || 1
      };
    });
  }

  // GA4 items for the purchase event we fire on return to /thank-you.
  function ga4ItemsOf(cart) {
    return cart.map(function (i) {
      return { item_id: i.slug, item_name: i.name, item_brand: "Karma Bikinis",
               item_category: i.collection || "Swim", item_variant: i.size,
               price: Number(i.price) || 0, quantity: i.qty || 1 };
    });
  }

  var KARMA_CHECKOUT = {
    init: function (config) {
      cfg = config || {};
      try {
        var key = cfg.checkoutKey;
        if (window.HanzoCheckout && key) {
          client = window.HanzoCheckout.create({
            apiKey: key,
            baseUrl: cfg.checkoutHost || "https://api.hanzo.ai",
            currency: "USD",
            appearance: { theme: "light", primaryColor: "#111111" }
          });
        }
      } catch (e) { client = null; }
      return this;
    },

    ready: function () { return !!(client && window.HanzoCheckout); },

    // Stash the order so /thank-you can fire the standard GA4 `purchase` event on
    // return (the canonical order-confirmation pattern), then create the session
    // and redirect to the hosted checkout. Rejects on failure so app.js can fall
    // back to the existing commerce path.
    start: function (cart, opts) {
      opts = opts || {};
      if (!this.ready()) return Promise.reject(new Error("checkout_not_configured"));
      if (!cart || !cart.length) return Promise.reject(new Error("empty_cart"));
      var items = ga4ItemsOf(cart);
      var value = items.reduce(function (s, i) { return s + i.price * i.quantity; }, 0);
      var txn = "karma_" + Date.now();
      try {
        localStorage.setItem(PENDING_KEY, JSON.stringify({
          items: items, value: Math.round(value * 100) / 100, currency: "USD", transaction_id: txn
        }));
      } catch (e) {}
      return client.createSession({
        lineItems: lineItemsOf(cart),
        currency: "USD",
        successUrl: origin() + "/thank-you?ok=1&txn=" + encodeURIComponent(txn),
        cancelUrl: origin() + "/shop",
        metadata: { source: "karma.style", transaction_id: txn }
      }).then(function (session) {
        return client.redirectToCheckout(session);
      });
    },

    // Read + clear the pending order (called by the /thank-you route).
    takePendingOrder: function () {
      try {
        var raw = localStorage.getItem(PENDING_KEY);
        if (!raw) return null;
        localStorage.removeItem(PENDING_KEY);
        return JSON.parse(raw);
      } catch (e) { return null; }
    }
  };
  window.KARMA_CHECKOUT = KARMA_CHECKOUT;
})();
