import axios from 'axios';
import { JSDOM } from 'jsdom';
import { env } from 'process';
import { Cache } from '~/cache';
import { Logger } from '~/logger';
import { common_headers } from '~/proxy_parser/common_headers';
import { Proxy } from '~/types';
import { getSuitableAgent, parseProxyToUrl } from '~/utils';

export class FreeProxyCz {
    private static _logger: Logger = new Logger('FreeProxyCzParser');
    private static _cache: Cache<Proxy[]> = new Cache<Proxy[]>(+env.PROXY_CACHE_TTL);

    private static _page = 1;

    private static get _url(): string {
        return `http://free-proxy.cz/en/proxylist/main/${ FreeProxyCz._page }`;
    }

    /**
     * Proxies are needed because the site blocks (for about a day) ip addresses
     * that seem suspicious to it (or it will simply be requested many times).
     */
    public static async load(proxies: Proxy[]): Promise<Proxy[]> {
        if (!FreeProxyCz._cache.isExpired) return FreeProxyCz._cache.data!;

        const logger = FreeProxyCz._logger.createChild('load attempt').createCounter(proxies.length);
        let page: string | undefined;
        for (const proxy of proxies) {
            try {
                page = await FreeProxyCz._fetchPage(proxy);
                logger.happy('successfully load page with proxy:', parseProxyToUrl(proxy));
                break;
            } catch (e: any) {
                logger.warning('failed fetch page with proxy:', parseProxyToUrl(proxy), e?.message ?? e);
            }
        }

        if (!page) throw new Error('no one proxy is working');

        const parsed = await FreeProxyCz._parsePage(page);
        FreeProxyCz._cache.update(parsed);

        return FreeProxyCz._cache.data!;
    }

    private static async _fetchPage(proxy: Proxy): Promise<any> {
        const agent = getSuitableAgent(FreeProxyCz._url, proxy);

        return axios.get<string>(FreeProxyCz._url, {
            headers: common_headers,
            httpsAgent: agent,
            httpAgent: agent,
        })
        .then((r) => r.data);
    }

    private static async _parsePage(page: string): Promise<Proxy[]> {
        const dom = new JSDOM(page);

        const table = dom.window.document.querySelector('#proxy_list');

        const tbody = table!.querySelector('tbody');

        const trs = tbody!.querySelectorAll('tr');

        const proxies: Proxy[] = [];

        for (const tr of trs) {
            const tds = tr.querySelectorAll('td');

            // Instead of ip comes a js code with a decoding function. Pull out the value and decode it ourselves.
            // [ 'Base64.decode("MTk4LjI3LjExNS4yMTU=")', "MTk4LjI3LjExNS4yMTU=" ]
            const ip_encoded = tds[0]?.innerHTML?.match(/Base64.decode\("([^"]+)"\)/)?.[1];

            if (!ip_encoded) continue;

            const ip = Buffer.from(ip_encoded, 'base64').toString('utf-8');

            /**
             * innerText from JSDOC don't work. (ノಠ益ಠ)ノ彡┻━┻
             */
            const port = tds[1]?.querySelector('span')?.innerHTML;
            const protocol = tds[2]?.querySelector('small')?.innerHTML as 'HTTP' | 'HTTPS' | 'SOCKS4' | 'SOCKS5';

            if (ip && port && protocol) {
                proxies.push({
                    // @ts-ignore
                    protocol: protocol?.toLowerCase(),
                    // @ts-ignore
                    port,
                    host: ip,
                });
            }
        }

        return proxies;
    }
}