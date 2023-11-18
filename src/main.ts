import dotenv from 'dotenv-safe';
import { ProxyChecker } from '~/proxy_checker';

// It is necessary that process.env is available in all files.
dotenv.config();

// It is necessary that typescript does not
// think that environment variables are undefined (dotenv-safe catches them).
import {} from './types/env';

import { env } from 'process';
import { Server } from '~/server';

const server = new Server(+env.PORT);
const proxy_checker = new ProxyChecker();

proxy_checker.getEndpoints()
.forEach(({ path, method, handler }) => {
    server.addEndpoint(path, method, handler);
});

server.start();