FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:22-alpine AS release
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
RUN npm install --omit=dev

# Persistent Gateway worker, not an HTTP service — no PORT/EXPOSE needed.
ENTRYPOINT ["node", "dist/index.js"]
