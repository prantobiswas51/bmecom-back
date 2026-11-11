import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LEN = 64;
// scrypt needs roughly 128 * N * R bytes; the default limit (32 MB) is too low.
const MAXMEM = 128 * N * R * 2;

function derive(password: string, salt: Buffer, n: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_LEN, { N: n, r, p, maxmem: MAXMEM }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** Password hashing with Node's built-in scrypt, so there is no native dependency to build. */
@Injectable()
export class PasswordService {
  // Hash of a random password, verified against when the user does not exist
  // so that login takes the same time either way.
  private dummyHash?: Promise<string>;

  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await derive(password, salt, N, R, P);
    return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const [scheme, n, r, p, salt, key] = stored.split('$');
    if (scheme !== 'scrypt' || !salt || !key) return false;
    const expected = Buffer.from(key, 'base64');
    const actual = await derive(
      password,
      Buffer.from(salt, 'base64'),
      Number(n),
      Number(r),
      Number(p),
    );
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  /** Burns the same time as a real verification. Always resolves to false. */
  async verifyDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash(randomBytes(16).toString('hex'));
    await this.verify(password, await this.dummyHash);
    return false;
  }
}
