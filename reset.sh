#!/bin/bash
# Borra TODOS los datos y levanta el sistema desde cero.
# Úsalo antes de cada prueba formal para empezar con cero eventos.

set -e
cd "$(dirname "$0")"

echo ""
echo "========================================="
echo "  Signal Catcher — Clean Reset"
echo "========================================="

echo ""
echo "[1/4] Bajando contenedores y borrando volúmenes..."
docker compose down -v --remove-orphans

echo ""
echo "[2/4] Levantando sistema limpio..."
docker compose up -d

echo ""
echo "[3/4] Esperando que la API esté lista..."
attempt=0
until curl -sf http://localhost:4000/health > /dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ $attempt -gt 60 ]; then
    echo "ERROR: API no respondió después de 60s."
    docker compose logs api
    exit 1
  fi
  printf "."
  sleep 2
done
echo " OK"

echo ""
echo "[4/4] Verificando pipeline..."
RESULT=$(curl -s http://localhost:4000/api/metrics/summary)
echo "  Métricas iniciales: $RESULT"

echo ""
echo "========================================="
echo "  Sistema listo en:"
echo "  API      -> http://localhost:4000"
echo "  Frontend -> http://localhost:8080"
echo "  Grafana  -> http://localhost:3001"
echo "  RabbitMQ -> http://localhost:15672"
echo ""
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
if [ -n "$LAN_IP" ]; then
  echo "  LAN IP   -> $LAN_IP"
  echo "  API LAN  -> http://$LAN_IP:4000"
fi
echo "========================================="
echo ""
echo "Stress test local:"
echo "  node stress.js --tier 1"
echo "  node stress.js --tier 2"
echo "  node stress.js --tier 3"
echo ""
echo "Para exponer externamente (ngrok):"
echo "  ngrok http 4000"
echo "  node stress.js --tier 3 --host https://<tu-url>.ngrok-free.app"
echo ""
