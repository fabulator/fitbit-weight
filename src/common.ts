import 'cross-fetch/polyfill';
import { Api as FitbitApi } from 'fitbit-api-handler';
import { Api as StravaApi } from 'strava-api-handler';
import { ADAPTERS, Storage } from 'storage-keeper';
import { DateTime } from 'luxon';
import { config } from 'dotenv';
import { pino } from 'pino';

config();

const { API_KEY, API_SECRET, REDIS_HOST, TOKEN_PATH, STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET } = process.env;

export const logger = pino();

export const queueSettings = { connection: { host: REDIS_HOST } };

export const fitbitApi = new FitbitApi(API_KEY, API_SECRET);

export const stravaApi = new StravaApi(STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET);

const storage = new Storage(undefined, new ADAPTERS.FileAdapter(TOKEN_PATH));

type Token = {
    access_token: string;
    expireDate: string;
    refresh_token: string;
};

export const tokenService = {
    get: async (name: string) => {
        const token = (await storage.get(name)) as Token;

        if (!token) {
            return undefined;
        }

        if (DateTime.fromISO(token.expireDate).minus({ minute: 5 }) < DateTime.local()) {
            if (name === 'fitbit') {
                const extendedToken = await fitbitApi.extendAccessToken(token.refresh_token);

                await tokenService.set(name, extendedToken);

                return extendedToken;
            }
            if (name === 'strava') {
                const stravaToken = await stravaApi.refreshToken(token.refresh_token);

                const extendedToken = {
                    ...stravaToken,
                    expireDate: new Date(stravaToken.expires_at * 1000).toISOString(),
                };

                await tokenService.set(name, extendedToken);

                return extendedToken;
            }
        }

        return token;
    },
    set: async (name: string, token: Token) => {
        storage.set(name, token);
    },
};

export type FitbitData = {
    collectionType: 'body';
    date: string;
    ownerId: string;
    ownerType: string;
    subscriptionId: string;
};
