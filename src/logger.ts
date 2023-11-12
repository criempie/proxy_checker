import * as util from 'util';

export class Logger {
    private _location: string;

    constructor(location: string) {
        this._location = location;
    }

    public log(object: object): void
    public log(message: string): void
    public log(message: object | string): void {
        let msg;

        if (typeof message === 'string') {
            msg = message;
        } else if (typeof message === 'object') {
            msg = util.inspect(message, { depth: 3, colors: true });
        }

        console.log(`[${ this._location }]: ${ msg }`);
    }
}