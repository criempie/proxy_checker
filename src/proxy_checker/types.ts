import { Proxy } from '~/types';

export interface ProxyCheckResult {
    availability: boolean,
    proxy: Proxy,
    // anonymous: boolean,
}

export interface LoadedProxies {
    last_update: number,
    proxies: Proxy[],
}