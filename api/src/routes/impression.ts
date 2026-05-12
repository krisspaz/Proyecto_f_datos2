import { FastifyInstance } from 'fastify';
import { publish } from '../queue';
import { accepted202Schema, impressionBodySchema } from '../schemas/events';

export default async function impressionRoute(app: FastifyInstance) {
  app.post(
    '/api/events/impression',
    {
      schema: {
        body: impressionBodySchema,
        response: { 202: accepted202Schema },
      },
    },
    async (request, reply) => {
      if (!publish('impressions', request.body as object)) {
        return reply.status(503).send({ accepted: false });
      }
      return reply.status(202).send({ accepted: true });
    },
  );
}
