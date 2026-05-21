FROM node:18-alpine AS base
RUN apk add --no-cache openssl libc6-compat python3 make g++

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --ignore-scripts --prefer-offline || npm install --ignore-scripts

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm rebuild
RUN npm install sharp --ignore-scripts=false

ENV NEXT_TELEMETRY_DISABLED=1
# Increase Node.js memory limit to prevent SIGSEGV during build
ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN npx prisma generate
RUN npx next build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder /app/node_modules/@img ./node_modules/@img
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]