FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3001

CMD ["sh", "-c", "node scripts/migrate.js && node scripts/seed-data.js && node src/server.js"]
