# Stage 1 — Build frontend
FROM node:20-slim AS frontend

WORKDIR /build

COPY client/package.json client/package-lock.json ./
RUN npm ci

COPY client/ .
RUN npm run build

# Stage 2 — Production
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server/ server/
COPY system-prompt.md .
COPY knowledge/ knowledge/
COPY vector-index.json .

# Frontend build from Stage 1
COPY --from=frontend /build/dist client/dist/

# Persistent directories
RUN mkdir -p /app/data /app/uploads

ENV NODE_ENV=production

EXPOSE 3080

CMD ["node", "server/index.js"]
