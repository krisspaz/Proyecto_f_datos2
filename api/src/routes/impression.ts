import { FastifyInstance } from 'fastify';
import { publish } from '../queue';

export default async function impressionRoute(app: FastifyInstance) {
  app.post('/api/events/impression', async (request, reply) => {
    publish('impressions', request.body as object);
    reply.status(202).send({ accepted: true });
  });
}
