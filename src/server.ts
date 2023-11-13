import bodyParser from 'body-parser';
import express, { Request } from 'express';
import { env } from 'process';
import { Logger } from './logger';
import { testProxy } from './proxy_checker';
import { ProxyCheckResult } from './types';
import { parseUrlToProxy } from './utils';

const instance = express();
const logger = new Logger('server');

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
    logger.log(`The server is running on port ${ env.PORT }.`);
    logger.log(`It is assumed that the URL is ${ getServerUrl() }`);
});

function getServerUrl(customProtocol?: string): string {
    return `${ customProtocol ?? env.PROTOCOL }://${ env.HOST }:${ env.PORT }/`;
}

export const server = {
    instance,
    getServerUrl,
};