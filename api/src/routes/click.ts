import { FastifyInstance } from 'fastify';
import { publish } from '../queue';

export default async function clickRoute(app: FastifyInstance) {
  app.post('/api/events/click', async (request, reply) => {
    publish('clicks', request.body as object);
    reply.status(202).send({ accepted: true });
  });
}
