import { Worker } from 'bullmq';
import { ApiWeight } from 'fitbit-api-handler/src/types/api/ApiWeight';
import { logger, queueSettings, stravaApi, tokenService } from './common';

const { QUEUE_WEIGHT_NAME } = process.env;

logger.info('Booting up...');

const worker = new Worker<ApiWeight>(
    QUEUE_WEIGHT_NAME,
    async (job) => {
        logger.info('Processing...', job.data);

        // strava can have only one weight, no history
        // check that item is not too old
        if (job.data.datetime.diffNow().as('day') < 1) {
            const token = await tokenService.get('strava');

            if (!token) {
                throw new Error('There is no token.');
            }

            stravaApi.setAccessToken(token.access_token);

            await stravaApi.updateWeight(job.data.weight);
        }
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
