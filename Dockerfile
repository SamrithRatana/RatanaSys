FROM node:18-alpine AS base
# ✅ Add these — required for Prisma on Alpine
RUN apk add --no-cache openssl libc6-compat

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm install sharp
ENV NEXT_TELEMETRY_DISABLED=1

# ✅ Generate Prisma client BEFORE build — separately
RUN npx prisma generate

# ✅ Build without prisma generate in package.json script
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
# ✅ Copy prisma client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]