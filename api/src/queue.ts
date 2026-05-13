import amqp, { Channel } from 'amqplib';

const EXCHANGE = 'events';
const DLX      = 'events.dlx';
const QUEUES   = ['impressions', 'clicks', 'conversions'] as const;

export type QueueName = (typeof QUEUES)[number];

const MAX_BUFFER  = 2_000_000;
const DRAIN_CHUNK = 5_000;
// Compact backing array when this many slots at the front are dead
const COMPACT_AT  = 50_000;

let drainScheduled = false;

// Each buffer is a flat array + a head pointer.
// Draining advances head (O(1)); no splice until fully drained or COMPACT_AT reached.
// This eliminates the O(n²) cost of splice(0, i) on large buffers.
const buffers: Record<QueueName, Buffer[]> = {
  impressions: [],
  clicks: [],
  conversions: [],
};
const heads: Record<QueueName, number> = {
  impressions: 0,
  clicks: 0,
  conversions: 0,
};

const channels: Partial<Record<QueueName, Channel>> = {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AmqpConn = any;

function activeCount(q: QueueName): number {
  return buffers[q].length - heads[q];
}

// ── drain ──────────────────────────────────────────────────────────────────────
function drainQueue(q: QueueName): void {
  const ch  = channels[q];
  const buf = buffers[q];
  let   head = heads[q];

  if (!ch || head >= buf.length) return;

  let count = 0;
  while (head < buf.length && count < DRAIN_CHUNK) {
    const ok = ch.publish(EXCHANGE, q, buf[head], {
      persistent: true,
      contentType: 'application/json',
    });
    if (!ok) {
      heads[q] = head;
      ch.once('drain', () => drainQueue(q));
      return;
    }
    head++;
    count++;
  }
  heads[q] = head;

  if (head >= buf.length) {
    // Fully drained — O(1) reset, releases all Buffer references
    buf.length = 0;
    heads[q]   = 0;
  } else {
    // Compact periodically to prevent unbounded array growth under sustained load
    if (head >= COMPACT_AT) {
      buf.splice(0, head); // O(active_count), not O(total) since head ≈ half
      heads[q] = 0;
    }
    setImmediate(() => drainQueue(q));
  }
}

function drainBuffers(): void {
  for (const q of QUEUES) drainQueue(q);
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
  drainBuffers();
}

export async function connectQueue(): Promise<void> {
  await connect(process.env.RABBITMQ_URL!);
}

// ── publish ───────────────────────────────────────────────────────────────────
export function publish(queue: QueueName, payload: object): boolean {
  if (activeCount(queue) >= MAX_BUFFER) {
    console.warn(`[queue] ${queue} buffer full (${MAX_BUFFER}) — rejecting`);
    return false;
  }
  buffers[queue].push(Buffer.from(JSON.stringify(payload)));
  if (!drainScheduled) {
    drainScheduled = true;
    setImmediate(() => {
      drainScheduled = false;
      drainBuffers();
    });
  }
  return true;
}

// ── graceful shutdown ─────────────────────────────────────────────────────────
export async function drainAndExit(code = 0): Promise<never> {
  const start    = Date.now();
  const deadline = 25_000;

  console.log('[api] draining in-memory buffers before shutdown...');
  while (QUEUES.some((q) => activeCount(q) > 0)) {
    drainBuffers();
    if (Date.now() - start > deadline) {
      const left = QUEUES.reduce((s, q) => s + activeCount(q), 0);
      console.warn(`[api] drain timeout — ${left} messages still in buffer`);
      break;
    }
    await new Promise((r) => setTimeout(r, 10));
  }

  console.log('[api] buffers drained — exiting');
  process.exit(code);
}
