FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fontconfig fonts-noto-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY data/fonts ./data/fonts
RUN mkdir -p /usr/share/fonts/truetype/burmese /app/data/inputs /app/data/outputs \
  && cp data/fonts/* /usr/share/fonts/truetype/burmese/ \
  && fc-cache -f -v

ENV NODE_ENV=production
ENV PORT=8080
ENV MEDIA_DATA_DIR=/app/data
EXPOSE 8080
CMD ["node", "src/index.mjs"]
