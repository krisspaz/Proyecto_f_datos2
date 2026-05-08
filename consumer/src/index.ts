import amqp, { Channel } from 'amqplib';
import { InfluxDB, Point } from '@influxdata/influxdb-client';
import { Client as MinioClient } from 'minio';

const EXCHANGE = 'events';
const DLX = 'events.dlx';
const QUEUES = ['impressions', 'clicks', 'conversions'] as const;
type QueueName = (typeof QUEUES)[number];

const influx = new InfluxDB({
  url: process.env.INFLUXDB_URL!,
  token: process.env.INFLUXDB_TOKEN!,
});
const writeApi = influx.getWriteApi(
  process.env.INFLUXDB_ORG!,
  process.env.INFLUXDB_BUCKET!,
  'ms',
);

const minio = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT!,
  port: Number(process.env.MINIO_PORT!),
  useSSL: false,
  accessKey: process.env.MINIO_USER!,
  secretKey: process.env.MINIO_PASS!,
});

async function connectWithRetry(url: string) {
  let delay = 1000;
  while (true) {
    try {
      const conn = await amqp.connect(url);
      conn.on('error', (err: Error) => console.error('[rabbitmq] connection error:', err.message));
      conn.on('close', () => {
        console.error('[rabbitmq] connection closed, reconnecting...');
        setTimeout(() => start(), delay);
      });
      return conn;
    } catch {
      console.log(`[rabbitmq] not ready, retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 30000);
    }
  }
}

async function setupQueues(channel: Channel): Promise<void> {
  await channel.assertExchange(EXCHANGE, 'direct', { durable: true });
  await channel.assertExchange(DLX, 'direct', { durable: true });

  for (const q of QUEUES) {
    await channel.assertQueue(`${q}.dlq`, { durable: true });
    await channel.bindQueue(`${q}.dlq`, DLX, q);

    await channel.assertQueue(q, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': DLX,
        'x-dead-letter-routing-key': q,
      },
    });
    await channel.bindQueue(q, EXCHANGE, q);
  }
}

async function handleEvent(queue: QueueName, payload: object): Promise<void> {
  const now = new Date();

  const point = new Point('events')
    .tag('type', queue)
    .intField('count', 1)
    .stringField('payload', JSON.stringify(payload).slice(0, 512))
    .timestamp(now);
  writeApi.writePoint(point);
  await writeApi.flush();

  try {
    const key = `${queue}/${now.getTime()}-${Math.random().toString(36).slice(2)}.json`;
    const body = JSON.stringify({ type: queue, timestamp: now.toISOString(), payload });
    await minio.putObject(process.env.MINIO_BUCKET!, key, Buffer.from(body));
  } catch (err) {
    console.error(`[${queue}] minio error:`, (err as Error).message);
  }

  console.log(`[${queue}] processed event`);
}

async function start(): Promise<void> {
  const conn = await connectWithRetry(process.env.RABBITMQ_URL!);
  const channel = await conn.createChannel();

  await setupQueues(channel);
  channel.prefetch(100);

  for (const q of QUEUES) {
    channel.consume(
      q,
      async (msg) => {
        if (msg === null) return;
        try {
          const payload = JSON.parse(msg.content.toString()) as object;
          await handleEvent(q, payload);
          channel.ack(msg);
        } catch (err) {
          console.error(`[${q}] processing error:`, err);
          channel.nack(msg, false, false);
        }
      },
      { noAck: false },
    );
    console.log(`[consumer] listening on queue: ${q}`);
  }
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
