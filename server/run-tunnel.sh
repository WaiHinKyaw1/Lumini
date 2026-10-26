#!/bin/bash
LOG_FILE="/tmp/tunnel.log"
URL_FILE="/opt/lumini-media-worker/data/tunnel_url.txt"

pkill -f "cloudflared tunnel --url" || true
rm -f "$LOG_FILE"

/usr/local/bin/cloudflared tunnel --url http://127.0.0.1:8080 > "$LOG_FILE" 2>&1 &
PID=$!

for i in {1..30}; do
  TUNNEL_URL=$(grep -o 'https://[-a-zA-Z0-9.]*trycloudflare.com' "$LOG_FILE" | head -n 1)
  if [ -n "$TUNNEL_URL" ]; then
    echo "$TUNNEL_URL" > "$URL_FILE"
    echo "Active Tunnel: $TUNNEL_URL"
    break
  fi
  sleep 1
done

wait $PID
