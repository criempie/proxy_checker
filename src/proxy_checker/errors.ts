export class WebsocketError extends Error {
    constructor(message: string) {
        super(`${ WebsocketError.name }: ${ message }`);
    }
}