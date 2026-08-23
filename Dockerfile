# karma.style — the Karma Bikinis storefront. A self-contained static SPA
# (no build step, no CDNs) served by the canonical Hanzo SPA server,
# ghcr.io/hanzoai/spa — SPA-mode always on (index.html for every client route,
# NO /index.html redirect: karma.style renders clean at the root), hashed-asset
# immutable caching, pre-compressed .br/.gz, security headers, GET /health, and
# a runtime /config.json templated from SPA_* env (iamHost/apiHost/…) so the one
# bundle takes its IAM login + API hosts from the operator Service CR. Listens
# on :3000; the karma-style Service maps servicePort 80 -> 3000.
#
# Built on Hanzo's own hardware (in-cluster BuildKit), never on GitHub builders:
#   buildctl build --frontend=dockerfile.v0 \
#     --opt=context=https://github.com/hanzoai/karma-style.git#<sha> \
#     --opt=filename=Dockerfile --opt=platform=linux/amd64 \
#     --output=type=image,name=ghcr.io/hanzoai/karma-style:<tag>,push=true

# Type stage. Zen is the one typeface, and it ships inside @hanzo/design
# (package.json pins the range) rather than being committed here — a second
# copy of a font binary is exactly what goes stale when Zen is next cut.
FROM node:24-alpine AS type
WORKDIR /t
COPY package.json ./
RUN npm install --no-audit --no-fund --omit=dev

FROM ghcr.io/hanzoai/spa:1.4.8
# Copied keeping the package's own directory shape: the url() inside fonts.css
# reads "../assets/fonts/Zen-Variable.woff2", so tokens/ and assets/ must stay
# siblings and the stylesheet needs no rewriting. LICENSE-Zen.txt rides along
# with the binaries, which is what the OFL asks for.
COPY --from=type /t/node_modules/@hanzo/design/tokens/fonts.css /public/zen/tokens/fonts.css
COPY --from=type /t/node_modules/@hanzo/design/assets/fonts /public/zen/assets/fonts
COPY site /public
