import amqp, { Channel } from 'amqplib';

const EXCHANGE = 'events';
const DLX = 'events.dlx';
const QUEUES = ['impressions', 'clicks', 'conversions'] as const;

export type QueueName = (typeof QUEUES)[number];

let channel: Channel;

async function connectWithRetry(url: string) {
  let delay = 1000;
  while (true) {
    try {
      const conn = await amqp.connect(url);
      conn.on('error', (err: Error) => console.error('[rabbitmq] connection error:', err.message));
      conn.on('close', () => {
        console.error('[rabbitmq] connection closed, reconnecting...');
        setTimeout(() => setupChannel(url), delay);
      });
      return conn;
    } catch {
      console.log(`[rabbitmq] not ready, retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 30000);
    }
  }
}

async function setupChannel(url: string): Promise<void> {
  const conn = await connectWithRetry(url);
  channel = await conn.createChannel();

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

  console.log('[rabbitmq] connected and queues ready');
}

export async function connectQueue(): Promise<void> {
  await setupChannel(process.env.RABBITMQ_URL!);
}

/**
 * Encola el JSON en la routing key = nombre de cola (impressions | clicks | conversions).
 * Espera a 'drain' si el buffer TCP está lleno para no perder mensajes bajo carga.
 */
export async function publish(queue: QueueName, payload: object): Promise<void> {
  const body = Buffer.from(JSON.stringify(payload));
  const opts = { persistent: true, contentType: 'application/json' as const };
  for (;;) {
    const ok = channel.publish(EXCHANGE, queue, body, opts);
    if (ok) return;
    await new Promise<void>((resolve) => channel.once('drain', resolve));
  }
}
