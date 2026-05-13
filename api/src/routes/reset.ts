import { FastifyInstance } from 'fastify';
import http from 'http';
import amqp from 'amqplib';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  endpoint: `http://${process.env.MINIO_ENDPOINT ?? 'minio'}:${process.env.MINIO_PORT ?? 9000}`,
  region: 'us-east-1',
  credentials: {
    accessKeyId:     process.env.MINIO_USER!,
    secretAccessKey: process.env.MINIO_PASS!,
  },
  forcePathStyle: true,
});

function purgeInflux(): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      start: '1970-01-01T00:00:00Z',
      stop: new Date().toISOString(),
    });
    const influxUrl = new URL(process.env.INFLUXDB_URL!);
    const path = `/api/v2/delete?org=${encodeURIComponent(process.env.INFLUXDB_ORG!)}&bucket=${encodeURIComponent(process.env.INFLUXDB_BUCKET!)}`;
    const req = http.request({
      hostname: influxUrl.hostname,
      port: Number(influxUrl.port) || 8086,
      path,
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.INFLUXDB_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => { res.resume(); res.on('end', resolve); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function purgeRabbit(queue: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASS}`).toString('base64');
    const req = http.request({
      hostname: process.env.RABBITMQ_HOST ?? 'rabbitmq',
      port: 15672,
      path: `/api/queues/%2F/${queue}/contents`,
      method: 'DELETE',
      headers: { Authorization: `Basic ${auth}` },
    }, (res) => { res.resume(); res.on('end', resolve); });
    req.on('error', reject);
    req.end();
  });
}

async function purgeMinIO(): Promise<void> {
  const bucket = process.env.MINIO_BUCKET!;
  let token: string | undefined;
  do {
    const resp = await s3.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1000, ContinuationToken: token }));
    const keys = (resp.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length > 0) {
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }));
    }
    token = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (token);
}

async function notifyConsumersReset(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let conn: any;
  try {
    conn = await amqp.connect(process.env.RABBITMQ_URL!);
    const ch = await conn.createChannel();
    await ch.assertExchange('system', 'fanout', { durable: false });
    ch.publish('system', '', Buffer.from('reset'));
    await ch.close();
  } finally {
    if (conn) await conn.close().catch(() => {});
  }
}

export default async function resetRoute(app: FastifyInstance) {
  app.post('/api/reset', async (_req, reply) => {
    // Respond immediately so nginx doesn't timeout — purge runs in background
    reply.send({ reset: true });

    Promise.all([
      purgeInflux(),
      purgeMinIO(),
      purgeRabbit('clicks'),
      purgeRabbit('impressions'),
      purgeRabbit('conversions'),
      notifyConsumersReset(),
    ]).catch((e) => console.error('[reset] background purge error:', e));
  });
}
