import amqp, { Channel, Message } from 'amqplib';
import { InfluxDB, Point, WriteApi } from '@influxdata/influxdb-client';
import { Client as MinioClient } from 'minio';

const EXCHANGE = 'events';
const DLX = 'events.dlx';
const QUEUES = ['impressions', 'clicks', 'conversions'] as const;
type QueueName = (typeof QUEUES)[number];
type Payload = Record<string, unknown>;

const MAX_RETRIES = 3;
// impression_id → advertiser_id, for attribution in conversion events
const impressionCache = new Map<string, string>();
const CACHE_MAX = 100_000;

const influx = new InfluxDB({
  url: process.env.INFLUXDB_URL!,
  token: process.env.INFLUXDB_TOKEN!,
});

// Batched write: flushes every 500 points or every 1 s, whichever comes first.
// Never flush per-event — that caps throughput to ~100 rps.
const writeApi: WriteApi = influx.getWriteApi(
  process.env.INFLUXDB_ORG!,
  process.env.INFLUXDB_BUCKET!,
  'ms',
  { batchSize: 500, flushInterval: 1000, maxRetries: 3, maxRetryTime: 15_000 },
);

const minio = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT!,
  port: Number(process.env.MINIO_PORT!),
  useSSL: false,
  accessKey: process.env.MINIO_USER!,
  secretKey: process.env.MINIO_PASS!,
});

// Partition contract: events/{type}/year=YYYY/month=MM/day=DD/hour=HH/{ts}-{rand}.json
function minioKey(queue: QueueName, now: Date): string {
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2);
  return `events/${queue}/year=${y}/month=${mo}/day=${d}/hour=${h}/${now.getTime()}-${rand}.json`;
}

function buildPoint(queue: QueueName, payload: Payload, now: Date): Point {
  const point = new Point('events').tag('type', queue).intField('count', 1).timestamp(now);

  if (queue === 'impressions') {
    const ads = payload.ads as Array<Record<string, Record<string, string>>> | undefined;
    const state = String(payload.state ?? 'unknown');
    const advertiser_id = String(ads?.[0]?.advertiser?.advertiser_id ?? 'unknown');
    const campaign_id = String(ads?.[0]?.campaign?.campaign_id ?? 'unknown');
    const ad_id = String(ads?.[0]?.ad?.ad_id ?? 'unknown');

    point
      .tag('state', state)
      .tag('advertiser_id', advertiser_id)
      .tag('campaign_id', campaign_id)
      .tag('ad_id', ad_id);

    // Cache advertiser for conversion attribution lookup
    const imp_id = payload.impression_id as string;
    if (imp_id && impressionCache.size < CACHE_MAX) {
      impressionCache.set(imp_id, advertiser_id);
    }
  } else if (queue === 'clicks') {
    const user = payload.user_info as Record<string, string> | undefined;
    const ad = payload.clicked_ad as Record<string, unknown> | undefined;
    const ttc = typeof ad?.time_to_click === 'number' ? ad.time_to_click : 0;

    point
      .tag('state', String(user?.state ?? 'unknown'))
      .tag('ad_id', String(ad?.ad_id ?? 'unknown'))
      .floatField('time_to_click', ttc);
  } else {
    // conversions
    const user = payload.user_info as Record<string, string> | undefined;
    const attr = payload.attribution_info as Record<string, unknown> | undefined;
    const revenue = typeof payload.conversion_value === 'number' ? payload.conversion_value : 0;
    const ttconv = typeof attr?.time_to_convert === 'number' ? attr.time_to_convert : 0;
    const imp_id = payload.impression_id as string;
    const advertiser_id = (imp_id && impressionCache.get(imp_id)) ?? 'unknown';

    point
      .tag('state', String(user?.state ?? 'unknown'))
      .tag('conversion_type', String(payload.conversion_type ?? 'unknown'))
      .tag('advertiser_id', advertiser_id)
      .floatField('revenue', revenue)
      .floatField('time_to_convert', ttconv);
  }

  return point;
}

// Ack original, re-publish after exponential delay with incremented retry counter.
// Avoids blocking the channel while waiting.
function scheduleRetry(ch: Channel, queue: QueueName, msg: Message, retryCount: number): void {
  const delay = Math.pow(2, retryCount) * 1000; // 1 s → 2 s → 4 s
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
  const headers = (msg.properties.headers ?? {}) as Record<string, unknown>;
  const retryCount = typeof headers['x-retry-count'] === 'number' ? (headers['x-retry-count'] as number) : 0;

  try {
    const payload = JSON.parse(msg.content.toString()) as Payload;
    const now = new Date();

    writeApi.writePoint(buildPoint(queue, payload, now));

    const key = minioKey(queue, now);
    const body = JSON.stringify({ type: queue, timestamp: now.toISOString(), payload });
    await minio.putObject(process.env.MINIO_BUCKET!, key, Buffer.from(body));

    ch.ack(msg);
  } catch (err) {
    console.error(`[${queue}] error (attempt ${retryCount + 1}/${MAX_RETRIES}):`, (err as Error).message);

    if (retryCount < MAX_RETRIES - 1) {
      scheduleRetry(ch, queue, msg, retryCount);
    } else {
      ch.nack(msg, false, false); // exhausted retries → DLQ
    }
  }
}

async function connectWithRetry(url: string) {
  let delay = 1000;
  while (true) {
    try {
      const conn = await amqp.connect(url);
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

async function setupQueues(ch: Channel): Promise<void> {
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
}

async function start(): Promise<void> {
  const conn = await connectWithRetry(process.env.RABBITMQ_URL!);
  const ch = await conn.createChannel();

  await setupQueues(ch);
  ch.prefetch(100);

  for (const q of QUEUES) {
    ch.consume(
      q,
      (msg) => {
        if (msg === null) return;
        processMessage(ch, q, msg).catch((e) => {
          console.error(`[${q}] unhandled:`, e);
          ch.nack(msg, false, false);
        });
      },
      { noAck: false },
    );
    console.log(`[consumer] listening on queue: ${q}`);
  }
}

// Flush buffered InfluxDB points before exiting so no data is lost on SIGTERM.
async function shutdown() {
  console.log('[consumer] shutting down, flushing InfluxDB buffer...');
  try { await writeApi.close(); } catch (e) { console.error('[influx] flush error on exit:', e); }
  process.exit(0);
}
process.on('SIGTERM', () => { shutdown().catch(() => process.exit(1)); });
process.on('SIGINT',  () => { shutdown().catch(() => process.exit(1)); });

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
