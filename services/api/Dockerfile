FROM node:22-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY services/api ./services/api
RUN npm ci && npm run build -w @scheduling/api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/services/api/dist ./dist
COPY --from=build /workspace/services/api/package.json ./package.json
CMD ["node", "dist/main.js"]
