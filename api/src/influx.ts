import { InfluxDB } from '@influxdata/influxdb-client';

const influx = new InfluxDB({
  url: process.env.INFLUXDB_URL!,
  token: process.env.INFLUXDB_TOKEN!,
});

export const queryApi = influx.getQueryApi(process.env.INFLUXDB_ORG!);
