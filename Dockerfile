# Node 24: databasen (node:sqlite) är inbyggd
FROM node:24-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY server ./server
COPY public ./public
# Databasen sparas här (en Docker-volym, så att den överlever uppdateringar)
RUN mkdir -p /data && chown node:node /data

ENV PORT=3000
ENV DATA_DIR=/data
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/server.js"]
