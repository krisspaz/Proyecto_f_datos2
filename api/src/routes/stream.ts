import { FastifyInstance } from 'fastify';
import { queryApi } from '../influx';
import http from 'http';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function fetchRabbitQueues(): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(
      `${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASS}`,
    ).toString('base64');
    const req = http.get(
      {
        hostname: process.env.RABBITMQ_HOST ?? 'rabbitmq',
        port: 15672,
        path: '/api/queues/%2F',
        headers: { Authorization: `Basic ${auth}` },
      },
      (res) => {
        let data = '';
        res.on('data', (c: string) => { data += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(e); }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function snapshot() {
  const bucket = process.env.INFLUXDB_BUCKET!;
  const counts: Record<string, number> = { impressions: 0, clicks: 0, conversions: 0 };

  await new Promise<void>((resolve, reject) => {
    queryApi.queryRows(
      `from(bucket: "${bucket}") |> range(start: -24h) |> filter(fn: (r) => r._measurement == "events" and r._field == "count") |> group(columns: ["type"]) |> sum()`,
      {
        next(row, meta) {
          const obj = meta.toObject(row) as Row;
          const t = String(obj['type']);
          if (t in counts) counts[t] = Number(obj['_value']);
        },
        error: reject,
        complete: resolve,
      },
    );
  });

  const ctr = counts.impressions > 0
    ? ((counts.clicks / counts.impressions) * 100).toFixed(2)
    : '0.00';

  const raw = await fetchRabbitQueues();
  const queues = raw.map((q) => ({
    name: q.name,
    messages: q.messages ?? 0,
    consumers: q.consumers ?? 0,
    publishRate: q.message_stats?.publish_details?.rate ?? 0,
    consumeRate: q.message_stats?.deliver_get_details?.rate ?? 0,
  }));

  return { summary: { ...counts, ctr }, queues };
}

export default async function streamRoute(app: FastifyInstance) {
  app.get('/api/stream', async (request, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const push = async () => {
      if (res.writableEnded) return;
      try {
        const data = await snapshot();
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch { /* InfluxDB may be briefly unavailable during stress test */ }
    };

    await push();
    const dataInterval      = setInterval(push, 2000);
    // Heartbeat keeps the nginx proxy_read_timeout (5s) from closing the connection
    const heartbeatInterval = setInterval(() => {
      if (!res.writableEnded) res.write(': heartbeat\n\n');
    }, 3000);

    request.raw.on('close', () => {
      clearInterval(dataInterval);
      clearInterval(heartbeatInterval);
    });
  });
}
