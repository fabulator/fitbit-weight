import { fastify } from 'fastify';
import { ApiScope, SubscriptionCollection } from 'fitbit-api-handler';
import { ApiScope as StravaScope } from 'strava-api-handler';
import rawBody from 'fastify-raw-body';
import { Queue } from 'bullmq';
import { fitbitApi, FitbitData, queueSettings, stravaApi, tokenService } from './common';

const { BASE_URI, AUTHORIZE_PATH, LOGIN_PATH, LISTEN_PATH, VERIFY_TOKEN, PORT, QUEUE_SUBSCRIPTION_NAME, STRAVA_RETURN_URL } = process.env;

const app = fastify({ logger: true });

const REDIRECT_URL = `${BASE_URI}${AUTHORIZE_PATH}`;

const queue = new Queue<FitbitData>(QUEUE_SUBSCRIPTION_NAME, queueSettings);

(async () => {
    await app.register(rawBody, {
        field: 'rawBody',
    });

    app.get(LOGIN_PATH, { handler: async () => fitbitApi.getLoginUrl(REDIRECT_URL, [ApiScope.WEIGHT]) });

    app.get('/strava/login', {
        handler: async () => stravaApi.getLoginUrl(STRAVA_RETURN_URL, [StravaScope.PROFILE_WRITE]),
    });

    app.get<{ Querystring: { code: string } }>('/strava/authorize', {
        handler: async (request) => {
            const { code } = request.query;

            const stravaToken = await stravaApi.requestAccessToken(code);

            const token = {
                ...stravaToken,
                expireDate: new Date(stravaToken.expires_at * 1000).toISOString(),
            };

            await tokenService.set('strava', token);

            return token.athlete.id;
        },
    });

    app.get<{ Querystring: { code: string } }>(AUTHORIZE_PATH, {
        handler: async (request) => {
            const { code } = request.query;
            const token = await fitbitApi.requestAccessToken(code, REDIRECT_URL);

            await fitbitApi.addSubscription(token.user_id, SubscriptionCollection.BODY);

            await tokenService.set('fitbit', token);

            return token.user_id;
        },
    });

    app.get<{ Querystring: { verify: string } }>(LISTEN_PATH, {
        handler: async (request, reply) => {
            const { verify } = request.query;
            if (verify === VERIFY_TOKEN) {
                reply.code(204);
                return '';
            }
            reply.code(404);
            return '';
        },
    });

    app.post<{ Body: FitbitData[] }>(LISTEN_PATH, {
        handler: async (request) => {
            if (typeof request.rawBody !== 'string') {
                throw new Error('Invalid request. It must be the string.');
            }

            const fitbitSignature = request.headers['x-fitbit-signature'];

            if (Array.isArray(fitbitSignature)) {
                throw new Error('Invalid signature. It must be the string.');
            }

            if (!fitbitApi.verifyFitbitRequest(request.rawBody, fitbitSignature)) {
                throw new Error('Invalid signature.');
            }

            await Promise.all(
                request.body.map(async (item) => {
                    await queue.add(`Weight from ${item.date}`, item);
                }),
            );
            return '';
        },
    });

    app.listen({ port: Number(PORT), host: '0.0.0.0' });
})();
