import { FastifyRequest, FastifyReply } from 'fastify';
import { startCrawlJob } from '../services/crawler.service';
import { redisService } from '../services/redis.service';
import { StartCrawlRequest } from '../types';
import { logger } from '../utils/logger';

export async function startCrawlHandler(
  request: FastifyRequest<{ Body: StartCrawlRequest }>,
  reply: FastifyReply
) {
  const { url, scope, options } = request.body;

  logger.info({ url, scope, options }, 'Starting crawl job');

  try {
    const jobId = await startCrawlJob(url, scope, options);
    return reply.code(202).send({ jobId });
  } catch (err) {
    logger.error({ err }, 'Failed to start crawl job');
    return reply.code(500).send({ error: 'Failed to start crawl job' });
  }
}

export async function getCrawlJobHandler(
  request: FastifyRequest<{ Params: { jobId: string } }>,
  reply: FastifyReply
) {
  const { jobId } = request.params;

  try {
    const job = await redisService.getJob(jobId);
    if (!job) {
      return reply.code(404).send({ error: 'Job not found' });
    }
    return reply.send(job);
  } catch (err) {
    logger.error({ err, jobId }, 'Failed to fetch crawl job');
    return reply.code(500).send({ error: 'Failed to fetch job' });
  }
}
