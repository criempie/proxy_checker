import axios from 'axios';
import { RequestHandler } from 'express';
import { env } from 'process';
import { Cache } from '~/cache';
import { HTTP_PROXIES_FILE_PATH } from '~/config';
import { Echo } from '~/echo/Echo';
import { PostmanEcho } from '~/echo/postman.echo';
import { FileSystem } from '~/FileSystem';
import { Logger } from '~/logger';
import { CheckedProxy, LoadedProxies, ProxyCheckResult } from '~/proxy_checker/types';
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

    // The number of checks (to determine the stability of the proxy).
    private static CHECK_ATTEMPTS_COUNT = 8;

    // Minimal proxy stability. The others will be discarded. 0.0 - 1.0.
    private static MIN_PROXY_STABILITY = 0.6;

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
                const result_for_url: Proxy[] = [];

                this._logger.log(`Processing proxies for url ${ req.query.url }`);

                for (let i = 0; i < batches.length; i++) {
                    this._logger.createChild(`Batch ${ i + 1 }/${ batches.length }`).log('Processing...');

                    await this._validateProxies(batches[i], HttpProxyChecker.CHECK_ATTEMPTS_COUNT, req.query.url)
                    .then((proxies) => {
                        return proxies.reduce((acc, p) => {
                            if (p.stability >= HttpProxyChecker.MIN_PROXY_STABILITY) {
                                acc.push(p.proxy);
                            }

                            return acc;
                        }, [] as Proxy[]);
                    })
                    .then((proxies) => {
                        result_for_url.push(...proxies);
                        this._logger.log(
                            `${ proxies.length } of them have stability greater than ${ HttpProxyChecker.MIN_PROXY_STABILITY }.`);
                    })
                    .catch((e) => {
                        this._logger.error('Error during validation by url', req.query.url, e?.message ?? e);
                    });
                }

                this._logger.log(
                    `In total, there were ${ result_for_url.length } working proxies with stability above ${ HttpProxyChecker.MIN_PROXY_STABILITY }`
                );

                result = result_for_url;
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

        this._logger.log(`Loaded ${ saved_proxies.length } proxies from file.`);

        const validated_saved_proxies = await this._validateProxies(saved_proxies,
            HttpProxyChecker.CHECK_ATTEMPTS_COUNT)
        .then((proxies) => {
            return proxies.reduce((acc, p) => {
                if (p.stability >= HttpProxyChecker.MIN_PROXY_STABILITY) {
                    acc.push(p.proxy);
                }

                return acc;
            }, [] as Proxy[]);
        });

        this._logger.log(
            `${ validated_saved_proxies.length } of them have stability greater than ${ HttpProxyChecker.MIN_PROXY_STABILITY }.`
        );

        working_proxies.push(...validated_saved_proxies);

        if (working_proxies.length < HttpProxyChecker.ENOUGH_PROXIES_COUNT) {
            const loaded_proxies = await FreeProxyListNet.load();
            const batches = divideArrayIntoBatches(loaded_proxies, HttpProxyChecker.MAX_CHECK_BATCH);

            this._logger.log(`Loaded ${ loaded_proxies.length } proxies from FreeProxyListNet parser.`);
            this._logger.log(
                `They are divided into ${ batches.length } parties of ${ HttpProxyChecker.MAX_CHECK_BATCH } proxies.`
            );

            for (let i = 0; i < batches.length; i++) {
                this._logger.createChild(`Batch ${ i + 1 }/${ batches.length }`).log('Processing...');
                const validated_loaded_proxies = await this._validateProxies(
                    batches[i],
                    HttpProxyChecker.CHECK_ATTEMPTS_COUNT
                )
                .then((proxies) => {
                    return proxies.reduce((acc, p) => {
                        if (p.stability >= HttpProxyChecker.MIN_PROXY_STABILITY) {
                            acc.push(p.proxy);
                        }

                        return acc;
                    }, [] as Proxy[]);
                });

                this._logger.log(
                    `${ validated_loaded_proxies.length } of them have stability greater than ${ HttpProxyChecker.MIN_PROXY_STABILITY }.`
                );

                working_proxies.push(...validated_loaded_proxies);
            }
        }

        const working_proxy_without_duplicates = deleteDuplicates(working_proxies, isEqualProxies);

        this._logger.log(
            `In total, there were ${ working_proxy_without_duplicates.length } working proxies with stability above ${ HttpProxyChecker.MIN_PROXY_STABILITY }`
        );

        return working_proxy_without_duplicates;
    }

    private async _validateProxies(proxies: Proxy[], attempts: number = 1, url?: string): Promise<CheckedProxy[]> {
        const proxies_success: Record<string, { success: number, proxy: Proxy }> = proxies.reduce((acc: any, p) => {
            acc[parseProxyToUrl(p)] = { proxy: p, success: 0 };
            return acc;
        }, {});

        for (let i = 0; i < attempts; i++) {
            const logger = this._logger.createChild(`Validation attempt ${ i + 1 }/${ attempts }`);

            logger.log(`Processing ${ proxies.length } proxies...`);

            const promises = proxies.map((p) => {
                let checkPromise: Promise<ProxyCheckResult>;

                if (url) checkPromise = this.checkByUrl(p, url);
                else checkPromise = this.checkByEcho(p);

                return checkPromise;
            });

            await Promise.allSettled(promises)
            .then((settled) => {
                settled.forEach((r) => {
                    if (r.status === 'fulfilled') {
                        if (r.value.availability) {
                            proxies_success[parseProxyToUrl(r.value.proxy)].success++;
                        }
                    }
                });
            });
        }

        return Object.values(proxies_success).map((s) => {
            return {
                proxy: s.proxy,
                stability: +(s.success / attempts).toFixed(2),
            };
        });
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