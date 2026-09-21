import { Readable } from 'stream';
export interface StorageService {
  upload(key: string, data: Buffer | Uint8Array, mimeType: string): Promise<void>;
  download(key: string): Promise<Readable>;
}
