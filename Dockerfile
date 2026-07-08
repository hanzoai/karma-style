# karma.style — the Karma Bikinis storefront. A self-contained static site
# (no build step, no CDNs) served by the canonical Hanzo static plugin, NOT
# nginx. hanzoai/static listens on :3000; the karma-style Service CR maps
# servicePort 80 -> 3000. --spa rewrites unknown routes to index.html so
# deep-links (?design=…) and client routing resolve.
#
# Built on Hanzo's own hardware (in-cluster BuildKit), never on GitHub builders:
#   buildctl build --frontend=dockerfile.v0 \
#     --opt=context=https://github.com/hanzoai/karma-style.git#<sha> \
#     --opt=filename=Dockerfile --opt=platform=linux/amd64 \
#     --output=type=image,name=ghcr.io/hanzoai/karma-style:<tag>,push=true
FROM ghcr.io/hanzoai/static:0.4.1
COPY site /srv
EXPOSE 3000
ENTRYPOINT ["/static", "--root=/srv", "--spa", "--port=3000"]
