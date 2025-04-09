FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app

COPY . .
COPY --from=deps /app/node_modules ./node_modules
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

COPY --from=builder /app/build ./build
COPY package.json pnpm-lock.yaml ./

COPY data ./data

RUN npm install -g pnpm
RUN pnpm install --prod --frozen-lockfile

USER node

ENV NODE_ENV=production

EXPOSE 8080

CMD ["npm", "start"]