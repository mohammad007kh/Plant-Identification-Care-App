import { Injectable } from '@nestjs/common';
import { UsersRepository } from '../users/users.repository';
import { PasswordHasherService } from './password-hasher.service';

export interface VerifiedCredential {
  userId: string;
  publicId: string;
  role: string;
}

/**
 * Narrow seam for credential verification so a second login provider (e.g.
 * Google, FR-007) can be added later as a sibling implementation without
 * touching login/register core logic. v1 ships only email/password.
 */
export interface CredentialVerifier {
  verify(email: string, password: string): Promise<VerifiedCredential | null>;
}

export const CREDENTIAL_VERIFIER = Symbol('CREDENTIAL_VERIFIER');

/** Email + password (argon2id) verifier — the v1 default provider. */
@Injectable()
export class EmailPasswordVerifier implements CredentialVerifier {
  /** One-time dummy hash used to equalize timing when the email is unknown. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly users: UsersRepository,
    private readonly hasher: PasswordHasherService,
  ) {}

  async verify(email: string, password: string): Promise<VerifiedCredential | null> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      // Run a verify against a dummy hash anyway so an unknown email takes the
      // same time as a wrong password — closes the timing user-enumeration leak.
      await this.hasher.verify(await this.getDummyHash(), password);
      return null;
    }
    const ok = await this.hasher.verify(user.passwordHash, password);
    if (!ok) return null;
    return { userId: user.id, publicId: user.publicId, role: user.role };
  }

  private getDummyHash(): Promise<string> {
    if (!this.dummyHash) this.dummyHash = this.hasher.hash('timing-equalizer-not-a-real-password');
    return this.dummyHash;
  }
}
