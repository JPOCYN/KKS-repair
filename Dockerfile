FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY public ./public
COPY recovery/catalog ./recovery/catalog
RUN mkdir -p /app/data /app/manuals && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
