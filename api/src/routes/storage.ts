import { FastifyInstance } from 'fastify';
import { Client as MinioClient } from 'minio';

const minio = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT ?? 'minio',
  port: Number(process.env.MINIO_PORT ?? 9000),
  useSSL: false,
  accessKey: process.env.MINIO_USER!,
  secretKey: process.env.MINIO_PASS!,
});

type PartitionQuery = {
  Querystring: {
    event_type?: string;
    year?: string;
    month?: string;
    day?: string;
    hour?: string;
  };
};

// Builds the MinIO prefix following the partition contract:
// events/{event_type}/year=YYYY/month=MM/day=DD/hour=HH/
function partitionPrefix(
  event_type: string,
  year: string,
  month: string,
  day: string,
  hour: string,
): string {
  return `events/${event_type}/year=${year}/month=${month}/day=${day}/hour=${hour}/`;
}

function nowParts() {
  const n = new Date();
  return {
    year: String(n.getFullYear()),
    month: String(n.getMonth() + 1).padStart(2, '0'),
    day: String(n.getDate()).padStart(2, '0'),
    hour: String(n.getHours()).padStart(2, '0'),
  };
}

export default async function storageRoute(app: FastifyInstance) {
  // Lists raw event files in a partition (defaults to current hour).
  // This satisfies the requirement: "at least one report query must read from object storage".
  app.get<PartitionQuery>('/api/storage/list', async (req, reply) => {
    const np = nowParts();
    const {
      event_type = 'impressions',
      year = np.year,
      month = np.month,
      day = np.day,
      hour = np.hour,
    } = req.query;

    const prefix = partitionPrefix(event_type, year, month, day, hour);
    const bucket = process.env.MINIO_BUCKET!;
    const objects: { name: string; size: number; lastModified: Date | null }[] = [];

    await new Promise<void>((resolve, reject) => {
      const stream = minio.listObjects(bucket, prefix, true);
      stream.on('data', (obj) => {
        if (obj.name) objects.push({ name: obj.name, size: obj.size ?? 0, lastModified: obj.lastModified ?? null });
      });
      stream.on('error', reject);
      stream.on('end', resolve);
    });

    reply.send({ prefix, count: objects.length, objects: objects.slice(0, 200) });
  });

  // Returns the file count per partition — used to cross-check with InfluxDB totals.
  app.get<PartitionQuery>('/api/storage/count', async (req, reply) => {
    const np = nowParts();
    const {
      event_type = 'impressions',
      year = np.year,
      month = np.month,
      day = np.day,
      hour = np.hour,
    } = req.query;

    const prefix = partitionPrefix(event_type, year, month, day, hour);
    const bucket = process.env.MINIO_BUCKET!;

    let count = 0;
    await new Promise<void>((resolve, reject) => {
      const stream = minio.listObjects(bucket, prefix, true);
      stream.on('data', () => count++);
      stream.on('error', reject);
      stream.on('end', resolve);
    });

    reply.send({ event_type, year, month, day, hour, prefix, count });
  });
}
