import { Proxy } from '~/types';

export interface ProxyCheckResult {
    availability: boolean,
    proxy: Proxy,
    // anonymous: boolean,
}

export interface CheckedProxy {
    proxy: Proxy,

    // 0.0 - 1.0
    stability: number,
}

export interface LoadedProxies {
    last_update: number,
    proxies: Proxy[],
}