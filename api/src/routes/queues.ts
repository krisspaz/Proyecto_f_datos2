import { FastifyInstance } from 'fastify';
import http from 'http';

interface RabbitQueue {
  name: string;
  messages: number;
  consumers: number;
  message_stats?: {
    publish_details?: { rate: number };
    deliver_get_details?: { rate: number };
  };
}

function fetchRabbitQueues(): Promise<RabbitQueue[]> {
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
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data) as RabbitQueue[]); }
          catch (e) { reject(e); }
        });
      },
    );
    req.on('error', reject);
  });
}

export default async function queuesRoute(app: FastifyInstance) {
  app.get('/api/queues/status', async (_req, reply) => {
    const queues = await fetchRabbitQueues();
    reply.send(
      queues.map((q) => ({
        name: q.name,
        messages: q.messages ?? 0,
        consumers: q.consumers ?? 0,
        publishRate: q.message_stats?.publish_details?.rate ?? 0,
        consumeRate: q.message_stats?.deliver_get_details?.rate ?? 0,
      })),
    );
  });
}
