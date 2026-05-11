# Signal Catcher

Real-time ad tracking pipeline — ingest, aggregate, survive.

## Arrancar el sistema

```bash
cp .env.example .env
docker compose up --build
```

La primera vez tarda mientras se construyen las imágenes y pasan los healthchecks (~1-2 min).

## URLs

| Servicio    | URL                                          |
|-------------|----------------------------------------------|
| API         | http://localhost:4000                        |
| Frontend    | http://localhost:8080                        |
| Grafana     | http://localhost:3001 (usuario/pass en .env) |
| RabbitMQ UI | http://localhost:15672                       |
| InfluxDB    | http://localhost:8086                        |
| MinIO       | http://localhost:9001                        |

Comprueba que el sistema responde:
```bash
curl http://localhost:4000/health
```

---

## Resetear a cero antes de una prueba

```bash
./reset.sh
```

Borra todos los volúmenes, levanta limpio y espera hasta que la API responda.

---

## Stress test

### Escenario 1: Misma máquina (local)

```bash
node stress.js --tier 1   # 100 rps × 5 min
node stress.js --tier 2   # 500 rps × 5 min
node stress.js --tier 3   # 1000 rps × 5 min
node stress.js --tier 4   # 2000 rps × 1 min (bonus)
```

### Escenario 2: Red local (mismo WiFi / laboratorio)

1. Obtén tu IP local:
   ```bash
   ipconfig getifaddr en0     # macOS
   hostname -I | awk '{print $1}'  # Linux
   ```

2. Corre el stress desde otra máquina apuntando a esa IP:
   ```bash
   node stress.js --tier 3 --host http://192.168.x.x:4000
   ```

   El servicio escucha en `0.0.0.0:4000`, no se necesita configuración adicional.

### Escenario 3: Acceso remoto (desde internet)

1. Instala ngrok: https://ngrok.com/download
2. Expón el puerto:
   ```bash
   ngrok http 4000
   ```
3. ngrok te da una URL pública (ej: `https://abc123.ngrok-free.app`). Pásala como host:
   ```bash
   node stress.js --tier 3 --host https://abc123.ngrok-free.app
   ```

### Con el stress tool del profesor

El tool del profesor apunta directamente a los endpoints. No hay tokens ni autenticación:

```bash
# Ajusta --host según el escenario
./stress-tool --host http://localhost:4000 --tier 3

# O si el tool acepta URL base, los endpoints son:
#   POST /api/events/impression
#   POST /api/events/click
#   POST /api/events/conversion
```

### Escalar consumers (opcional, para carga extrema)

```bash
docker compose up -d --scale consumer=2
```

---

## Verificar números después de una prueba

```bash
# Totales en InfluxDB (últimas 24h):
curl http://localhost:4000/api/metrics/summary

# Archivos en MinIO (partición hora actual):
curl "http://localhost:4000/api/storage/count?event_type=impressions"
curl "http://localhost:4000/api/storage/count?event_type=clicks"
curl "http://localhost:4000/api/storage/count?event_type=conversions"

# Ver archivos raw en una partición:
curl "http://localhost:4000/api/storage/list?event_type=impressions"
```

---

## API — Endpoints de eventos

### POST /api/events/impression
```json
{
  "impression_id": "imp-uuid-123",
  "user_ip": "192.168.1.1",
  "user_agent": "Mozilla/5.0",
  "timestamp": "2026-05-10T14:30:00Z",
  "state": "CA",
  "search_keywords": "running shoes",
  "session_id": "session-abc123",
  "ads": [{
    "advertiser": { "advertiser_id": "adv-789", "advertiser_name": "Nike Inc." },
    "campaign":   { "campaign_id": "camp-456", "campaign_name": "Fall 2026" },
    "ad": { "ad_id": "ad-123", "ad_name": "Air Max Pro", "ad_text": "...",
            "ad_link": "https://example.com", "ad_position": 1, "ad_format": "banner_728x90" }
  }]
}
```

### POST /api/events/click
```json
{
  "click_id": "click-uuid-456",
  "impression_id": "imp-uuid-123",
  "timestamp": "2026-05-10T14:30:05Z",
  "clicked_ad": {
    "ad_id": "ad-123", "ad_position": 1,
    "click_coordinates": { "x": 250, "y": 400, "normalized_x": 0.65, "normalized_y": 0.80 },
    "time_to_click": 5.2
  },
  "user_info": { "user_ip": "192.168.1.1", "state": "CA", "session_id": "session-abc123" }
}
```

### POST /api/events/conversion
```json
{
  "conversion_id": "conv-uuid-789",
  "click_id": "click-uuid-456",
  "impression_id": "imp-uuid-123",
  "timestamp": "2026-05-10T14:45:00Z",
  "conversion_type": "purchase",
  "conversion_value": 59.99,
  "conversion_currency": "USD",
  "conversion_attributes": { "order_id": "order-xyz987" },
  "attribution_info": { "time_to_convert": 900, "attribution_model": "last_click" },
  "user_info": { "user_ip": "192.168.1.1", "state": "CA", "session_id": "session-abc123" }
}
```

Todos devuelven `202 Accepted` con `{ "accepted": true }`.
