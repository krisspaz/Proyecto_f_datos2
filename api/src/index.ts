import Fastify from 'fastify';
import { connectQueue } from './queue';
import impressionRoute from './routes/impression';
import clickRoute from './routes/click';
import conversionRoute from './routes/conversion';
import metricsRoute from './routes/metrics';
import queuesRoute from './routes/queues';

const app = Fastify({ logger: { level: 'warn' } });

app.register(impressionRoute);
app.register(clickRoute);
app.register(conversionRoute);
app.register(metricsRoute);
app.register(queuesRoute);

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
