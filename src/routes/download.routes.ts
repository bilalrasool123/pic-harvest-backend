import { FastifyInstance } from 'fastify';
import { downloadZipHandler } from '../controllers/download.controller';
import { ZipDownloadRequest } from '../types';

export async function downloadRoutes(app: FastifyInstance) {
  // POST /api/download/zip
  app.post<{ Body: ZipDownloadRequest }>(
    '/zip',
    {
      schema: {
        body: {
          type: 'object',
          required: ['images'],
          properties: {
            images: {
              type: 'array',
              minItems: 1,
              maxItems: 500,
              items: {
                type: 'object',
                required: ['url'],
                properties: {
                  url: { type: 'string' },
                  filename: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    downloadZipHandler
  );
}
