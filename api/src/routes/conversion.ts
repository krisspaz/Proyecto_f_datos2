import { FastifyInstance } from 'fastify';
import { publish } from '../queue';
import { accepted202Schema, conversionBodySchema } from '../schemas/events';

export default async function conversionRoute(app: FastifyInstance) {
  app.post(
    '/api/events/conversion',
    {
      schema: {
        body: conversionBodySchema,
        response: { 202: accepted202Schema },
      },
    },
    async (request, reply) => {
      if (!publish('conversions', request.body as object)) {
        return reply.status(503).send({ accepted: false });
      }
      return reply.status(202).send({ accepted: true });
    },
  );
}
