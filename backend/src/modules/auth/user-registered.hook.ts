import { Injectable } from '@nestjs/common';

export interface UserRegisteredContext {
  /** Internal id (ULID) of the newly created user. */
  userId: string;
  /** Guest session id from the request cookie, if the registrant scanned as a guest. */
  guestSessionId: string | null;
}

/**
 * Extension point fired synchronously after a user row is created, before the
 * registration response is sent. T-041 binds this to the guest→account scan
 * merge; the default is a no-op so auth works standalone.
 */
export interface UserRegisteredHook {
  onUserRegistered(ctx: UserRegisteredContext): Promise<void>;
}

export const USER_REGISTERED_HOOK = Symbol('USER_REGISTERED_HOOK');

@Injectable()
export class NoopUserRegisteredHook implements UserRegisteredHook {
  async onUserRegistered(): Promise<void> {
    // no-op default; T-041 replaces this binding with the guest-merge hook
  }
}
