import dotenv from 'dotenv-safe';
import { ProxyChecker } from '~/proxy_checker';
import { WebsocketChecker } from '~/proxy_checker/websocket.checker';

// It is necessary that process.env is available in all files.
dotenv.config();

// It is necessary that typescript does not
// think that environment variables are undefined (dotenv-safe catches them).
import {} from './types/env';

import { env } from 'process';
import { Server } from '~/server';

const server = new Server(+env.PORT);
const proxy_checker = new ProxyChecker();
const proxy_checker_websocket = new WebsocketChecker();

proxy_checker.getEndpoints()
.forEach(({ path, method, handler }) => {
    server.addEndpoint(path, method, handler);
});

proxy_checker_websocket.getEndpoints()
.forEach(({ path, method, handler }) => {
    server.addEndpoint(path, method, handler);
});

server.start();