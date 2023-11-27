declare global {
    namespace NodeJS {
        interface ProcessEnv {
            PORT: string,
            PROXY_CACHE_TTL: string,
        }
    }
}

export {};