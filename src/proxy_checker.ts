import axios from 'axios';
import { Logger } from './logger';
import { server } from './server';
import { HeadersTestResponse, Proxy, ProxyCheckResult } from './types';

const logger = new Logger('ProxyChecker');

function parseUrlToProxy(url: string): Proxy {
    const matched = url.match(/^(\w+):\/\/([^:]+)(?::(\d+))/);

    if (!matched) throw new Error('url not match');

    const parsed = {
        protocol: matched[1],
        host: matched[2],
        port: matched[3],
    };

    const isInvalidProtocol = !(
        parsed.protocol === 'http'
        || parsed.protocol === 'https'
        || parsed.protocol === 'socks4'
        || parsed.protocol === 'socks5'
    );
    const isInvalidPort = isNaN(+parsed.port);

    if (isInvalidProtocol) throw new Error('unsupported protocol');
    if (isInvalidPort) throw new Error('undefined port');

    return {
        // @ts-ignore
        protocol: parsed.protocol,
        host: parsed.host,
        port: +parsed.port,
    };
}

function parseProxyToUrl(proxy: Proxy): string {
    return `${ proxy.protocol }://${ proxy.host }:${ proxy.port }`;
}

// Check http/https proxies.
async function _testHttpProxy(proxy: Proxy & { protocol: 'http' | 'https' }): Promise<ProxyCheckResult> {
    const isWork = await axios.post<HeadersTestResponse>(
        server.getServerUrl(proxy.protocol) + '__inner/proxy',
        {
            proxy,
            timeout: 4000,
        },
    )
    .then((r) => {
        logger.log(`Proxy ${ parseProxyToUrl(proxy) } is working`);
        logger.log(`proxy headers: ${ r.data.headers }`);

        return true;
    })
    .catch((e) => {
        if (e instanceof Error) {
            logger.log(`Proxy ${ parseProxyToUrl(proxy) } does not working`);
            logger.log(`${ e.message }`);
        }

        return false;
    });

    return {
        availability: isWork,
    };
}

export const proxyChecker = {
    parseProxyToUrl,
    parseUrlToProxy,
    _testHttpProxy,
};