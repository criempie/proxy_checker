import appRootPath from 'app-root-path';
import { RequestHandler } from 'express';
import fs from 'fs';
import { env } from 'process';
import readline from 'readline';
import { Cache } from '~/cache';
import { HTTP_PROXIES_FILE_PATH, WEBSOCKET_PROXIES_FILE_PATH } from '~/config';
import { Echo, EchoResponse } from '~/echo/Echo';
import { PostmanEcho } from '~/echo/postman.echo';
import { FileSystem } from '~/FileSystem';
import { Logger } from '~/logger';
import { LoadedProxies, ProxyCheckResult } from '~/proxy_checker/types';
import { FreeProxyListNet } from '~/proxy_parser/api/free-proxy-list.net';
import { AddEndpointInterface } from '~/server/types';
import { Proxy } from '~/types';
import { deleteDuplicates, divideArrayIntoBatches, isEqualProxies, parseProxyToUrl, parseUrlToProxy } from '~/utils';

export class HttpProxyChecker {
    private _logger: Logger;
    private _echo: Echo;

    private static MIN_COUNT_PROXIES = 8;
    private static CHECK_PROXY_BASE_TIMEOUT = 4000;
    private static MAX_CHECK_BATCH = 25;

    private _proxies_cache = new Cache<Proxy[]>(+env.PROXY_CACHE_TTL);

    constructor() {
        this._logger = new Logger('HttpProxyChecker');
        this._echo = new PostmanEcho();
    }

    public getEndpoints(): AddEndpointInterface[] {
        return [
            {
                path: '/check',
                method: 'post',
                handler: this._checkEndpointHandler,
            }, {
                path: '/proxies',
                method: 'get',
                handler: this._getProxiesEndpointHandler,
            }
        ];
    }

    public check(proxy: Proxy): Promise<ProxyCheckResult> {
        return new Promise((resolve, reject) => {
            if (proxy.protocol === 'http') {
                this._echo.byHttp({
                    proxy,
                    timeout: HttpProxyChecker.CHECK_PROXY_BASE_TIMEOUT,
                })
                .then(() => {
                    resolve({
                        availability: true,
                        proxy,
                    });
                })
                .catch(reject);

            } else if (proxy.protocol === 'https') {
                this._echo.byHttps({
                    proxy,
                    timeout: HttpProxyChecker.CHECK_PROXY_BASE_TIMEOUT,
                })
                .then(() => {
                    resolve({
                        availability: true,
                        proxy,
                    });
                })
                .catch(reject);
            } else {
                reject(new Error(`protocol ${ proxy.protocol } not supported`));
            }
        });
    }

    private _checkEndpointHandler: RequestHandler<{}, unknown, string[]> = async (req, res) => {
        res.appendHeader('content-type', 'application/json');

        try {
            const result = await this._validateProxies(req.body.map(parseUrlToProxy));

            res.status(200);
            res.send(result);

        } catch (e) {
            if (e instanceof Error) {
                res.status(500);
                res.send({ msg: e.message });
            } else {
                this._logger.error(e);
                res.end();
            }
        }
    };

    private _getProxiesEndpointHandler: RequestHandler<{}, unknown, unknown> = async (req, res) => {
        const logger = this._logger.createChild('getProxies');

        if (this._proxies_cache.isExpired || this._proxies_cache.data!.length < HttpProxyChecker.MIN_COUNT_PROXIES) {
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

            if (validated_saved_proxies.length < HttpProxyChecker.MIN_COUNT_PROXIES) {
                const loaded_proxies = await FreeProxyListNet.load();
                const batches = divideArrayIntoBatches(loaded_proxies, HttpProxyChecker.MAX_CHECK_BATCH);

                for (let i = 0; i < batches.length; i++) {
                    const _logger = logger.createChild(`batch ${ i + 1 }/${ batches.length }`);
                    const validated_loaded_proxies = await this._validateProxies(batches[i], _logger);
                    working_proxies.push(...validated_loaded_proxies);
                }
            }

            working_proxies = deleteDuplicates(working_proxies, isEqualProxies);

            logger.happy(working_proxies.length, 'working proxies');

            this._proxies_cache.update(working_proxies);

            this._saveProxiesToFile(working_proxies).catch((e) => {
                if (e instanceof Error) {
                    logger.warning('failed saving proxies to file:', e.message);
                }
                logger.error(e);
            });
        }

        res.status(200);
        res.appendHeader('content-type', 'application/json');

        res.send(this._proxies_cache.data);
    };

    private async _validateProxies(proxies: Proxy[], _logger?: Logger): Promise<Proxy[]> {
        const loggerCounter = (_logger ?? this._logger).createCounter(proxies.length);

        const validated: Proxy[] = [];
        const promises = proxies.map((p) => {
            return this.check(p)
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

    private async _loadProxiesFromFile(): Promise<LoadedProxies> {
        const stat = await FileSystem.getStatOfFile(HTTP_PROXIES_FILE_PATH);
        const proxies = await FileSystem.loadFromFile<Proxy[]>(HTTP_PROXIES_FILE_PATH);

        return { last_update: stat.mtime.getTime(), proxies };
    }

    private async _saveProxiesToFile(proxies: Proxy[]): Promise<void> {
        return FileSystem.saveToFile(HTTP_PROXIES_FILE_PATH, proxies);
    }
}