import { RequestHandler } from 'express';
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent';
import { env } from 'process';
import WebSocket from 'ws';
import { Cache } from '~/cache';
import { WEBSOCKET_PROXIES_FILE_PATH, WEBSOCKET_TEST_URL } from '~/config';
import { FileSystem } from '~/FileSystem';
import { Logger } from '~/logger';
import { WebsocketError } from '~/proxy_checker/errors';
import { LoadedProxies, ProxyCheckResult } from '~/proxy_checker/types';
import { FreeProxyListNet } from '~/proxy_parser/api/free-proxy-list.net';
import { AddEndpointInterface, ServerError } from '~/server/types';
import { Proxy } from '~/types';
import { deleteDuplicates, divideArrayIntoBatches, isEqualProxies, parseProxyToUrl, parseUrlToProxy } from '~/utils';

export class WebsocketChecker {
    private _logger: Logger;
    private _proxies_cache: Cache<Proxy[]>;

    private static MIN_COUNT_PROXIES = 4;
    private static CHECK_PROXY_BASE_TIMEOUT = 4000;
    private static MAX_CHECK_BATCH = 25;

    constructor() {
        this._logger = new Logger('WebsocketProxyChecker');
        this._proxies_cache = new Cache<Proxy[]>(+env.PROXY_CACHE_TTL);
    }

    public getEndpoints(): AddEndpointInterface[] {
        return [
            {
                path: '/check_websocket',
                method: 'post',
                handler: this._checkEndpointHandler,
            }, {
                path: '/proxies_websocket',
                method: 'get',
                handler: this._getProxiesEndpointHandler,
            }
        ];
    }

    public check(proxy: Proxy, timeout: number): Promise<ProxyCheckResult> {
        return new Promise((resolve, reject) => {
            const proxy_url = parseProxyToUrl(proxy);
            let agent;

            if (proxy.protocol.startsWith('http')) {
                agent = new HttpsProxyAgent({
                    proxy: proxy_url,
                    timeout,
                });
            } else {
                reject(new Error(`protocol ${ proxy.protocol } not supported`));
            }

            const ws = new WebSocket(WEBSOCKET_TEST_URL, {
                agent,
                timeout,
            });

            const timer = setTimeout(() => {
                ws.close();
                reject(new Error('timeout'));
            }, timeout + WebsocketChecker.CHECK_PROXY_BASE_TIMEOUT);

            ws.on('error', (e) => {
                clearTimeout(timer);
                reject(new WebsocketError(e.message));
            });

            ws.on('close', (c, r) => {
                clearTimeout(timer);
                reject(new WebsocketError(r.toString()));
            });

            ws.on('unexpected-response', (req, res) => {
                clearTimeout(timer);
                reject(new WebsocketError(`unexpected-response ${ res.statusCode }`));
            });

            ws.on('open', () => {
                ws.close();
                clearTimeout(timer);
                resolve({ availability: true, proxy });
            });
        });
    }

    private async _validateProxies(proxies: Proxy[], _logger?: Logger): Promise<Proxy[]> {
        const loggerCounter = (_logger ?? this._logger).createCounter(proxies.length);

        const check_timeout = WebsocketChecker.CHECK_PROXY_BASE_TIMEOUT;

        const validated: Proxy[] = [];
        const promises = proxies.map((p) => {
            return this.check(p, check_timeout)
            .then((r) => {
                if (!r.availability) return;

                loggerCounter.happy(parseProxyToUrl(r.proxy), 'works');
                validated.push(r.proxy);
            })
            .catch((e) => {
                loggerCounter.error(parseProxyToUrl(p), ':', e.message ?? e);
            });
        });

        return Promise.all(promises).then(() => validated);
    }

    private _checkEndpointHandler: RequestHandler<{}, Proxy[] | ServerError, string[]> = async (req, res) => {
        res.appendHeader('content-type', 'application/json');

        try {
            const result = await this._validateProxies(req.body.map(parseUrlToProxy));

            res.status(200);
            res.send(result);

        } catch (e) {
            if (e instanceof Error) {
                res.status(500);
                res.send({ msg: e.message });
            } else res.end();
        }
    };

    private _getProxiesEndpointHandler: RequestHandler<{}, unknown, unknown> = async (req, res) => {
        const logger = this._logger.createChild('getProxies');

        if (this._proxies_cache.isExpired || this._proxies_cache.data!.length < WebsocketChecker.MIN_COUNT_PROXIES) {
            let working_proxies: Proxy[] = [];

            const saved_proxies = await this._loadProxiesFromFile()
            .then((r) => {
                logger.happy(`loaded ${ r.proxies.length } from file`);

                return r.proxies;
            })
            .catch((e) => {
                if (e instanceof Error) {
                    logger.warning('failed loading proxies file:', e.message);
                } else logger.error(e);

                return [] as Proxy[];
            });

            const validated_saved_proxies = await this._validateProxies(saved_proxies, logger);
            working_proxies.push(...validated_saved_proxies);

            if (validated_saved_proxies.length < WebsocketChecker.MIN_COUNT_PROXIES) {
                const loaded_proxies = await FreeProxyListNet.load();
                const batches = divideArrayIntoBatches(loaded_proxies, WebsocketChecker.MAX_CHECK_BATCH);

                for (let i = 0; i < batches.length; i++) {
                    const _logger = logger.createChild(`batch ${ i + 1 }/${ batches.length }`);
                    const validated_loaded_proxies = await this._validateProxies(batches[i], _logger);
                    working_proxies.push(...validated_loaded_proxies);
                }
            }

            working_proxies = deleteDuplicates(working_proxies, isEqualProxies);

            logger.happy(working_proxies.length, 'working proxies');

            this._proxies_cache.update(working_proxies);
            this._saveProxiesToFile(working_proxies);
        }

        res.status(200);
        res.appendHeader('content-type', 'application/json');

        res.send(this._proxies_cache.data);
    };

    private async _loadProxiesFromFile(): Promise<LoadedProxies> {
        const stat = await FileSystem.getStatOfFile(WEBSOCKET_PROXIES_FILE_PATH);
        const proxies = await FileSystem.loadFromFile<Proxy[]>(WEBSOCKET_PROXIES_FILE_PATH);

        return { last_update: stat.mtime.getTime(), proxies };
    }

    private async _saveProxiesToFile(proxies: Proxy[]): Promise<void> {
        try {
            await FileSystem.saveToFile(WEBSOCKET_PROXIES_FILE_PATH, proxies);
        } catch (e) {
            if (e instanceof Error) {
                this._logger.error('failed to save proxies to file');
                this._logger.error(e.message, '\r\n');
            } else throw e;
        }
    }
}