# ARCHITECTURE — Signal Catcher

## 1. System Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                  Client / Stress Tool                        │
└───────────────────────────┬──────────────────────────────────┘
                            │ POST /api/events/{impression|click|conversion}
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                  REST API  (Fastify v4 / Node.js)            │
│  validate schema → publish to exchange → 202 Accepted        │
│  target: < 50 ms p99 (queue write is async, no DB call)      │
└───────────────────────────┬──────────────────────────────────┘
                            │ publish (persistent, direct exchange)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│              RabbitMQ 3.13  —  exchange: events (direct)     │
│                                                              │
│   impressions ──► impressions.dlq  (DLX: events.dlx)        │
│   clicks      ──► clicks.dlq                                 │
│   conversions ──► conversions.dlq                            │
│                                                              │
│  Messages are durable + persistent. Retry: exponential       │
│  backoff (1 s / 2 s / 4 s), max 3 attempts, then → DLQ.     │
└───────────────────────────┬──────────────────────────────────┘
                            │ consume (prefetch 100)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│           Consumer  (Node.js)   —  horizontally scalable     │
│                                                              │
│  Per event:                                                  │
│   • extract dimensional tags (state, advertiser_id,          │
│     campaign_id, ad_id, conversion_type)                     │
│   • extract metrics (count, revenue, time_to_click,          │
│     time_to_convert)                                         │
│   • writeApi.writePoint() — buffered, never flushed per-msg  │
│   • minio.putObject() — partitioned key                      │
│                                                              │
│  InfluxDB flush: batchSize=500 OR flushInterval=1 s          │
└──────────┬────────────────────────────────────┬─────────────┘
           ▼                                    ▼
┌──────────────────────┐          ┌─────────────────────────────┐
│  InfluxDB 2.7 (TSDB) │          │  MinIO  (Object Storage)    │
│  measurement: events │          │  Partition contract:         │
│  tags:               │          │  events/{type}/             │
│    type, state,      │          │    year=YYYY/month=MM/       │
│    advertiser_id,    │          │    day=DD/hour=HH/           │
│    campaign_id,      │          │    {ts}-{rand}.json          │
│    ad_id,            │          │                              │
│    conversion_type   │          │  Queryable via:              │
│  fields:             │          │  GET /api/storage/count      │
│    count, revenue,   │          │  GET /api/storage/list       │
│    time_to_click,    │          └─────────────────────────────┘
│    time_to_convert   │
│  retention: 30 days  │
└──────────┬───────────┘
           ▼
┌──────────────────────────────────────────────────────────────┐
│                    Grafana 10.4                               │
│  • Impressions / Clicks / Conversions per minute (line)      │
│  • CTR % gauge — last hour                                   │
│  • Conversion Rate % gauge — last hour                       │
│  • Top 10 states by impressions — bar, last hour             │
│  • Top 10 advertisers by revenue — bar, last 24h             │
│  • Cumulative counts — stat panels, since start              │
│  Refresh: 10 s  — satisfies ≤ 60 s update requirement        │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Key Decisions & Justification

### Queue — RabbitMQ

- **Why not Kafka**: Kafka is designed for event log replay and multi-consumer fan-out. For this pipeline, each event is processed exactly once by one consumer type; a direct exchange with three durable queues covers the requirement without the operational overhead of managing topics, partitions, and consumer groups.
- **Why not SQS (LocalStack)**: LocalStack adds a dependency on AWS SDK mocking, making the `docker compose up` story harder. RabbitMQ runs natively in Docker and exposes a management API used by the dashboard's Queue Health panel.
- **DLQ design**: Each main queue has `x-dead-letter-exchange` set to `events.dlx`. On consumer failure, messages are re-published with an `x-retry-count` header incremented by the consumer. After 3 attempts (backoffs: 1 s, 2 s, 4 s) the consumer `nack`s with `requeue: false`, routing the message to `{queue}.dlq` via the DLX.
- **Horizontal scaling**: Multiple consumer replicas share the same queue. RabbitMQ's per-channel `prefetch(100)` ensures round-robin distribution without double-counting — each message is delivered to exactly one consumer.

### TSDB — InfluxDB 2.7

- **Why not TimescaleDB**: TimescaleDB requires a PostgreSQL extension and schema migrations. InfluxDB is schema-less (tag/field model) which maps naturally to heterogeneous ad event payloads that may have extra fields. The Flux query language makes window aggregations and group-by-tag queries concise.
- **Why not Prometheus**: Prometheus is a pull-based system designed for infrastructure metrics, not event ingestion. It has no native way to push arbitrary event data at 1000 rps.
- **Batching**: `WriteApi` is configured with `batchSize: 500` and `flushInterval: 1000 ms`. Writing one HTTP request per event at 1000 rps would saturate InfluxDB's write path. Batching reduces HTTP overhead by ~500×.
- **Retention**: 30 days (set via `DOCKER_INFLUXDB_INIT_RETENTION: 30d`). Dashboard queries use `-24h` and `-1h` windows, so 30 days gives ample headroom for historical comparison without unbounded disk growth.

### Object Storage — MinIO

- **Why MinIO over LocalStack S3**: MinIO is the S3-compatible object store that runs in a single container with zero AWS credentials. The API (`minio.putObject`) is wire-compatible with the AWS SDK, making a future migration to S3 a one-line config change.
- **Partition contract**: `events/{event_type}/year=YYYY/month=MM/day=DD/hour=HH/` mirrors AWS Athena/Glue partition pruning conventions. The API exposes `GET /api/storage/count` and `GET /api/storage/list` which read this structure directly, satisfying the requirement that partitions be queryable, not decorative.

---

## 3. Retention Strategy

| Tier | Retention | Rationale |
|---|---|---|
| InfluxDB | 30 days | Dashboards query ≤ 24h windows; 30 days allows trend analysis without unbounded growth |
| MinIO (raw events) | 90 days (lifecycle policy) | Audit trail and re-processing; cold storage after 30 days via MinIO ILM |
| DLQ | Until manual review | Failed events must not be silently discarded; ops team reviews and replays |

---

## 4. AWS Cost Estimate — 1000 rps sustained (SKU-level, $/month)

All prices us-east-1, on-demand, May 2026.

| Service | SKU | Qty | Unit price | Monthly |
|---|---|---|---|---|
| ECS Fargate — API | 2 vCPU × 4 GB × 2 tasks | 730 h | $0.04048/vCPU-h + $0.004445/GB-h | **$144** |
| ECS Fargate — Consumer | 1 vCPU × 2 GB × 2 tasks | 730 h | same rate | **$72** |
| Amazon MQ (RabbitMQ) | `mq.m5.large` single-instance | 730 h | $0.288/h | **$210** |
| EC2 (InfluxDB self-hosted) | `m5.xlarge` (4 vCPU, 16 GB) | 730 h | $0.192/h | **$140** |
| EBS gp3 (InfluxDB data) | 500 GB | 1 month | $0.08/GB-month | **$40** |
| S3 Standard (raw events, 30d) | ~4.3 TB storage | 1 month | $0.023/GB-month | **$100** |
| S3 PUT requests | ~2.6M PUTs/month | — | $0.005/1 000 | **$13** |
| Application Load Balancer | 1 ALB + ~10 LCU | 730 h | $0.008/h + $0.008/LCU-h | **$64** |
| VPC NAT Gateway | 1 NAT + data | 730 h | $0.045/h + $0.045/GB | **$43** |
| CloudWatch Logs | ~50 GB/month | — | $0.50/GB | **$25** |
| **TOTAL** | | | | **≈ $851/month** |

> Note: this does not include Reserved Instance discounts (up to 40% savings for 1-year commit) or Savings Plans.
