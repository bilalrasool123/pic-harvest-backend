import { FastifyInstance } from 'fastify';
import { startCrawlHandler, getCrawlJobHandler } from '../controllers/crawl.controller';
import { StartCrawlRequest } from '../types';

export async function crawlRoutes(app: FastifyInstance) {
  // POST /api/crawl/start
  app.post<{ Body: StartCrawlRequest }>(
    '/start',
    {
      schema: {
        body: {
          type: 'object',
          required: ['url', 'scope'],
          properties: {
            url: { type: 'string', format: 'uri' },
            scope: { type: 'string', enum: ['single', 'multi', 'full'] },
            options: {
              type: 'object',
              properties: {
                maxPages: { type: 'number', minimum: 1, maximum: 500 },
                maxDepth: { type: 'number', minimum: 1, maximum: 10 },
                timeout: { type: 'number', minimum: 5000, maximum: 120000 },
              },
            },
          },
        },
      },
    },
    startCrawlHandler
  );

  // GET /api/crawl/:jobId
  app.get<{ Params: { jobId: string } }>('/:jobId', getCrawlJobHandler);
}
