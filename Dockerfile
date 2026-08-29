# --- Frontend build ---
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
# Invoke via node directly instead of the npm-run shim: avoids "Permission
# denied" on node_modules/.bin/vite when the Docker storage dir is noexec.
RUN node node_modules/vite/bin/vite.js build

# --- Backend dependencies (native module build) ---
FROM node:20-bookworm-slim AS backend-deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev

# --- Final runtime image ---
FROM node:20-bookworm-slim
WORKDIR /app/backend

# Backend source copied first so it can never clobber the Linux-built
# node_modules below (e.g. if a host node_modules folder leaks into context).
COPY backend/ ./
COPY --from=backend-deps /app/backend/node_modules ./node_modules
COPY --from=frontend-build /app/frontend/dist ./public

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
EXPOSE 3000

# Pre-create the data dir so Docker seeds the named volume with node-owned
# permissions on first mount (the container itself runs as non-root "node").
RUN mkdir -p /app/data && chown -R node:node /app
USER node

CMD ["node", "src/index.js"]
