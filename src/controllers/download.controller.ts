import { FastifyRequest, FastifyReply } from 'fastify';
import { generateZip } from '../services/zip.service';
import { ZipDownloadRequest } from '../types';
import { logger } from '../utils/logger';

export async function downloadZipHandler(
  request: FastifyRequest<{ Body: ZipDownloadRequest }>,
  reply: FastifyReply
) {
  const { images } = request.body;

  logger.info({ count: images.length }, 'Generating ZIP download');

  try {
    const zipBuffer = await generateZip(images);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `picharvest-${timestamp}.zip`;

    return reply
      .code(200)
      .headers({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(zipBuffer.length),
      })
      .send(zipBuffer);
  } catch (err) {
    logger.error({ err }, 'Failed to generate ZIP');
    return reply.code(500).send({ error: 'Failed to generate ZIP archive' });
  }
}
