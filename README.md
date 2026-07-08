# karma.style

The Karma Bikinis storefront — a fast, self-contained static site (no build
step, no CDNs) served by the canonical Hanzo static plugin (`hanzoai/static`).

- `site/` — the whole site (`index.html`, `style.css`, `app.js`, `products.js`,
  `img/`, `fonts/`). The 2026 collection: eight designs, each shot front / back /
  three-quarter / flat / ghost / lifestyle / editorial.
- `Dockerfile` — `FROM ghcr.io/hanzoai/static` + `COPY site /srv`, `--spa`, `:3000`.
- `hanzo.yml` — canonical CI/CD (builds `ghcr.io/hanzoai/karma-style`, rolls the
  `karma-style` Service CR at `karma.style` + `www.karma.style`).

Storefront cart is client-side (localStorage); catalog display is `products.js`.
Commerce (catalog/checkout), analytics, and the AI concierge widget layer on at
runtime via injected snippets. Virtual try-on lives at `tryon.karma.style`.
