# Dependencies, shared by the dev server and the build. Runs as "node" (uid 1000) so the
# dev container can work in the mounted sources without leaving root-owned files behind.
FROM node:24-alpine AS deps
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Dev server with hot reload. Compose mounts the sources over /app (profile "dev").
FROM deps AS dev
EXPOSE 5180
CMD ["npx", "vite", "--host", "0.0.0.0"]

# Typecheck, tests, then the single-file build: a red test stops the image.
FROM deps AS build
COPY --chown=node:node . .
RUN npm test && npm run build

# The whole app is one HTML file; nginx serves it without root.
FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/index.html /usr/share/nginx/html/index.html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO /dev/null http://127.0.0.1:8080/healthz || exit 1
