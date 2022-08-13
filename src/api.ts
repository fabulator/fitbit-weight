import 'cross-fetch/polyfill';
import { fastify } from 'fastify';
import { ApiScope, SubscriptionCollection } from 'fitbit-api-handler';
import rawBody from 'fastify-raw-body';
import { config } from 'dotenv';
import { Queue } from 'bullmq';
import { api, FitbitData, queueSettings, tokenService } from './common';

config();

const { BASE_URI, AUTHORIZE_PATH, LOGIN_PATH, LISTEN_PATH, VERIFY_TOKEN, PORT, QUEUE_SUBSCRIPTION_NAME } = process.env;

const app = fastify({ logger: true });

const REDIRECT_URL = `${BASE_URI}${AUTHORIZE_PATH}`;

const queue = new Queue<FitbitData>(QUEUE_SUBSCRIPTION_NAME, queueSettings);

(async () => {
    await app.register(rawBody, {
        field: 'rawBody',
    });

    app.get(LOGIN_PATH, { handler: async () => api.getLoginUrl(REDIRECT_URL, [ApiScope.WEIGHT]) });

    app.get<{ Querystring: { code: string } }>(AUTHORIZE_PATH, {
        handler: async (request) => {
            const { code } = request.query;
            const token = await api.requestAccessToken(code, REDIRECT_URL);

            await api.addSubscription(token.user_id, SubscriptionCollection.BODY);

            tokenService.set(token);

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

            if (!api.verifyFitbitRequest(request.rawBody, fitbitSignature)) {
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
