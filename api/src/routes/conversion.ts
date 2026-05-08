import { FastifyInstance } from 'fastify';
import { publish } from '../queue';

export default async function conversionRoute(app: FastifyInstance) {
  app.post('/api/events/conversion', async (request, reply) => {
    publish('conversions', request.body as object);
    reply.status(202).send({ accepted: true });
  });
}
