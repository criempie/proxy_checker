import { AxiosProxyConfig } from 'axios';
import { Proxy } from './proxy_checker';

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