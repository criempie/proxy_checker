import dotenv from 'dotenv-safe';

// It is necessary that process.env is available in all files.
dotenv.config();

// It is necessary that typescript does not
// think that environment variables are undefined (dotenv-safe catches them).
import {} from './types/env';

import { HttpProxyChecker } from '~/proxy_checker/http.checker';
import { WebsocketChecker } from '~/proxy_checker/websocket.checker';
import { env } from 'process';
import { Server } from '~/server';

const server = new Server(+env.PORT);
const proxy_checker = new HttpProxyChecker();
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