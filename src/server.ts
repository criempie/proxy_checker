import bodyParser from 'body-parser';
import express, { Request } from 'express';
import { env } from 'process';
import { Logger } from './logger';
import { proxyChecker } from './proxy_checker';
import { CheckHttpResponse, HeadersTestResponse, Proxy, ProxyCheckResult } from './types';

const instance = express();

instance.use(bodyParser.json());

const logger = new Logger('server');

instance.get('/', (req, res) => {
    res.status(200);
    res.send('hi');
});

instance.post('/check_http', async (req: Request<{}, any, null, { url?: string }>, res) => {
    const { url } = req.query;

    res.appendHeader('content-type', 'application/json');

    if (!url) {
        res.status(500);
        res.send({ msg: 'url parameter not provided' });
        return;
    }

    const proxy = proxyChecker.parseUrlToProxy(url);
    // @ts-ignore
    const result = await proxyChecker._testHttpProxy(proxy);

    res.status(200);
    res.send({
        result,
    });
});

instance.post('/__inner/proxy', (req: Request<{}, HeadersTestResponse, null>, res) => {
    res.status(200);
    res.appendHeader('content-type', 'application/json');

    res.send({
        headers: req.headers,
    });
});

// instance.post('/check_http', async (req: Request<{}, CheckHttpResponse, string[]>, res) => {
//     const headers = req.headers;
//
//     const proxy_urls = req.body.map(proxyChecker.parseUrlToProxy);
//
//     const http_proxy = proxy_urls.filter((p) => p.protocol === 'http' || p.protocol === 'https');
//
//     const result: CheckHttpResponse = [];
//
//     for (let i = 0; i < http_proxy.length; i++) {
//         const proxy = http_proxy[i];
//
//         // @ts-ignore
//         const check_result = await proxyChecker._testHttpProxy(proxy);
//
//         result.push(check_result);
//     }
//
//     res.send(result);
// });

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