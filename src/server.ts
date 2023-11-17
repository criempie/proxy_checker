import appRootPath from 'app-root-path';
import axios from 'axios';
import bodyParser from 'body-parser';
import express, { Request } from 'express';
import fs from 'fs';
import { env } from 'process';
import readline from 'readline';
import { FreeProxyListNet } from '~/proxy_parser/api/free-proxy-list.net';
import { Logger } from './logger';
import { Proxy, ProxyCheckResult, testProxy } from './proxy_checker';
import { parseProxyToUrl, parseUrlToProxy } from './utils';

interface CheckProxyResponse {
    working: Proxy[],
    not_working: Proxy[],
    errored: Proxy[],
}

interface ProxiesWithTime {
    last_update: Date,
    proxies: Proxy[],
}

const FILES_ROOT = appRootPath.path + '/files/';

export function start() {
    const instance = express();
    const logger = new Logger('Server');
    let ip: string | undefined;

    let cached_proxies: ProxiesWithTime = {
        last_update: new Date(0),
        proxies: [],
    };

    // getIp()
    // .then((_ip) => {
    //     ip = _ip;
    //     logger.log(`Current ip is ${ Logger.makeUnderline(_ip) }`);
    // })
    // .catch((e) => {
    //     if (e instanceof Error) {
    //         logger.error(`Error during ip detection: ${ e.message }`);
    //     } else throw e;
    // });

    instance.use(bodyParser.json());

    instance.get('/', (req, res) => {
        res.status(200);

        res.send('hi');
    });

    instance.post('/check', async (req: Request<{}, CheckProxyResponse, string[]>, res) => {
        const result = await validateProxies(req.body.map(parseUrlToProxy));

        res.status(200);
        res.appendHeader('content-type', 'application/json');

        res.send(result);
    });

    instance.get('/proxies', async (req, res) => {
        const proxies = await update(cached_proxies);
        if (cached_proxies !== proxies) {
            saveProxiesToFile(proxies.proxies);
            cached_proxies = proxies;
        }

        res.status(200);
        res.appendHeader('content-type', 'application/json');

        res.send(proxies);
    });

    instance.listen(+env.PORT, async () => {
        logger.log(`The server is running on port ${ Logger.makeUnderline(env.PORT) }`);

        cached_proxies = await readProxiesFromFile();
    });
}

async function getIp(): Promise<string> {
    return axios.get<{ ip: string }>('https://api.ipify.org?format=json')
    .then((r) => r.data.ip);
}

async function validateProxies(proxies: Proxy[]): Promise<{
    working: Proxy[],
    not_working: Proxy[],
    errored: Proxy[]
}> {
    const promises: Promise<ProxyCheckResult>[] = [];

    const working: Proxy[] = [];
    const not_working: Proxy[] = [];
    const errored: Proxy[] = [];

    proxies.forEach((proxy) => {
        promises.push(testProxy(proxy));
    });

    await Promise.allSettled(promises).then((promises) => {
        promises.forEach((p) => {
            if (p.status === 'fulfilled') {
                if (p.value.availability) working.push(p.value.proxy);
                else not_working.push(p.value.proxy);
            }
        });
    });

    return {
        working,
        not_working,
        errored,
    };
}

async function update(cached: ProxiesWithTime): Promise<ProxiesWithTime> {
    const TIME_TO_OUTDATE = 1000 * 60 * 4;

    // Check that the cached proxies is not outdated.
    if (Date.now() - cached.last_update.getTime() > TIME_TO_OUTDATE) {
        const proxies_to_validate: Proxy[] = [];
        let last_update: Date | undefined;

        await Promise.allSettled([
            readProxiesFromFile()
            .then((data) => {
                proxies_to_validate.push(...data.proxies);
                last_update = data.last_update;
            }),

            FreeProxyListNet.load()
            .then((proxies) => {
                proxies_to_validate.push(...proxies);
                last_update = new Date();
            }),
        ]);

        const result = await validateProxies(proxies_to_validate);

        return {
            last_update: last_update ?? new Date(0),
            proxies: result.working,
        };
    }

    return cached;
}

function saveProxiesToFile(proxies: Proxy[]): void {
    const logger = new Logger('ProxiesFile_writer');
    const writer = fs.createWriteStream(FILES_ROOT + 'proxies.txt', { autoClose: true, });

    writer.on('error', (e) => {
        logger.error(e.message);

    });

    const date_now = new Date();

    writer.write(date_now.toISOString() + '\r\n');

    for (const p of proxies) {
        writer.write(parseProxyToUrl(p) + '\r\n');
    }

    writer.end();
}

function readProxiesFromFile(): Promise<ProxiesWithTime> {
    /**
     * It is necessary, because using the usual "return" function "gets stuck" when an error occurs.
     * With Promise reject, the function terminates on error.
     */
    return new Promise(async (resolve, reject) => {
        const logger = new Logger('ProxiesFile_reader');
        const readStream = fs.createReadStream(FILES_ROOT + 'proxies.txt', { autoClose: true });

        const rl = readline.createInterface({
            input: readStream,
            crlfDelay: Infinity,
        });

        rl.on('error', (e) => {
            logger.error(e.message);
            reject(e.message);
        });

        let last_update: Date = new Date(0);
        const proxies: Proxy[] = [];

        let isFirstLine = true;
        for await (const line of rl) {
            const _line = line.trim();

            if (isFirstLine) {
                last_update = new Date(_line);
                isFirstLine = false;
                continue;
            }

            try {
                const proxy = parseUrlToProxy(_line);
                proxies.push(proxy);
            } catch (e) {
                if (e instanceof Error) {
                    logger.error(e.message, _line);
                }
            }
        }

        resolve({
            last_update,
            proxies
        });
    });
}