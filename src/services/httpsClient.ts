import * as https from 'node:https';
import type * as http from 'node:http';

export interface HttpsPostOptions {
  url: string;
  body: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface HttpsPostResult {
  responseBody: string;
  statusCode: number;
}

export type HttpsClientOverride = (options: HttpsPostOptions) => Promise<HttpsPostResult>;

let clientOverride: HttpsClientOverride | null = null;

export function setHttpsClientOverride(override: HttpsClientOverride | null): void {
  clientOverride = override;
}

export async function httpsPost(options: HttpsPostOptions): Promise<HttpsPostResult> {
  if (clientOverride) {
    return clientOverride(options);
  }

  return new Promise((resolve, reject) => {
    const url = new URL(options.url);
    const bodyBuffer = Buffer.from(options.body, 'utf8');

    const reqOptions: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port ? Number(url.port) : 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': bodyBuffer.length,
        ...options.headers
      }
    };

    const req = https.request(reqOptions, (res: http.IncomingMessage) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      });
      res.on('end', () => {
        resolve({
          responseBody: Buffer.concat(chunks).toString('utf8'),
          statusCode: res.statusCode ?? 0
        });
      });
      res.on('error', reject);
    });

    req.on('error', reject);

    if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
      req.setTimeout(options.timeoutMs, () => {
        req.destroy(new Error(`HTTPS request timed out after ${options.timeoutMs}ms`));
      });
    }

    req.write(bodyBuffer);
    req.end();
  });
}
