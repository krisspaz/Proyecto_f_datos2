import { FastifyInstance } from 'fastify';
import { queryApi } from '../influx';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export default async function analyticsRoute(app: FastifyInstance) {
  const bucket = () => process.env.INFLUXDB_BUCKET!;

  // Top 10 states by impressions — last hour
  app.get('/api/analytics/top-states', async (_req, reply) => {
    const query = `
      from(bucket: "${bucket()}")
        |> range(start: -1h)
        |> filter(fn: (r) => r._measurement == "events" and r._field == "count" and r.type == "impressions")
        |> group(columns: ["state"])
        |> sum()
        |> sort(columns: ["_value"], desc: true)
        |> limit(n: 10)
    `;

    const rows: Array<{ state: string; count: number }> = [];
    await new Promise<void>((resolve, reject) => {
      queryApi.queryRows(query, {
        next(row, meta) {
          const obj = meta.toObject(row) as Row;
          rows.push({ state: String(obj['state'] ?? 'unknown'), count: Number(obj['_value']) });
        },
        error: reject,
        complete: resolve,
      });
    });

    reply.send(rows);
  });

  // Top 10 advertisers by revenue — last 24h
  app.get('/api/analytics/top-advertisers', async (_req, reply) => {
    const query = `
      from(bucket: "${bucket()}")
        |> range(start: -24h)
        |> filter(fn: (r) => r._measurement == "events" and r._field == "revenue" and r.type == "conversions")
        |> group(columns: ["advertiser_id"])
        |> sum()
        |> sort(columns: ["_value"], desc: true)
        |> limit(n: 10)
    `;

    const rows: Array<{ advertiser_id: string; revenue: number }> = [];
    await new Promise<void>((resolve, reject) => {
      queryApi.queryRows(query, {
        next(row, meta) {
          const obj = meta.toObject(row) as Row;
          rows.push({
            advertiser_id: String(obj['advertiser_id'] ?? 'unknown'),
            revenue: Number(obj['_value']),
          });
        },
        error: reject,
        complete: resolve,
      });
    });

    reply.send(rows);
  });

  // CTR + Conversion Rate gauges — last hour
  app.get('/api/analytics/gauges', async (_req, reply) => {
    const query = `
      from(bucket: "${bucket()}")
        |> range(start: -1h)
        |> filter(fn: (r) => r._measurement == "events" and r._field == "count")
        |> group(columns: ["type"])
        |> sum()
    `;

    const counts: Record<string, number> = { impressions: 0, clicks: 0, conversions: 0 };
    await new Promise<void>((resolve, reject) => {
      queryApi.queryRows(query, {
        next(row, meta) {
          const obj = meta.toObject(row) as Row;
          const t = String(obj['type']);
          if (t in counts) counts[t] = Number(obj['_value']);
        },
        error: reject,
        complete: resolve,
      });
    });

    const ctr = counts.impressions > 0
      ? +((counts.clicks / counts.impressions) * 100).toFixed(2)
      : 0;
    const convRate = counts.clicks > 0
      ? +((counts.conversions / counts.clicks) * 100).toFixed(2)
      : 0;

    reply.send({ ctr, convRate, ...counts });
  });

  // Average time-to-click and time-to-convert, last hour
  app.get('/api/analytics/latency-averages', async (_req, reply) => {
    const query = `
      from(bucket: "${bucket()}")
        |> range(start: -1h)
        |> filter(fn: (r) => r._measurement == "events" and (r._field == "time_to_click" or r._field == "time_to_convert"))
        |> group(columns: ["_field"])
        |> mean()
    `;

    const averages = { avgTimeToClick: 0, avgTimeToConvert: 0 };
    await new Promise<void>((resolve, reject) => {
      queryApi.queryRows(query, {
        next(row, meta) {
          const obj = meta.toObject(row) as Row;
          const field = String(obj['_field']);
          if (field === 'time_to_click') averages.avgTimeToClick = Number(obj['_value']);
          if (field === 'time_to_convert') averages.avgTimeToConvert = Number(obj['_value']);
        },
        error: reject,
        complete: resolve,
      });
    });

    reply.send({
      avgTimeToClick: Number(averages.avgTimeToClick.toFixed(2)),
      avgTimeToConvert: Number(averages.avgTimeToConvert.toFixed(2)),
    });
  });
}
