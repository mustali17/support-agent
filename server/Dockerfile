FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
COPY knowledge ./knowledge
ENV NODE_ENV=production
EXPOSE 5000
CMD ["node", "src/index.js"]
