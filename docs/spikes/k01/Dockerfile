FROM node:22-bookworm-slim
WORKDIR /simulator
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY run-fleet.js ./
USER node
CMD ["node", "run-fleet.js"]
