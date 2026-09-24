# PulseLock on Fly.io — long-running engine (Blur WS + gRPC + dashboard + SSE)
FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public

# node >=24 runs TypeScript natively; engine reads config from env
ENV LOG_EVENTS=0
CMD ["node", "src/index.ts"]
