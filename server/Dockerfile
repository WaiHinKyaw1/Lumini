FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
RUN mkdir -p /app/data/inputs /app/data/outputs

ENV NODE_ENV=production
ENV PORT=8080
ENV MEDIA_DATA_DIR=/app/data
EXPOSE 8080
CMD ["node", "src/index.mjs"]
