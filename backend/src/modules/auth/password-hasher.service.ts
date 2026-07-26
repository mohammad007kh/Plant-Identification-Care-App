import { Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * Thin, swappable wrapper around argon2id password hashing (isolated so it's
 * testable and the algorithm can change in one place). Never bcrypt/plain.
 */
@Injectable()
export class PasswordHasherService {
  hash(plain: string): Promise<string> {
    return hash(plain, { algorithm: Algorithm.Argon2id });
  }

  async verify(hashString: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashString, plain);
    } catch {
      // Malformed hash / verify error → treat as a failed match, never a 500.
      return false;
    }
  }
}
