import axios from 'axios';
import { JSDOM } from 'jsdom';
import { env } from 'process';
import { Cache } from '~/cache';
import { Logger } from '~/logger';
import { Proxy } from '~/types';
import { common_headers } from '../common_headers';

export class FreeProxyListNet {
    private static _url = 'https://free-proxy-list.net/';
    private static _logger = new Logger('parser free-proxy-list.net');
    private static _cache: Cache<Proxy[]> = new Cache<Proxy[]>(+env.PROXY_CACHE_TTL);

    public static async load(): Promise<Proxy[]> {
        if (!FreeProxyListNet._cache.isExpired) return FreeProxyListNet._cache.data!;

        return FreeProxyListNet._fetchPage()
        .then(async (page) => {
            const parsed = await FreeProxyListNet._parsePage(page);
            this._cache.update(parsed);

            return this._cache.data!;
        })
        .catch((e) => {
            if (e instanceof Error) {
                FreeProxyListNet._logger.error(e.message);
            }

            throw e;
        });

    }

    private static async _parsePage(page_string: string): Promise<Proxy[]> {
        try {
            const page = new JSDOM(page_string);

            const trs = page.window.document
            .querySelector('table')!
            .querySelector('tbody')!
            .querySelectorAll('tr')!;

            const proxies: Proxy[] = [];

            for (const tr of trs) {
                const tds = tr.querySelectorAll('td');

                const ip = tds.item(0).innerHTML;
                const port = +tds.item(1).innerHTML;
                const isHttpsString = tds.item(6).innerHTML;

                if (
                    isHttpsString === 'no' || isHttpsString === 'yes'
                    && !isNaN(port)
                ) {
                    proxies.push({
                        protocol: isHttpsString === 'yes' ? 'https' : 'http',
                        host: ip,
                        port: port,
                    });
                }
            }

            return proxies;

        } catch (e) {
            if (e instanceof Error) {
                FreeProxyListNet._logger.error(e.message);
            }

            throw e;
        }
    }

    private static async _fetchPage(): Promise<string> {
        return axios.get<string>(FreeProxyListNet._url, {
            headers: common_headers,
        }).then((r) => r.data);
    }
}