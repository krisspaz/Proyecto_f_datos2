import amqp, { Channel } from 'amqplib';

const EXCHANGE = 'events';
const DLX      = 'events.dlx';
const QUEUES   = ['impressions', 'clicks', 'conversions'] as const;

export type QueueName = (typeof QUEUES)[number];

// In-process ring buffer per queue.
// HTTP returns 202 immediately; a background loop drains to AMQP.
// Capped to prevent unbounded memory growth if RabbitMQ is unavailable.
const MAX_BUFFER = 100_000;
const buffers: Record<QueueName, Buffer[]> = {
  impressions: [],
  clicks: [],
  conversions: [],
};

const channels: Partial<Record<QueueName, Channel>> = {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AmqpConn = any;

// ── drain ──────────────────────────────────────────────────────────────────────
// Called after every publish() and after AMQP drain events.
// Stops when the TCP buffer is full; resumes on the next drain event.
function drainBuffers(): void {
  for (const q of QUEUES) {
    const ch = channels[q];
    if (!ch || buffers[q].length === 0) continue;

    while (buffers[q].length > 0) {
      const ok = ch.publish(EXCHANGE, q, buffers[q][0], {
        persistent: true,
        contentType: 'application/json',
      });
      if (!ok) {
        // TCP send-buffer full — wait for drain event before continuing
        ch.once('drain', drainBuffers);
        return;
      }
      buffers[q].shift();
    }
  }
}

// ── connection ────────────────────────────────────────────────────────────────
async function connectWithRetry(url: string): Promise<AmqpConn> {
  let delay = 1000;
  for (;;) {
    try {
      return await amqp.connect(url, { heartbeat: 60 } as never);
    } catch {
      console.log(`[rabbitmq] not ready, retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 30_000);
    }
  }
}

async function setupChannel(conn: AmqpConn, q: QueueName): Promise<Channel> {
  const ch = await conn.createChannel();
  await ch.assertExchange(EXCHANGE, 'direct', { durable: true });
  await ch.assertExchange(DLX, 'direct', { durable: true });
  await ch.assertQueue(`${q}.dlq`, { durable: true });
  await ch.bindQueue(`${q}.dlq`, DLX, q);
  await ch.assertQueue(q, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': DLX,
      'x-dead-letter-routing-key': q,
    },
  });
  await ch.bindQueue(q, EXCHANGE, q);
  return ch;
}

async function connect(url: string): Promise<void> {
  const conn: AmqpConn = await connectWithRetry(url);

  conn.on('error', (err: Error) => console.error('[rabbitmq] connection error:', err.message));
  conn.on('close', () => {
    console.error('[rabbitmq] connection closed — reconnecting in 2s...');
    for (const q of QUEUES) delete channels[q];
    setTimeout(() => connect(url), 2000);
  });

  for (const q of QUEUES) {
    const ch = await setupChannel(conn, q);
    ch.on('error', (err: Error) => {
      console.error(`[rabbitmq] channel ${q} error:`, err.message);
      delete channels[q];
    });
    channels[q] = ch;
  }

  console.log('[rabbitmq] connected — 3 dedicated channels ready');
  drainBuffers(); // flush anything accumulated while reconnecting
}

export async function connectQueue(): Promise<void> {
  await connect(process.env.RABBITMQ_URL!);
}

// ── publish ───────────────────────────────────────────────────────────────────
// Fire-and-forget: push to ring buffer, return immediately.
// Returns false if the buffer is full (caller should respond 503).
export function publish(queue: QueueName, payload: object): boolean {
  if (buffers[queue].length >= MAX_BUFFER) {
    console.warn(`[queue] ${queue} buffer full (${MAX_BUFFER}) — rejecting`);
    return false;
  }
  buffers[queue].push(Buffer.from(JSON.stringify(payload)));
  drainBuffers();
  return true;
}

// ── graceful shutdown ─────────────────────────────────────────────────────────
// On SIGTERM (docker compose down / restart), drain the in-memory buffer
// before exiting so no buffered messages are lost.
export async function drainAndExit(code = 0): Promise<never> {
  const start    = Date.now();
  const deadline = 25_000; // 25 s — Docker's default SIGTERM→SIGKILL window is 30 s

  console.log('[api] draining in-memory buffers before shutdown...');
  while (Object.values(buffers).some((b) => b.length > 0)) {
    drainBuffers();
    if (Date.now() - start > deadline) {
      const left = Object.values(buffers).reduce((s, b) => s + b.length, 0);
      console.warn(`[api] drain timeout — ${left} messages still in buffer`);
      break;
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log('[api] buffers drained — exiting');
  process.exit(code);
}
