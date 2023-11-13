import dotenv from 'dotenv-safe';

// It is necessary that process.env is available in all files.
dotenv.config();

import {} from './env';

// It is necessary that typescript does
// not think that environment variables are undefined (dotenv-safe catches them).
import { server } from './server';


const a = server;