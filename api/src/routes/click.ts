import { FastifyInstance } from 'fastify';
import { publish } from '../queue';
import { accepted202Schema, clickBodySchema } from '../schemas/events';

export default async function clickRoute(app: FastifyInstance) {
  app.post(
    '/api/events/click',
    {
      schema: {
        body: clickBodySchema,
        response: { 202: accepted202Schema },
      },
    },
    async (request, reply) => {
      if (!publish('clicks', request.body as object)) {
        return reply.status(503).send({ accepted: false });
      }
      return reply.status(202).send({ accepted: true });
    },
  );
}
