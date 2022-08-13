import 'cross-fetch/polyfill';
import * as fs from 'fs/promises';
import { ApiToken } from 'fitbit-api-handler/src/types/api';
import { Api } from 'fitbit-api-handler';
import { DateTime } from 'luxon';

const { API_KEY, API_SECRET, REDIS_HOST, TOKEN_PATH } = process.env;

export const queueSettings = { connection: { host: REDIS_HOST } };

export const api = new Api(API_KEY, API_SECRET);

export const tokenService = {
    get: async () => {
        const buffer = await fs.readFile(TOKEN_PATH);
        const data = buffer.toString();

        if (!data) {
            return undefined;
        }

        const token = JSON.parse(data) as ApiToken;

        if (DateTime.fromISO(token.expireDate).minus({ minute: 5 }) < DateTime.local()) {
            const extendedToken = await api.extendAccessToken(token.refresh_token);

            await tokenService.set(extendedToken);

            return extendedToken;
        }

        return token;
    },
    set: async (token: ApiToken) => {
        await fs.writeFile(TOKEN_PATH, JSON.stringify(token));
    },
};

export type FitbitData = {
    collectionType: 'body';
    date: string;
    ownerId: string;
    ownerType: string;
    subscriptionId: string;
};
