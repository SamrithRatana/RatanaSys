FROM node:18-slim AS base
RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --ignore-scripts --prefer-offline || npm install --ignore-scripts
RUN npm install --cpu=x64 --os=linux --libc=glibc sharp

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=3072"
ENV NEXT_DISABLE_SOURCEMAPS=1
# ✅ FIX 1: Remove the .babelrc — it disables SWC and makes builds 3x slower
# ✅ FIX 2: Delete any .babelrc that may exist in the repo too
RUN rm -f .babelrc babel.config.js babel.config.json
RUN npx prisma generate
# ✅ FIX 3: Use local next binary instead of npx (faster, no re-download)
RUN ./node_modules/.bin/next build --no-lint

FROM node:18-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# ✅ FIX 4: Copy prisma engine for the correct platform (slim = debian/glibc)
COPY --from=builder /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder /app/node_modules/@img ./node_modules/@img
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]