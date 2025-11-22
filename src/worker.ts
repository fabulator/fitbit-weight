import { Queue, Worker } from 'bullmq';
import { DateTime } from 'luxon';
import { ApiWeight } from 'fitbit-api-handler/src/types/api/ApiWeight';
import { fitbitApi, FitbitData, logger, queueSettings, tokenService } from './common';

const { QUEUE_SUBSCRIPTION_NAME, QUEUE_WEIGHT_NAME } = process.env;

const queue = new Queue<ApiWeight>(QUEUE_WEIGHT_NAME, queueSettings);

logger.info('Booting up...');

const worker = new Worker<FitbitData>(
    QUEUE_SUBSCRIPTION_NAME,
    async (job) => {
        logger.info(job.data, 'Processing...');

        const date = DateTime.fromISO(job.data.date);

        const token = await tokenService.get('fitbit');

        if (!token) {
            throw new Error('There is no token.');
        }

        fitbitApi.setAccessToken(token.access_token);

        const weights = await fitbitApi.getWeights(date, date);

        logger.info(`Downloaded data... ${JSON.stringify(weights)}`);

        await Promise.all(
            weights.map((item) => {
                logger.info(item, `Weight ${item.logId}`);
                return queue.add(`Weight ${item.logId}`, item);
            }),
        );
    },
    queueSettings,
);

const close = async (signal: string) => {
    logger.info('Exiting...');

    if (signal === 'SIGINT') {
        process.exit(0);
    }

    await worker.close();

    process.exit(0);
};

process.on('SIGTERM', close);
process.on('SIGINT', close);
