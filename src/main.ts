import dotenv from 'dotenv-safe';
import { proxyChecker } from './proxy_checker';

// It is necessary that process.env is available in all files.
dotenv.config();

import { server } from './server';

// It is necessary that typescript does
// not think that environment variables are undefined (dotenv-safe catches them).
import {} from './env';


const a = server;