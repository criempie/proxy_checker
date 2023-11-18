import { Proxy } from '~/types';

export interface ProxyCheckResult {
    availability: boolean,
    proxy: Proxy,
    // anonymous: boolean,
}