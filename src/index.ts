import 'cross-fetch/polyfill';
import { fastify } from 'fastify';
import { Queue } from 'bullmq';
import { Api, ApiScope, SubscriptionCollection } from 'fitbit-api-handler';
import rawBody from 'fastify-raw-body';
import { config } from 'dotenv';

config();

const { API_KEY, API_SECRET, BASE_URI, AUTHORIZE_PATH, LOGIN_PATH, LISTEN_PATH, VERIFY_TOKEN, PORT, QUEUE_NAME, REDIS_HOST } = process.env;

const api = new Api(API_KEY, API_SECRET);

const app = fastify({ logger: true });

const REDIRECT_URL = `${BASE_URI}${AUTHORIZE_PATH}`;

type FitbitData = {
    collectionType: 'body';
    date: string;
    ownerId: string;
    ownerType: string;
    subscriptionId: string;
};

const queue = new Queue<FitbitData>(QUEUE_NAME, { connection: { host: REDIS_HOST } });

(async () => {
    await app.register(rawBody, {
        field: 'rawBody',
    });

    app.get(LOGIN_PATH, { handler: async () => api.getLoginUrl(REDIRECT_URL, [ApiScope.WEIGHT]) });

    app.get<{ Querystring: { code: string } }>(AUTHORIZE_PATH, {
        handler: async (request) => {
            const { code } = request.query;
            const { user_id } = await api.requestAccessToken(code, REDIRECT_URL);

            api.addSubscription(user_id, SubscriptionCollection.BODY);

            return user_id;
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

            // eslint-disable-next-line compat/compat
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
