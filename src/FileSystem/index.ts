import fs from 'fs';

export class FileSystem {
    public static saveToFile<T extends { toString(): string }>(path: string, data: T): Promise<void> {
        return new Promise((resolve, reject) => {
            const writer = fs.createWriteStream(path, { autoClose: true, });

            writer.on('error', (e) => {
                reject(e);
            });

            writer.on('finish', () => {
                resolve();
            });

            writer.write(JSON.stringify(data));

            writer.end();
        });
    }

    public static loadFromFile<T extends any>(path: string): Promise<T> {
        return new Promise(async (resolve, reject) => {
            const readStream = fs.createReadStream(path, { autoClose: true, });

            let result = '';

            readStream.on('error', (e) => {
                reject(e);
            });

            readStream.on('data', (chunk) => {
                result += chunk.toString();
            });

            readStream.on('end', () => {
                resolve(JSON.parse(result));
            });
        });
    }

    public static getStatOfFile(path: string): Promise<fs.Stats> {
        return new Promise((resolve, reject) => {
            fs.stat(path, (err, stat) => {
                if (err) reject(err);

                resolve(stat);
            });
        });
    }
}