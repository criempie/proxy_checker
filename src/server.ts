import axios from 'axios';
import bodyParser from 'body-parser';
import express, { Request } from 'express';
import { env } from 'process';
import { Logger } from './logger';
import { ProxyCheckResult, testProxy } from './proxy_checker';
import { parseUrlToProxy } from './utils';

export function start() {
    const instance = express();
    const logger = new Logger('Server');
    let ip: string | undefined;

    getIp()
    .then((_ip) => {
        ip = _ip;
        logger.log(`Current ip is ${ Logger.makeUnderline(_ip) }`);
    })
    .catch((e) => {
        if (e instanceof Error) {
            logger.error(`Error during ip detection: ${ e.message }`);
        } else throw e;
    });

    instance.use(bodyParser.json());

    instance.get('/', (req, res) => {
        res.status(200);

        res.send('hi');
    });

    instance.post('/check', async (req: Request<{}, any, string[]>, res) => {
        const promises: Promise<ProxyCheckResult>[] = [];

        req.body.forEach((url) => {
            try {
                const proxy = parseUrlToProxy(url);
                promises.push(testProxy(proxy));
            } catch (e) {}

        });

        const result = await Promise.allSettled(promises);

        res.status(200);
        res.appendHeader('content-type', 'application/json');

        res.send(result);
    });

    instance.listen(+env.PORT, () => {
        logger.log(`The server is running on port ${ Logger.makeUnderline(env.PORT) }`);
    });
}

async function getIp(): Promise<string> {
    return axios.get<{ ip: string }>('https://api.ipify.org?format=json')
    .then((r) => r.data.ip);
}