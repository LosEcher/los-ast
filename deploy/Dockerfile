# los-ast API Dockerfile
# Multi-stage build for development and production

# Stage 1: Development (with hot reload)
FROM node:20-alpine AS development

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY packages/api/package*.json ./packages/api/
COPY packages/core/package*.json ./packages/core/
COPY packages/shared/package*.json ./packages/shared/

RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Start with hot reload
CMD ["npm", "run", "dev", "-w", "@los-ast/api"]

# Stage 2: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY packages/api/package*.json ./packages/api/
COPY packages/core/package*.json ./packages/core/
COPY packages/shared/package*.json ./packages/shared/

RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build -w @los-ast/api

# Stage 3: Production
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
COPY packages/api/package*.json ./packages/api/
COPY packages/core/package*.json ./packages/core/
COPY packages/shared/package*.json ./packages/shared/

RUN npm ci --only=production && npm cache clean --force

# Copy built files
COPY --from=builder /app/packages/api/dist ./packages/api/dist
COPY --from=builder /app/packages/core/src ./packages/core/src
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/healthz/live').then(r => r.ok ? process.exit(0) : process.exit(1))"

# Start
CMD ["node", "packages/api/dist/server.js"]
