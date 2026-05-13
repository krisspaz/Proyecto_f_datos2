import Fastify from 'fastify';
import { connectQueue, drainAndExit } from './queue';
import impressionRoute from './routes/impression';
import clickRoute from './routes/click';
import conversionRoute from './routes/conversion';
import metricsRoute from './routes/metrics';
import queuesRoute from './routes/queues';
import storageRoute from './routes/storage';
import resetRoute from './routes/reset';
import analyticsRoute from './routes/analytics';
import streamRoute from './routes/stream';

const app = Fastify({
  logger: { level: 'warn' },
  bodyLimit: 2 * 1024 * 1024,
});

app.register(impressionRoute);
app.register(clickRoute);
app.register(conversionRoute);
app.register(metricsRoute);
app.register(queuesRoute);
app.register(storageRoute);
app.register(resetRoute);
app.register(analyticsRoute);
app.register(streamRoute);

app.get('/', async () => ({
  service: 'signal-catcher-api',
  message: 'Esta es la API REST, no la interfaz web.',
  health: '/health',
  events: {
    impression: 'POST /api/events/impression',
    click: 'POST /api/events/click',
    conversion: 'POST /api/events/conversion',
  },
  ui: 'Con docker compose, abre el frontend en http://localhost:8080 (y Costos AWS en /cloud-costs).',
}));

app.get('/health', async () => ({ status: 'ok' }));

const start = async () => {
  await connectQueue();
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
  console.log(`[api] listening on port ${process.env.PORT ?? 3000}`);
};

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Drain in-memory buffer before Docker kills the container
process.on('SIGTERM', () => drainAndExit(0).catch(() => process.exit(1)));
process.on('SIGINT',  () => drainAndExit(0).catch(() => process.exit(1)));
