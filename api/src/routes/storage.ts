import { FastifyInstance } from 'fastify';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  endpoint: `http://${process.env.MINIO_ENDPOINT ?? 'minio'}:${process.env.MINIO_PORT ?? 9000}`,
  region: 'us-east-1',
  credentials: {
    accessKeyId:     process.env.MINIO_USER!,
    secretAccessKey: process.env.MINIO_PASS!,
  },
  forcePathStyle: true,
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

function partitionPrefix(event_type: string, year: string, month: string, day: string, hour: string) {
  return `events/${event_type}/year=${year}/month=${month}/day=${day}/hour=${hour}/`;
}

function nowParts() {
  const n = new Date();
  return {
    year:  String(n.getFullYear()),
    month: String(n.getMonth() + 1).padStart(2, '0'),
    day:   String(n.getDate()).padStart(2, '0'),
    hour:  String(n.getHours()).padStart(2, '0'),
  };
}

type ObjInfo = { name: string; size: number; lastModified: string | null };

// Paginates through ListObjectsV2 — handles partitions with millions of files.
// Stops at maxCount to avoid timeout; returns { objects, total, truncated }.
async function listObjectsPaged(bucket: string, prefix: string, maxCount = 10_000) {
  const objects: ObjInfo[] = [];
  let continuationToken: string | undefined;
  let truncated = false;

  do {
    const resp = await s3.send(new ListObjectsV2Command({
      Bucket:            bucket,
      Prefix:            prefix,
      MaxKeys:           1000,
      ContinuationToken: continuationToken,
    }));

    for (const obj of resp.Contents ?? []) {
      if (objects.length >= maxCount) { truncated = true; break; }
      objects.push({
        name:         obj.Key ?? '',
        size:         obj.Size ?? 0,
        lastModified: obj.LastModified ? obj.LastModified.toISOString() : null,
      });
    }

    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (continuationToken && !truncated);

  return { objects, total: objects.length, truncated };
}

export default async function storageRoute(app: FastifyInstance) {
  app.get<PartitionQuery>('/api/storage/list', async (req, reply) => {
    const np = nowParts();
    const { event_type = 'impressions', year = np.year, month = np.month, day = np.day, hour = np.hour } = req.query;
    const prefix = partitionPrefix(event_type, year, month, day, hour);
    const bucket = process.env.MINIO_BUCKET!;

    const { objects, total, truncated } = await listObjectsPaged(bucket, prefix, 200);
    reply.send({ prefix, count: total, truncated, objects });
  });

  app.get<PartitionQuery>('/api/storage/count', async (req, reply) => {
    const np = nowParts();
    const { event_type = 'impressions', year = np.year, month = np.month, day = np.day, hour = np.hour } = req.query;
    const prefix = partitionPrefix(event_type, year, month, day, hour);
    const bucket = process.env.MINIO_BUCKET!;

    const { total, truncated } = await listObjectsPaged(bucket, prefix, 10_000);
    reply.send({ event_type, year, month, day, hour, prefix, count: total, truncated });
  });
}
