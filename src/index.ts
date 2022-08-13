import 'cross-fetch/polyfill';
import { fastify } from 'fastify';
import { Api, ApiScope } from 'fitbit-api-handler';
import { config } from 'dotenv';

config();

const { API_KEY, API_SECRET, BASE_URI, AUTHORIZE_PATH, LOGIN_PATH, LISTEN_PATH, VERIFY_TOKEN, PORT } = process.env;

const api = new Api(API_KEY, API_SECRET);

const app = fastify({ logger: true });

const REDIRECT_URL = `${BASE_URI}${AUTHORIZE_PATH}`;

app.get(LOGIN_PATH, { handler: async () => api.getLoginUrl(REDIRECT_URL, [ApiScope.WEIGHT]) });

app.get<{ Querystring: { code: string } }>(AUTHORIZE_PATH, {
    handler: async (request) => {
        const { code } = request.query;
        const { user_id } = await api.requestAccessToken(code, REDIRECT_URL);
        return user_id;
    },
});

app.get<{ Querystring: { verify: string } }>(LISTEN_PATH, {
    handler: async (request, reply) => {
        const { verify } = request.query;
        if (verify === VERIFY_TOKEN) {
            return reply.code(204);
        }
        return reply.code(404);
    },
});

app.post(LISTEN_PATH, {
    handler: async (request, reply) => {
        if (typeof request.body !== 'string') {
            throw new Error('Invalid request. It must be the string.');
        }

        const fitbitSignature = request.headers['X-Fitbit-Signature'];

        if (Array.isArray(fitbitSignature)) {
            throw new Error('Invalid signature. It must be the string.');
        }

        if (!api.verifyFitbitRequest(request.body, fitbitSignature)) {
            return reply.code(404);
        }

        const body = JSON.parse(request.body);

        body.forEach((item: Record<string, unknown>) => {
            console.log(item);
        });
    },
});

app.listen({ port: Number(PORT) });
