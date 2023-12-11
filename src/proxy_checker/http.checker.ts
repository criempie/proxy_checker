import axios from 'axios';
import { RequestHandler } from 'express';
import { env } from 'process';
import { Cache } from '~/cache';
import { HTTP_PROXIES_FILE_PATH } from '~/config';
import { Echo } from '~/echo/Echo';
import { PostmanEcho } from '~/echo/postman.echo';
import { FileSystem } from '~/FileSystem';
import { Logger } from '~/logger';
import { LoadedProxies, ProxyCheckResult } from '~/proxy_checker/types';
import { FreeProxyListNet } from '~/proxy_parser/level_0/free-proxy-list.net';
import { AddEndpointInterface, ServerError } from '~/server/types';
import { Proxy } from '~/types';
import { deleteDuplicates, divideArrayIntoBatches, isEqualProxies, parseProxyToUrl, parseUrlToProxy } from '~/utils';

export class HttpProxyChecker {
    private _logger: Logger;
    private _echo: Echo;

    // If the number of proxies in the cache is less, then new data from the parser will be requested.
    private static MIN_COUNT_PROXIES = 4;

    // If the number of loaded and validated proxies from the file is greater,
    // then there is no need to request new ones from the parser.
    private static ENOUGH_PROXIES_COUNT = 50;
    private static CHECK_PROXY_TIMEOUT = 4000;

    // The number of concurrently validated proxies.
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

    private _getProxiesEndpointHandler: RequestHandler<{}, Proxy[] | ServerError, null, { url?: string }> = async (req,
                                                                                                                   res) => {
        res.appendHeader('content-type', 'application/json');

        let result: Proxy[] = [];

        try {
            if (this._proxies_cache.isExpired || this._proxies_cache.data!.length < HttpProxyChecker.MIN_COUNT_PROXIES) {
                await this._getProxies()
                .then((proxies) => {
                    this._proxies_cache.update(proxies);
                    this._saveProxiesToFile(proxies).catch((e) => {
                        this._logger.warning('Failed saving working proxies to file:', e?.message ?? e);
                    });
                    result = this._proxies_cache.data!;
                });
            }

            if (req.query.url) {
                const batches = divideArrayIntoBatches(this._proxies_cache.data!, HttpProxyChecker.MAX_CHECK_BATCH);

                for (let i = 0; i < batches.length; i++) {
                    this._logger.createChild(`Batch ${ i + 1 }/${ batches.length }`).log('Processing...');

                    await this._validateProxiesByUrl(batches[i], req.query.url)
                    .then((proxies) => {
                        result = proxies;
                    })
                    .catch((e) => {
                        this._logger.error('Error during validation by url', req.query.url, e?.message ?? e);
                    });
                }
            }

            res.status(200);
            res.send(result);

        } catch (e: any) {
            res.status(500);

            if (e instanceof Error) {
                res.send({ msg: e.message });
            } else {
                res.end();
                throw e;
            }
        }
    };

    public checkByEcho(proxy: Proxy): Promise<ProxyCheckResult> {
        return new Promise((resolve, reject) => {
            switch (proxy.protocol) {
                case 'http': {
                    this._echo.byHttp({
                        proxy,
                        timeout: HttpProxyChecker.CHECK_PROXY_TIMEOUT,
                    })
                    .then(() => {
                        resolve({
                            availability: true,
                            proxy,
                        });
                    })
                    .catch(reject);

                    break;
                }

                case 'https': {
                    this._echo.byHttps({
                        proxy,
                        timeout: HttpProxyChecker.CHECK_PROXY_TIMEOUT,
                    })
                    .then(() => {
                        resolve({
                            availability: true,
                            proxy,
                        });
                    })
                    .catch(reject);

                    break;
                }

                default: {
                    reject(new Error(`protocol ${ proxy.protocol } not supported`));
                }
            }
        });
    }

    public async checkByUrl(proxy: Proxy, url: string): Promise<ProxyCheckResult> {
        const parsed_url = new URL(url);

        parsed_url.protocol = proxy.protocol + ':';

        await axios.head(parsed_url.href, {
            timeout: HttpProxyChecker.CHECK_PROXY_TIMEOUT,
            proxy,
        });

        return {
            availability: true,
            proxy,
        };
    }

    private async _getProxies() {
        let working_proxies: Proxy[] = [];

        const saved_proxies = await this._loadProxiesFromFile()
        .then((r) => r.proxies)
        .catch(() => [] as Proxy[]);

        const validated_saved_proxies = await this._validateProxies(saved_proxies);

        working_proxies.push(...validated_saved_proxies);

        if (working_proxies.length < HttpProxyChecker.ENOUGH_PROXIES_COUNT) {
            const loaded_proxies = await FreeProxyListNet.load();
            const batches = divideArrayIntoBatches(loaded_proxies, HttpProxyChecker.MAX_CHECK_BATCH);

            for (let i = 0; i < batches.length; i++) {
                this._logger.createChild(`Batch ${ i + 1 }/${ batches.length }`).log('Processing...');
                const validated_loaded_proxies = await this._validateProxies(batches[i]);
                working_proxies.push(...validated_loaded_proxies);
            }
        }

        return deleteDuplicates(working_proxies, isEqualProxies);
    }

    private async _validateProxies(proxies: Proxy[]): Promise<Proxy[]> {
        const loggerCounter = this._logger.createChild('Validation').createCounter(proxies.length);

        const validated: Proxy[] = [];
        const promises = proxies.map((p) => {
            return this.checkByEcho(p)
            .then((r) => {
                if (!r.availability) return;

                loggerCounter.happy(parseProxyToUrl(r.proxy), 'works');
                validated.push(r.proxy);
            })
            .catch((e) => {
                loggerCounter.error(parseProxyToUrl(p) + ':', e.message ?? e);
            });
        });

        return Promise.all(promises).then(() => validated);
    }

    private async _validateProxiesByUrl(proxies: Proxy[], url: string): Promise<Proxy[]> {
        const loggerCounter = this._logger.createChild(`Validation for ${ url }`).createCounter(proxies.length);

        const validated: Proxy[] = [];
        const promises = proxies.map((p) => {
            return this.checkByUrl(p, url)
            .then((r) => {
                if (!r.availability) return;

                loggerCounter.happy(parseProxyToUrl(r.proxy), 'works');
                validated.push(r.proxy);
            })
            .catch((e) => {
                loggerCounter.error(parseProxyToUrl(p) + ':', e.message ?? e);
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