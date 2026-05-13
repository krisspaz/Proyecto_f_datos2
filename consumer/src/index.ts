import amqp, { Channel, Message } from 'amqplib';
import { InfluxDB, Point, WriteApi } from '@influxdata/influxdb-client';
import { Client as MinioClient } from 'minio';
import Redis from 'ioredis';

const EXCHANGE = 'events';
const DLX      = 'events.dlx';
const QUEUES   = ['impressions', 'clicks', 'conversions'] as const;
type QueueName = (typeof QUEUES)[number];
type Payload   = Record<string, unknown>;

const MAX_RETRIES      = 3;
const MINIO_BATCH_SIZE = 100;
const MINIO_FLUSH_MS   = 1000;
const PREFETCH_PER_Q   = 500;

// ── Redis — shared attribution cache across all consumer replicas ─────────────
const redis = new Redis(process.env.REDIS_URL ?? 'redis://redis:6379', {
  maxRetriesPerRequest: 1,
  enableReadyCheck: false,
});
redis.on('error', (e) => console.error('[redis] error:', e.message));

// ── Per-minute aggregator ─────────────────────────────────────────────────────
const aggCounts: Record<QueueName, number> = { impressions: 0, clicks: 0, conversions: 0 };
let aggWindowStart = Math.floor(Date.now() / 60_000) * 60_000;

function flushAggCounts(): void {
  const windowTs = new Date(aggWindowStart);
  for (const q of QUEUES) {
    if (aggCounts[q] > 0) {
      writeApi.writePoint(
        new Point('events_agg')
          .tag('type', q)
          .intField('count', aggCounts[q])
          .timestamp(windowTs)
      );
      aggCounts[q] = 0;
    }
  }
  aggWindowStart = Math.floor(Date.now() / 60_000) * 60_000;
}

setInterval(flushAggCounts, 60_000);

// ── InfluxDB ──────────────────────────────────────────────────────────────────
const influx = new InfluxDB({
  url:   process.env.INFLUXDB_URL!,
  token: process.env.INFLUXDB_TOKEN!,
});

const writeApi: WriteApi = influx.getWriteApi(
  process.env.INFLUXDB_ORG!,
  process.env.INFLUXDB_BUCKET!,
  'ms',
  {
    batchSize:    1000,
    flushInterval: 1000,
    maxRetries: 5,
    maxRetryTime: 30_000,
    writeFailed: (_: Error, lines: string[], _attempt: number, _expires: number) => {
      console.error(`[influx] write failed — ${lines.length} points will be retried`);
    },
  },
);

// ── MinIO ─────────────────────────────────────────────────────────────────────
const minio = new MinioClient({
  endPoint:  process.env.MINIO_ENDPOINT!,
  port:      Number(process.env.MINIO_PORT!),
  useSSL:    false,
  accessKey: process.env.MINIO_USER!,
  secretKey: process.env.MINIO_PASS!,
});

interface PendingMinIO {
  queue:   QueueName;
  payload: Payload;
  now:     Date;
  ch:      Channel;
  msg:     Message;
}

const minioPending: PendingMinIO[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function minioKey(queue: QueueName, now: Date): string {
  const y  = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d  = String(now.getDate()).padStart(2, '0');
  const h  = String(now.getHours()).padStart(2, '0');
  return `events/${queue}/year=${y}/month=${mo}/day=${d}/hour=${h}/${now.getTime()}-${Math.random().toString(36).slice(2)}.json`;
}

async function flushMinioBatch(): Promise<void> {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (minioPending.length === 0) return;

  const batch = minioPending.splice(0, minioPending.length);

  const groups = new Map<string, PendingMinIO[]>();
  for (const item of batch) {
    const h   = String(item.now.getHours()).padStart(2, '0');
    const key = `${item.queue}_${item.now.toISOString().slice(0, 10)}_${h}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  await Promise.all(
    Array.from(groups.values()).map(async (items) => {
      const { queue, now } = items[0];
      const key  = minioKey(queue, now);
      const body = Buffer.from(
        JSON.stringify(items.map((i) => ({
          type:      queue,
          timestamp: i.now.toISOString(),
          payload:   i.payload,
        })))
      );
      try {
        await minio.putObject(process.env.MINIO_BUCKET!, key, body);
        for (const item of items) item.ch.ack(item.msg);
      } catch (err) {
        console.error('[minio] batch write failed, nacking for retry:', (err as Error).message);
        for (const item of items) item.ch.nack(item.msg, false, true);
      }
    })
  );
}

function scheduleMinioBatch(): void {
  if (minioPending.length >= MINIO_BATCH_SIZE) {
    flushMinioBatch().catch((e) => console.error('[minio] flush error:', e));
    return;
  }
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushMinioBatch().catch((e) => console.error('[minio] flush error:', e));
    }, MINIO_FLUSH_MS);
  }
}

// ── InfluxDB point builder ────────────────────────────────────────────────────
// resolvedAdvertiserId is pre-fetched from Redis for conversions
function buildPoint(queue: QueueName, payload: Payload, now: Date, resolvedAdvertiserId?: string): Point {
  const point = new Point('events')
    .tag('type', queue)
    .intField('count', 1)
    .stringField('payload', JSON.stringify(payload).slice(0, 512))
    .timestamp(now);

  if (queue === 'impressions') {
    const ads = payload.ads as Array<Record<string, Record<string, string>>> | undefined;
    const advertiser_id = String(ads?.[0]?.advertiser?.advertiser_id ?? 'unknown');
    point
      .tag('state',         String(payload.state ?? 'unknown'))
      .tag('advertiser_id', advertiser_id)
      .tag('campaign_id',   String(ads?.[0]?.campaign?.campaign_id ?? 'unknown'))
      .tag('ad_id',         String(ads?.[0]?.ad?.ad_id ?? 'unknown'));
  } else if (queue === 'clicks') {
    const user = payload.user_info as Record<string, string>  | undefined;
    const ad   = payload.clicked_ad as Record<string, unknown> | undefined;
    const ttc  = typeof ad?.time_to_click === 'number' ? ad.time_to_click : 0;
    point
      .tag('state',  String(user?.state  ?? 'unknown'))
      .tag('ad_id',  String(ad?.ad_id ?? 'unknown'))
      .floatField('time_to_click', ttc);
  } else {
    const user  = payload.user_info   as Record<string, string>  | undefined;
    const attr  = payload.attribution_info as Record<string, unknown> | undefined;
    const revenue = typeof payload.conversion_value === 'number' ? payload.conversion_value : 0;
    const ttconv  = typeof attr?.time_to_convert  === 'number' ? attr.time_to_convert  : 0;
    point
      .tag('state',           String(user?.state ?? 'unknown'))
      .tag('conversion_type', String(payload.conversion_type ?? 'unknown'))
      .tag('advertiser_id',   resolvedAdvertiserId ?? 'unknown')
      .floatField('revenue',          revenue)
      .floatField('time_to_convert',  ttconv);
  }

  return point;
}

// ── Message processing ────────────────────────────────────────────────────────
function scheduleRetry(ch: Channel, queue: QueueName, msg: Message, retryCount: number): void {
  const delay = Math.pow(2, retryCount) * 1000;
  ch.ack(msg);
  setTimeout(() => {
    ch.publish(EXCHANGE, queue, msg.content, {
      persistent: true,
      contentType: 'application/json',
      headers: { ...(msg.properties.headers ?? {}), 'x-retry-count': retryCount + 1 },
    });
  }, delay);
}

async function processMessage(ch: Channel, queue: QueueName, msg: Message): Promise<void> {
  const headers    = (msg.properties.headers ?? {}) as Record<string, unknown>;
  const retryCount = typeof headers['x-retry-count'] === 'number' ? (headers['x-retry-count'] as number) : 0;

  try {
    const payload = JSON.parse(msg.content.toString()) as Payload;
    const now = new Date();

    // For impressions: store advertiser_id in Redis for cross-replica attribution
    if (queue === 'impressions') {
      const imp_id = payload.impression_id as string;
      if (imp_id) {
        const ads = payload.ads as Array<Record<string, Record<string, string>>> | undefined;
        const adv_id = String(ads?.[0]?.advertiser?.advertiser_id ?? 'unknown');
        redis.set(`imp:${imp_id}`, adv_id, 'EX', 86400).catch(() => {});
      }
    }

    // For conversions: look up advertiser_id from Redis (set by any consumer replica)
    let resolvedAdvertiserId: string | undefined;
    if (queue === 'conversions') {
      const imp_id = payload.impression_id as string;
      if (imp_id) {
        resolvedAdvertiserId = (await redis.get(`imp:${imp_id}`).catch(() => null)) ?? 'unknown';
      }
    }

    writeApi.writePoint(buildPoint(queue, payload, now, resolvedAdvertiserId));

    aggCounts[queue]++;
    if (Math.floor(now.getTime() / 60_000) * 60_000 !== aggWindowStart) {
      flushAggCounts();
    }

    minioPending.push({ queue, payload, now, ch, msg });
    scheduleMinioBatch();
  } catch (err) {
    console.error(`[${queue}] error (attempt ${retryCount + 1}/${MAX_RETRIES}):`, (err as Error).message);
    if (retryCount < MAX_RETRIES - 1) {
      scheduleRetry(ch, queue, msg, retryCount);
    } else {
      ch.nack(msg, false, false);
    }
  }
}

// ── RabbitMQ ──────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function connectWithRetry(url: string): Promise<any> {
  let delay = 1000;
  for (;;) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const conn: any = await amqp.connect(url, { heartbeat: 60 } as never);
      conn.on('error', (e: Error) => console.error('[rabbitmq] error:', e.message));
      conn.on('close', () => {
        console.error('[rabbitmq] closed, reconnecting...');
        setTimeout(() => start(), delay);
      });
      return conn;
    } catch {
      console.log(`[rabbitmq] not ready, retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 30_000);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function setupQueues(ch: Channel, conn: any): Promise<void> {
  await ch.assertExchange(EXCHANGE, 'direct', { durable: true });
  await ch.assertExchange(DLX, 'direct', { durable: true });

  for (const q of QUEUES) {
    await ch.assertQueue(`${q}.dlq`, { durable: true });
    await ch.bindQueue(`${q}.dlq`, DLX, q);
    await ch.assertQueue(q, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': DLX, 'x-dead-letter-routing-key': q },
    });
    await ch.bindQueue(q, EXCHANGE, q);
  }

  for (const q of QUEUES) {
    const qCh: Channel = await conn.createChannel();
    qCh.prefetch(PREFETCH_PER_Q);

    qCh.consume(q, (msg) => {
      if (msg === null) return;
      processMessage(qCh, q, msg).catch((e) => {
        console.error(`[${q}] unhandled:`, e);
        qCh.nack(msg, false, false);
      });
    }, { noAck: false });

    console.log(`[consumer] listening on queue: ${q} (prefetch: ${PREFETCH_PER_Q})`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function setupSystemListener(conn: any): Promise<void> {
  const ch: Channel = await conn.createChannel();
  await ch.assertExchange('system', 'fanout', { durable: false });
  const { queue } = await ch.assertQueue('', { exclusive: true, autoDelete: true });
  await ch.bindQueue(queue, 'system', '');
  ch.consume(queue, (msg) => {
    if (msg === null) return;
    if (msg.content.toString() === 'reset') {
      for (const q of QUEUES) aggCounts[q] = 0;
      aggWindowStart = Math.floor(Date.now() / 60_000) * 60_000;
      minioPending.length = 0;
      console.log('[consumer] reset: in-memory state cleared');
    }
    ch.ack(msg);
  }, { noAck: false });
}

async function start(): Promise<void> {
  const conn = await connectWithRetry(process.env.RABBITMQ_URL!);
  const setupCh: Channel = await conn.createChannel();
  await setupQueues(setupCh, conn);
  await setupCh.close();
  await setupSystemListener(conn);
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown() {
  console.log('[consumer] shutting down — flushing buffers...');
  try {
    if (flushTimer) clearTimeout(flushTimer);
    await flushMinioBatch();
    flushAggCounts();
    await writeApi.close();
    await redis.quit();
  } catch (e) {
    console.error('[consumer] flush error on exit:', e);
  }
  process.exit(0);
}
process.on('SIGTERM', () => { shutdown().catch(() => process.exit(1)); });
process.on('SIGINT',  () => { shutdown().catch(() => process.exit(1)); });

start().catch((err) => { console.error(err); process.exit(1); });
