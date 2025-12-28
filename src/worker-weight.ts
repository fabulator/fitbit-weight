import { Worker } from 'bullmq';
import { ApiWeight } from 'fitbit-api-handler/src/types/api/ApiWeight';
import { GarminConnect } from 'garmin-connect';
import { DateTime } from 'luxon';
import { logger, queueSettings, stravaApi, tokenService } from './common';

const { QUEUE_WEIGHT_NAME, GARMIN_LOGIN, GARMIN_PASSWORD, WEBHOOK } = process.env;

logger.info('Booting up...');

const worker = new Worker<Omit<ApiWeight, 'datetime'> & { datetime: string }>(
    QUEUE_WEIGHT_NAME,
    async (job) => {
        logger.info(job.data, 'Processing...');

        const datetime = DateTime.fromISO(job.data.datetime);

        if (WEBHOOK) {
            await fetch(WEBHOOK, {
                body: JSON.stringify({ date: job.data.datetime, weight: job.data.weight }),
                headers: { 'Content-Type': 'application/json' },
                method: 'POST',
            });
        }

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

        logger.info('Logging to Connect...');
        const connect = new GarminConnect({ username: GARMIN_LOGIN, password: GARMIN_PASSWORD });
        await connect.login();

        logger.info('Writting to Connect...');

        await connect.updateWeight(datetime.toJSDate(), job.data.weight / 0.453592, 'Europe/Prague');

        logger.info('Finito...');
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
