import Fastify from 'fastify';
import { connectQueue } from './queue';
import impressionRoute from './routes/impression';
import clickRoute from './routes/click';
import conversionRoute from './routes/conversion';
import metricsRoute from './routes/metrics';
import queuesRoute from './routes/queues';
import storageRoute from './routes/storage';

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
