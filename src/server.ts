import axios from 'axios';
import bodyParser from 'body-parser';
import express, { Request } from 'express';
import { env } from 'process';
import { Logger } from './logger';
import { ProxyCheckResult, testProxy } from './proxy_checker';
import { parseProxyToUrl, parseUrlToProxy } from './utils';

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

    instance.post('/check', async (req: Request<{}, CheckProxyResponse, string[]>, res) => {
        const promises: Promise<ProxyCheckResult>[] = [];

        const working: string[] = [];
        const not_working: string[] = [];
        const errored: string[] = [];

        req.body.forEach((url) => {
            try {
                const proxy = parseUrlToProxy(url);
                promises.push(testProxy(proxy));
            } catch (e) {
                errored.push(url);
            }

        });

        await Promise.allSettled(promises).then((promises) => {
            promises.forEach((p) => {
                if (p.status === 'fulfilled') {
                    if (p.value.availability) working.push(parseProxyToUrl(p.value.proxy));
                    else not_working.push(parseProxyToUrl(p.value.proxy));
                }
            });
        });

        res.status(200);
        res.appendHeader('content-type', 'application/json');

        res.send({
            working,
            not_working,
            errored,
        });
    });

    instance.listen(+env.PORT, () => {
        logger.log(`The server is running on port ${ Logger.makeUnderline(env.PORT) }`);
    });
}

async function getIp(): Promise<string> {
    return axios.get<{ ip: string }>('https://api.ipify.org?format=json')
    .then((r) => r.data.ip);
}

interface CheckProxyResponse {
    working: string[],
    not_working: string[],
    errored: string[],
}