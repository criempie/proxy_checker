import { AxiosProxyConfig } from 'axios';
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent';
import { Proxy } from '~/types';

export function parseProxyToUrl(proxy: Proxy): string {
    return `${ proxy.protocol }://${ proxy.host }:${ proxy.port }`;
}

export function parseUrlToProxy(url: string): Proxy {
    const matched = url.match(/^(\w+):\/\/([^:]+)(?::(\d+))/);

    if (!matched) throw new Error('url not match');

    const parsed = {
        protocol: matched[1],
        host: matched[2],
        port: matched[3],
    };

    const isInvalidProtocol = ![
        'http', 'https', 'socks4', 'socks5'
    ].includes(parsed.protocol);

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

export function axiosProxyConfigToProxy(proxyConfig: AxiosProxyConfig): Proxy {
    if (!proxyConfig.protocol) {
        throw new Error('protocol not defined');
    }

    if (![ 'http', 'https', 'socks4', 'socks5' ].includes(proxyConfig.protocol)) {
        throw new Error('unsupported protocol');
    }

    return {
        // @ts-ignore
        protocol: proxyConfig.protocol,
        host: proxyConfig.host,
        port: proxyConfig.port,
    };
}

export function axiosProxyConfigToUrl(proxyConfig: AxiosProxyConfig): string {
    return parseProxyToUrl(axiosProxyConfigToProxy(proxyConfig));
}

export function isEqualProxies(p1: Proxy, p2: Proxy): boolean {
    return (
        p1.protocol === p2.protocol
        && p1.port === p2.port
        && p1.host === p2.host
    );
}

export function deleteDuplicates<T>(arr1: T[], comparator: (item1: T, item2: T) => boolean): T[] {
    return arr1.filter((item1, i, self) => {
        return i === self.findIndex((item2) => {
            return comparator(item1, item2);
        });
    });
}

export function divideArrayIntoBatches<T>(array: T[], batchSize: number): T[][] {
    const count = Math.ceil(array.length / batchSize);
    const _array = array.slice();

    const batches: T[][] = [];

    for (let i = 0; i < count; i++) {
        batches.push(_array.splice(0, batchSize));
    }

    return batches;
}

export function getSuitableAgent(url: string, proxy: Proxy): typeof HttpProxyAgent | typeof HttpsProxyAgent {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol === 'http:') return HttpProxyAgent;
    else if (parsedUrl.protocol === 'https:') return HttpsProxyAgent;
    else if (parsedUrl.protocol.startsWith('ws')) return HttpsProxyAgent;

    else throw new Error(`protocol ${ parsedUrl.protocol } not supported`);
}