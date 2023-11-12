export class Logger {
    private _location: string;

    constructor(location: string) {
        this._location = location;
    }

    public log(message: string): void {
        console.log(`[${ this._location }]: ${ message }`);
    }
}