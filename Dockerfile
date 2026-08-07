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

# Persistent Gateway worker that also exposes a small internal HTTP server
# (POST /dm) for the Planka backend to trigger DMs through.
EXPOSE 4000

ENTRYPOINT ["node", "dist/index.js"]
