FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src/ ./src/
COPY tsconfig.json ./
RUN npm install typescript --save-dev && npx tsc && npm uninstall typescript
EXPOSE 3000
CMD ["node", "dist/server.js"]
