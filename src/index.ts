import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { crawlRoutes } from './routes/crawl.routes';
import { downloadRoutes } from './routes/download.routes';
import { logger } from './utils/logger';

const app = Fastify({
  logger: false, // We use pino directly
  bodyLimit: 5 * 1024 * 1024, // 5 MB body limit
});

async function bootstrap() {
  // CORS — allow frontend origin
  await app.register(cors, {
    origin: process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',').map((s) => s.trim())
      : ['http://localhost:3000'],
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  });

  // Routes
  await app.register(crawlRoutes, { prefix: '/api/crawl' });
  await app.register(downloadRoutes, { prefix: '/api/download' });

  // Health check
  app.get('/health', async () => ({ status: 'ok', service: 'picharvest-backend' }));

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    logger.error({ err: error, url: request.url }, 'Unhandled error');
    const statusCode = error.statusCode ?? 500;
    reply.code(statusCode).send({
      error: error.message || 'Internal Server Error',
      statusCode,
    });
  });

  const port = parseInt(process.env.PORT ?? '8080', 10);
  const host = process.env.HOST ?? '0.0.0.0';

  await app.listen({ port, host });
  logger.info(`🚀 PicHarvest backend running at http://localhost:${port}`);
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
