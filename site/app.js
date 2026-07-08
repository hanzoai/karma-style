// Karma Bikinis storefront — vanilla JS. Catalog from products.js.
(function () {
  const C = window.KARMA_COLLECTION || [];
  const SIZES = ["XS", "S", "M", "L", "XL"];
  const money = (n) => "$" + n.toLocaleString("en-US");
  const img = (slug, role) => `/img/${slug}/${role}.webp`;
  // Commerce wiring is injected at runtime (see /commerce.js if present).
  const COMMERCE = window.KARMA_COMMERCE || null;

  // ---------- cart (localStorage) ----------
  const KEY = "karma_cart_v1";
  let cart = load();
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } }
  function save() { localStorage.setItem(KEY, JSON.stringify(cart)); renderCart(); }
  function add(slug, size) {
    const p = C.find((x) => x.slug === slug);
    const id = slug + "|" + size;
    const ex = cart.find((i) => i.id === id);
    if (ex) ex.qty++; else cart.push({ id, slug, size, name: p.name, price: p.price, qty: 1 });
    save(); toast(`${p.name} · ${size} added`); openCart();
  }
  function setQty(id, d) {
    const it = cart.find((i) => i.id === id); if (!it) return;
    it.qty += d; if (it.qty <= 0) cart = cart.filter((i) => i.id !== id); save();
  }
  function remove(id) { cart = cart.filter((i) => i.id !== id); save(); }
  const count = () => cart.reduce((s, i) => s + i.qty, 0);
  const total = () => cart.reduce((s, i) => s + i.qty * i.price, 0);

  // ---------- render collection ----------
  const grid = document.getElementById("grid");
  grid.innerHTML = C.map((p) => `
    <article class="card" data-slug="${p.slug}">
      <div class="frame">
        <span class="tag">${p.tag}</span>
        <img class="a" loading="lazy" src="${img(p.slug, "front")}" alt="${p.name}">
        <img class="b" loading="lazy" src="${img(p.slug, "back")}" alt="${p.name} back">
        <div class="quick"><button class="btn" data-quick="${p.slug}">View</button></div>
      </div>
      <div class="meta"><span class="nm">${p.name}</span><span class="pr">${money(p.price)}</span></div>
    </article>`).join("");

  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".card"); if (card) openPD(card.dataset.slug);
  });

  // ---------- lookbook ----------
  const look = document.getElementById("look");
  const shots = [];
  C.forEach((p) => { shots.push(img(p.slug, "life1"), img(p.slug, "editorial"), img(p.slug, "life2")); });
  look.innerHTML = shots.map((s) => `<img loading="lazy" src="${s}" alt="Karma lookbook">`).join("");

  // ---------- product detail ----------
  const pd = document.getElementById("pd");
  let cur = null, size = "M";
  function openPD(slug) {
    const p = C.find((x) => x.slug === slug); if (!p) return;
    cur = p; size = "M";
    document.getElementById("pdGallery").innerHTML =
      p.shots.map((r) => `<img loading="lazy" src="${img(p.slug, r)}" alt="${p.name} ${r}">`).join("");
    document.getElementById("pdInfo").innerHTML = `
      <div class="tag">${p.tag}</div>
      <h3>${p.name}</h3>
      <div class="price">${money(p.price)}</div>
      <p class="desc">${p.blurb}</p>
      <div class="spec">
        <div><span>Fabric</span><span>${p.fabric}</span></div>
        <div><span>Fit</span><span>${p.fit}</span></div>
        <div><span>Ships</span><span>2–4 business days</span></div>
      </div>
      <div class="sizes" id="sizes">${SIZES.map((s) => `<button data-size="${s}" class="${s === "M" ? "sel" : ""}">${s}</button>`).join("")}</div>
      <div class="buys">
        <button class="btn gold" id="addBtn">Add to bag — ${money(p.price)}</button>
        <a class="btn ghost" href="https://tryon.karma.style?design=${p.slug}">Try it on</a>
      </div>
      <div class="trylink">Not sure on fit? <a href="https://tryon.karma.style?design=${p.slug}">See it on your own photo →</a></div>`;
    document.getElementById("sizes").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return; size = b.dataset.size;
      document.querySelectorAll("#sizes button").forEach((x) => x.classList.toggle("sel", x === b));
    });
    document.getElementById("addBtn").addEventListener("click", () => add(p.slug, size));
    pd.classList.add("open"); document.body.style.overflow = "hidden";
    if (window.karmaTrack) window.karmaTrack("view_product", { slug: p.slug });
  }
  function closePD() { pd.classList.remove("open"); document.body.style.overflow = ""; }
  pd.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closePD));

  // ---------- cart drawer ----------
  const cartEl = document.getElementById("cart"), scrim = document.getElementById("cartScrim");
  function openCart() { cartEl.classList.add("open"); scrim.classList.add("open"); }
  function closeCart() { cartEl.classList.remove("open"); scrim.classList.remove("open"); }
  document.getElementById("cartOpen").addEventListener("click", openCart);
  document.getElementById("cartClose").addEventListener("click", closeCart);
  scrim.addEventListener("click", closeCart);
  document.getElementById("menuToggle").addEventListener("click", () =>
    document.getElementById("collection").scrollIntoView({ behavior: "smooth" }));

  function renderCart() {
    document.getElementById("cartCount").textContent = count();
    document.getElementById("cartTotal").textContent = money(total());
    const box = document.getElementById("cartItems");
    if (!cart.length) { box.innerHTML = `<div class="empty">Your bag is empty.</div>`; return; }
    box.innerHTML = cart.map((i) => `
      <div class="ci">
        <img src="${img(i.slug, "front")}" alt="${i.name}">
        <div class="g">
          <div class="n">${i.name}</div>
          <div class="s">Size ${i.size}</div>
          <div class="qty">
            <button data-q="-1" data-id="${i.id}">−</button>
            <span class="mono">${i.qty}</span>
            <button data-q="1" data-id="${i.id}">+</button>
          </div>
        </div>
        <div style="text-align:right">
          <div class="p">${money(i.price * i.qty)}</div>
          <button class="rm" data-rm="${i.id}">remove</button>
        </div>
      </div>`).join("");
    box.querySelectorAll("[data-q]").forEach((b) =>
      b.addEventListener("click", () => setQty(b.dataset.id, +b.dataset.q)));
    box.querySelectorAll("[data-rm]").forEach((b) =>
      b.addEventListener("click", () => remove(b.dataset.rm)));
  }

  // ---------- checkout ----------
  document.getElementById("checkoutBtn").addEventListener("click", async () => {
    if (!cart.length) { toast("Your bag is empty"); return; }
    if (window.karmaTrack) window.karmaTrack("begin_checkout", { value: total() });
    if (COMMERCE && COMMERCE.checkout) {
      try {
        const url = await COMMERCE.checkout(cart);
        if (url) { location.href = url; return; }
      } catch (e) { /* fall through to honest state */ }
    }
    const note = document.getElementById("cartNote");
    note.innerHTML = "Checkout is activating for Karma — we saved your bag. " +
      'Email <a href="mailto:hello@karma.style" style="color:var(--accent)">hello@karma.style</a> to complete your order today.';
    toast("Checkout activating — bag saved");
  });

  // ---------- toast ----------
  let tT;
  function toast(msg) {
    const t = document.getElementById("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(tT); tT = setTimeout(() => t.classList.remove("show"), 2600);
  }

  // deep-link ?design=slug opens the product
  const q = new URLSearchParams(location.search).get("design");
  if (q && C.find((x) => x.slug === q)) openPD(q);

  renderCart();
})();
