export interface Proxy {
    protocol: 'http' | 'https' | 'socks4' | 'socks5',
    host: string,
    port: number,
}

export interface ProxyCheckResult {
    availability: boolean,
    // anonymous: boolean,
}

export type CheckHttpResponse = ProxyCheckResult[];

export interface HeadersTestResponse {
    headers: Record<string, string | undefined | string[]>;
}