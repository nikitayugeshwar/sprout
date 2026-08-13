# Sprout API — Express 5 on Node 22.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY api/package.json ./api/
# --omit=dev keeps xlsx, nodemon and mongodb-memory-server out of the image.
# The WHO tables are committed as JSON, so the build script is not needed here.
RUN npm ci --omit=dev --workspace=api --include-workspace-root

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Run unprivileged — the node image ships a suitable user already.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node api ./api
COPY --chown=node:node package.json ./

USER node
EXPOSE 4000

# The platform's own health check should hit /api/v1/health; this one keeps
# `docker run` honest too.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "api/src/index.js"]
