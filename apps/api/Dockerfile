FROM node:20-slim

WORKDIR /app

# Install from workspace root so npm workspaces resolve correctly.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json

RUN npm ci

COPY apps/api apps/api

RUN npm run build -w apps/api

ENV NODE_ENV=production
ENV PORT=8787

EXPOSE 8787

CMD ["npm", "run", "start", "-w", "apps/api"]

