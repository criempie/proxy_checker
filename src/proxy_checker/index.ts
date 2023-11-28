import appRootPath from 'app-root-path';
import { RequestHandler } from 'express';
import fs from 'fs';
import readline from 'readline';
import { Cache } from '~/cache';
import { DadjokesOnlineEcho } from '~/echo/dadjokes-online.echo';
import { Echo, EchoResponse } from '~/echo/Echo';
import { PostmanEcho } from '~/echo/postman.echo';
import { Logger } from '~/logger';
import { ProxyCheckResult } from '~/proxy_checker/types';
import { FreeProxyListNet } from '~/proxy_parser/api/free-proxy-list.net';
import { AddEndpointInterface } from '~/server/types';
import { Proxy } from '~/types';
import { deleteDuplicates, isEqualProxies, parseProxyToUrl, parseUrlToProxy } from '~/utils';
import { env } from 'process';

export class ProxyChecker {
    private _logger: Logger;
    private _echo: Echo;

    private static FILES_DIR = appRootPath.path + '/files/';
    private static MIN_COUNT_CACHED_PROXIES = 8;

    private proxies_cache = new Cache<Proxy[]>(+env.PROXY_CACHE_TTL);

    constructor() {
        this._logger = new Logger('ProxyChecker');
        this._echo = new PostmanEcho();
    }

    public async check(proxy: Proxy): Promise<ProxyCheckResult> {
        try {
            let echo_data: EchoResponse;

            if (proxy.protocol === 'http') {
                echo_data = await this._echo.byHttp({
                    proxy,
                    timeout: 4000,
                });
            } else if (proxy.protocol === 'https') {
                echo_data = await this._echo.byHttps({
                    proxy,
                    timeout: 4000,
                });
            } else {
                echo_data = await this._echo.bySocks({
                    proxy,
                    timeout: 4000,
                });
            }

            this._logger.happy(`Proxy ${ Logger.makeUnderline(parseProxyToUrl(proxy)) } is working`);
            this._logger.happy('headers:', echo_data.headers, '\n');

            return {
                availability: true,
                proxy,
            };

        } catch (e) {
            if (e instanceof Error) {
                this._logger.error(`Proxy ${ Logger.makeUnderline(parseProxyToUrl(proxy)) } does not working`);
                this._logger.error(e.message.trim(), '\n');
            } else throw e;

            return {
                availability: false,
                proxy,
            };
        }
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
        const result = await this._validateProxies(req.body.map(parseUrlToProxy));

        res.status(200);
        res.appendHeader('content-type', 'application/json');

        res.send(result);
    };

    private _getProxiesEndpointHandler: RequestHandler<{}, unknown, unknown> = async (req, res) => {
        if (this.proxies_cache.isExpired || this.proxies_cache.data!.length < ProxyChecker.MIN_COUNT_CACHED_PROXIES) {
            let working_proxies: Proxy[] = [];

            const saved_proxies = await this._loadProxiesFromFile()
            .then((r) => r.proxies)
            .catch(() => [] as Proxy[]);

            const validated_saved_proxies = await this._validateProxies(saved_proxies);

            working_proxies.push(...validated_saved_proxies);

            if (validated_saved_proxies.length < ProxyChecker.MIN_COUNT_CACHED_PROXIES) {
                const loaded_proxies = await FreeProxyListNet.load();
                const validated_loaded_proxies = await this._validateProxies(loaded_proxies);

                working_proxies.push(...validated_loaded_proxies);
            }

            working_proxies = deleteDuplicates(working_proxies, isEqualProxies);

            this.proxies_cache.update(working_proxies);
            this._saveProxiesToFile(working_proxies);
        }

        res.status(200);
        res.appendHeader('content-type', 'application/json');

        res.send(this.proxies_cache.data);
    };

    private async _validateProxies(proxies: Proxy[]): Promise<Proxy[]> {
        const promises: Promise<ProxyCheckResult>[] = [];

        const validated_proxies: Proxy[] = [];

        proxies.forEach((proxy) => {
            promises.push(this.check(proxy));
        });

        await Promise.allSettled(promises).then((promises) => {
            promises.forEach((p) => {
                if (p.status === 'fulfilled') {
                    if (p.value.availability) {
                        validated_proxies.push(p.value.proxy);
                    }
                }
            });
        });

        return validated_proxies;
    }

    private _saveProxiesToFile(proxies: Proxy[]): void {
        const logger = new Logger('ProxiesFile_writer');
        const writer = fs.createWriteStream(ProxyChecker.FILES_DIR + 'proxies.txt', { autoClose: true, });

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

    private _loadProxiesFromFile(): Promise<{ last_update: number, proxies: Proxy[] }> {
        /**
         * It is necessary, because using the usual "return" function "gets stuck" when an error occurs.
         * With Promise reject, the function terminates on error.
         */
        return new Promise(async (resolve, reject) => {
            const logger = new Logger('ProxiesFile_reader');
            const readStream = fs.createReadStream(ProxyChecker.FILES_DIR + 'proxies.txt', { autoClose: true });

            const rl = readline.createInterface({
                input: readStream,
                crlfDelay: Infinity,
            });

            rl.on('error', (e) => {
                logger.error(e.message);
                reject(e.message);
            });

            let last_update: number = 0;
            const proxies: Proxy[] = [];

            try {
                let isFirstLine = true;
                for await (const line of rl) {
                    const _line = line.trim();

                    if (isFirstLine) {
                        last_update = (new Date(_line)).getTime();
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
            } catch (e) {
                if (e instanceof Error) {
                    reject(e.message);
                } else throw e;
            }

            resolve({
                last_update,
                proxies
            });
        });
    }
}