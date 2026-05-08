import amqp, { Channel } from 'amqplib';

const EXCHANGE = 'events';
const DLX = 'events.dlx';
const QUEUES = ['impressions', 'clicks', 'conversions'] as const;
type QueueName = (typeof QUEUES)[number];

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

async function handleEvent(queue: QueueName, _payload: object): Promise<void> {
  // TODO: aggregate metrics → InfluxDB, raw event → MinIO
  console.log(`[${queue}] received event`);
}

async function start(): Promise<void> {
  const conn = await connectWithRetry(process.env.RABBITMQ_URL!);
  const channel = await conn.createChannel();

  await setupQueues(channel);

  // 100 mensajes en vuelo por consumer — ajustar según throughput real
  channel.prefetch(100);

  for (const q of QUEUES) {
    channel.consume(
      q,
      async (msg) => {
        // msg === null cuando RabbitMQ cancela el consumer — hay que manejarlo
        if (msg === null) return;

        try {
          const payload = JSON.parse(msg.content.toString()) as object;
          await handleEvent(q, payload);
          channel.ack(msg);
        } catch (err) {
          console.error(`[${q}] processing error:`, err);
          // nack sin requeue → va al DLQ via x-dead-letter-exchange
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
