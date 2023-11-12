declare global {
    namespace NodeJS {
        interface ProcessEnv {
            PROTOCOL: string,
            HOST: string,
            PORT: string,
        }
    }
}

export {};