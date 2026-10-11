FROM node:22-bookworm-slim
WORKDIR /simulator
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY virtual-charge-point.js run-fleet.js ./
CMD ["node", "run-fleet.js"]
