import { Worker } from 'bullmq';
import { ApiWeight } from 'fitbit-api-handler/src/types/api/ApiWeight';
import { DateTime } from 'luxon';
import { GarminApi } from 'garmin-api-handler';
import { logger, queueSettings, stravaApi, tokenService } from './common';

const garminApi = new GarminApi();

const { QUEUE_WEIGHT_NAME, GARMIN_LOGIN, GARMIN_PASSWORD } = process.env;

logger.info('Booting up...');

const worker = new Worker<Omit<ApiWeight, 'datetime'> & { datetime: string }>(
    QUEUE_WEIGHT_NAME,
    async (job) => {
        logger.info(job.data, 'Processing...');

        const datetime = DateTime.fromISO(job.data.datetime);

        // strava can have only one weight, no history
        // check that item is not too old
        if (datetime.diffNow().as('day') <= 1) {
            const token = await tokenService.get('strava');

            if (!token) {
                throw new Error('There is no token.');
            }

            stravaApi.setAccessToken(token.access_token);

            await stravaApi.updateWeight(job.data.weight);
        }

        await garminApi.login(GARMIN_LOGIN, GARMIN_PASSWORD);

        // TODO: It can cause double meassurements
        await garminApi.logWeight(datetime, job.data.weight);
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
