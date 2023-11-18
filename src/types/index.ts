export interface Proxy {
    protocol: 'http' | 'https' | 'socks4' | 'socks5',
    host: string,
    port: number,
}