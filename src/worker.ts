import { Queue, Worker } from 'bullmq';
import { DateTime } from 'luxon';

import { ApiWeight } from 'fitbit-api-handler/src/types/api/ApiWeight';
import { fitbitApi, FitbitData, queueSettings, tokenService } from './common';

const { QUEUE_SUBSCRIPTION_NAME, QUEUE_WEIGHT_NAME } = process.env;

const queue = new Queue<ApiWeight>(QUEUE_WEIGHT_NAME, queueSettings);

const worker = new Worker<FitbitData>(
    QUEUE_SUBSCRIPTION_NAME,
    async (job) => {
        const date = DateTime.fromISO(job.data.date);

        const token = await tokenService.get('fitbit');

        if (!token) {
            throw new Error('There is no token.');
        }

        fitbitApi.setAccessToken(token.access_token);

        const weights = await fitbitApi.getWeights(date, date);

        await Promise.all(weights.map((item) => queue.add(`Weight ${item.logId}`, item)));
    },
    queueSettings,
);

const close = async (signal: string) => {
    if (signal === 'SIGINT') {
        process.exit(0);
    }

    await worker.close();

    process.exit(0);
};

process.on('SIGTERM', close);
process.on('SIGINT', close);
