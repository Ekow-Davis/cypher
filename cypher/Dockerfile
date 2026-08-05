# Cypher share server.
#
# Built from the repository root, not from server/, because the server imports
# the reader and the type definitions out of src/shared — the same files the
# desktop app uses. Setting Railway's root directory to server/ would leave
# those outside the build context, which is what breaks the compile.
#
# Only server/ and src/shared/ are copied, so the desktop app's dependencies
# (Electron and friends) are never installed here.

FROM node:22-slim AS build
WORKDIR /app

COPY server/package.json server/tsconfig.json ./server/
RUN cd server && npm install --no-audit --no-fund

COPY src/shared ./src/shared
COPY server/src ./server/src
RUN cd server && npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

COPY server/package.json ./server/
RUN cd server && npm install --omit=dev --no-audit --no-fund

COPY --from=build /app/server/dist ./server/dist

CMD ["node", "server/dist/index.js"]
