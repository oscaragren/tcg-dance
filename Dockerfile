# Replaces Railway's default Railpack build (which downloads its driver from GitHub at
# build time) with an explicit image. Same steps Railpack ran: npm install, npm run build,
# npm run start, from /app.
FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_* at build time; Railway passes service variables as build args
# only when they are declared here.
ARG VITE_CARD_ART_BASE_URL
RUN npm run build

CMD ["npm", "run", "start"]
