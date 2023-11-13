import chalk, { ChalkFunction } from 'chalk';
import { inspect } from 'util';

export class Logger {
    private static _chalk: chalk.Chalk = new chalk.Instance({ level: 1 });

    private readonly _location: string;

    constructor(location: string) {
        this._location = location;
    }

    public static makeUnderline(message: string): string {
        return Logger._chalk.underline(message);
    }

    public log(...messages: any): void {
        Logger._log(this._location, messages);
    }

    public error(...messages: any): void {
        Logger._log(this._location, messages, Logger._chalk.redBright);
    }

    public happy(...messages: any): void {
        Logger._log(this._location, messages, Logger._chalk.greenBright);
    }

    private static _log(location: string, messages: any, colorFn?: ChalkFunction): void {
        const _messages = messages.map((m: any) => {
            let msg = m;

            if (typeof m === 'object') {
                msg = inspect(m, {
                    depth: 2,
                });
            }

            if (colorFn) {
                msg = colorFn(msg);
            }

            return msg;
        });

        console.log(`[${ location }]: ${ _messages.join(' ') }`);
    }
}