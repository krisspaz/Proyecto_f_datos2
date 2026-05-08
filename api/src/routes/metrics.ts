import { FastifyInstance } from 'fastify';
import { queryApi } from '../influx';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export default async function metricsRoute(app: FastifyInstance) {
  app.get('/api/metrics/summary', async (_req, reply) => {
    const bucket = process.env.INFLUXDB_BUCKET!;
    const query = `
      from(bucket: "${bucket}")
        |> range(start: -24h)
        |> filter(fn: (r) => r._measurement == "events" and r._field == "count")
        |> group(columns: ["type"])
        |> sum()
    `;

    const counts: Record<string, number> = { impressions: 0, clicks: 0, conversions: 0 };

    await new Promise<void>((resolve, reject) => {
      queryApi.queryRows(query, {
        next(row, meta) {
          const obj = meta.toObject(row) as Row;
          const type = String(obj['type']);
          if (type in counts) counts[type] = Number(obj['_value']);
        },
        error: reject,
        complete: resolve,
      });
    });

    const ctr =
      counts.impressions > 0
        ? ((counts.clicks / counts.impressions) * 100).toFixed(2)
        : '0.00';

    reply.send({ ...counts, ctr });
  });

  app.get('/api/events/recent', async (_req, reply) => {
    const bucket = process.env.INFLUXDB_BUCKET!;
    const query = `
      from(bucket: "${bucket}")
        |> range(start: -1h)
        |> filter(fn: (r) => r._measurement == "events" and r._field == "payload")
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: 20)
    `;

    const events: Array<{ timestamp: string; type: string; payload: string }> = [];

    await new Promise<void>((resolve, reject) => {
      queryApi.queryRows(query, {
        next(row, meta) {
          const obj = meta.toObject(row) as Row;
          events.push({
            timestamp: String(obj['_time']),
            type: String(obj['type']),
            payload: String(obj['_value']),
          });
        },
        error: reject,
        complete: resolve,
      });
    });

    reply.send(events);
  });

  app.get('/api/metrics/timeseries', async (_req, reply) => {
    const bucket = process.env.INFLUXDB_BUCKET!;
    const query = `
      from(bucket: "${bucket}")
        |> range(start: -24h)
        |> filter(fn: (r) => r._measurement == "events" and r._field == "count")
        |> aggregateWindow(every: 1h, fn: sum, createEmpty: true)
        |> fill(value: 0)
    `;

    const series: Record<string, Record<string, number>> = {};

    await new Promise<void>((resolve, reject) => {
      queryApi.queryRows(query, {
        next(row, meta) {
          const obj = meta.toObject(row) as Row;
          const time = String(obj['_time']);
          const type = String(obj['type']);
          if (!series[time]) series[time] = { impressions: 0, clicks: 0, conversions: 0 };
          series[time][type] = Number(obj['_value']);
        },
        error: reject,
        complete: resolve,
      });
    });

    const result = Object.entries(series)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, vals]) => ({ time, ...vals }));

    reply.send(result);
  });
}
