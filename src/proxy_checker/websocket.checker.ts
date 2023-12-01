import { RequestHandler } from 'express';
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent';
import { env } from 'process';
import WebSocket from 'ws';
import { Cache } from '~/cache';
import { WEBSOCKET_PROXIES_FILE_PATH, WEBSOCKET_TEST_URL } from '~/config';
import { FileSystem } from '~/FileSystem';
import { Logger } from '~/logger';
import { LoadedProxies, ProxyCheckResult } from '~/proxy_checker/types';
import { FreeProxyListNet } from '~/proxy_parser/api/free-proxy-list.net';
import { AddEndpointInterface } from '~/server/types';
import { Proxy } from '~/types';
import { deleteDuplicates, isEqualProxies, parseProxyToUrl, parseUrlToProxy } from '~/utils';

export class WebsocketChecker {
    private _logger: Logger;
    private _proxies_cache: Cache<Proxy[]>;

    private static MIN_COUNT_PROXIES = 4;

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

    public check(proxy: Proxy): Promise<ProxyCheckResult> {
        return new Promise((resolve, reject) => {
            const proxy_url = parseProxyToUrl(proxy);
            let agent;

            if (proxy.protocol.startsWith('http')) {
                agent = new HttpsProxyAgent({
                    proxy: proxy_url,
                    timeout: 4000,
                    keepAlive: true,
                    keepAliveMsecs: 4000,
                    sessionTimeout: 4000,
                });
            } else {
                this._logger.error(`protocol ${ proxy.protocol } is not supported`);
                resolve({ availability: false, proxy });
            }

            const ws = new WebSocket(WEBSOCKET_TEST_URL, {
                agent,
                timeout: 4000,
                handshakeTimeout: 4000,
                sessionTimeout: 4000,
            });

            ws.on('error', (e) => {
                this._logger.error(proxy_url, e.message);

                resolve({ availability: false, proxy });
            });

            ws.on('unexpected-response', (req, res) => {
                this._logger.error(proxy_url, res.statusCode);

                resolve({ availability: false, proxy });
            });

            ws.on('open', () => {
                this._logger.happy(proxy_url, ' proxy work');
                ws.close();

                resolve({ availability: true, proxy });
            });
        });
    }

    private async _validateProxies(proxies: Proxy[]): Promise<Proxy[]> {
        const results = await Promise.allSettled(proxies.map(this.check.bind(this)));

        this._logger.log(results.find((r) => r.status === 'rejected'));

        return results.reduce((acc, res) => {
            if (res.status === 'fulfilled') {
                if (res.value.availability) {
                    acc.push(res.value.proxy);
                }
            }

            return acc;
        }, [] as Proxy[]);
    }

    private _checkEndpointHandler: RequestHandler<{}, unknown, string[]> = async (req, res) => {
        this._logger.log(`validating ${ req.body.length } proxies...`);

        const result = await this._validateProxies(req.body.map(parseUrlToProxy));

        this._logger.log(`available ${ result.length } proxies`);

        res.status(200);
        res.appendHeader('content-type', 'application/json');

        res.send(result);
    };

    private _getProxiesEndpointHandler: RequestHandler<{}, unknown, unknown> = async (req, res) => {
        if (this._proxies_cache.isExpired || this._proxies_cache.data!.length < WebsocketChecker.MIN_COUNT_PROXIES) {
            let working_proxies: Proxy[] = [];

            const saved_proxies = await this._loadProxiesFromFile()
            .then((r) => r.proxies);

            this._logger.log('validating saved proxies...');

            const validated_saved_proxies = await this._validateProxies(saved_proxies);

            this._logger.log(`working ${ validated_saved_proxies.length } saved proxies`);

            working_proxies.push(...validated_saved_proxies);

            if (validated_saved_proxies.length < WebsocketChecker.MIN_COUNT_PROXIES) {
                const loaded_proxies = await FreeProxyListNet.load();

                this._logger.log(`validating ${ loaded_proxies.length } loaded from parser proxies...`);

                const validated_loaded_proxies = await this._validateProxies(loaded_proxies);

                this._logger.log(`working ${ validated_loaded_proxies.length } loaded proxies`);

                working_proxies.push(...validated_loaded_proxies);
            }

            working_proxies = deleteDuplicates(working_proxies, isEqualProxies);

            this._proxies_cache.update(working_proxies);
            this._saveProxiesToFile(working_proxies);
        }

        res.status(200);
        res.appendHeader('content-type', 'application/json');

        res.send(this._proxies_cache.data);
    };

    private async _loadProxiesFromFile(): Promise<LoadedProxies> {
        try {
            const stat = await FileSystem.getStatOfFile(WEBSOCKET_PROXIES_FILE_PATH);
            const proxies = await FileSystem.loadFromFile<Proxy[]>(WEBSOCKET_PROXIES_FILE_PATH);

            this._logger.happy(`loaded ${ proxies.length } proxies from file`);

            return { last_update: stat.mtime.getTime(), proxies };
        } catch (e) {
            if (e instanceof Error) {
                this._logger.error('failed to load proxies from file');
                this._logger.error(e.message, '\r\n');

                return { last_update: 0, proxies: [] };
            } else throw e;
        }
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