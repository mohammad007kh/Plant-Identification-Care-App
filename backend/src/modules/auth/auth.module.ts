import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { GuestsModule } from '../guests/guests.module';
import { GuestMergeService } from '../guests/guest-merge.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { PasswordHasherService } from './password-hasher.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CREDENTIAL_VERIFIER, EmailPasswordVerifier } from './credential-verifier';
import { USER_REGISTERED_HOOK, type UserRegisteredHook } from './user-registered.hook';

/**
 * JWT auth module (register/login/refresh/logout). NOT imported by app.module
 * here — T-057 registers it and the global JwtAuthGuard. USER_REGISTERED_HOOK is
 * bound to the guest→account scan merge (T-041) so registration re-parents a
 * registrant's prior guest scans synchronously (FR-008).
 */
@Module({
  imports: [UsersModule, GuestsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    PasswordHasherService,
    RefreshTokenRepository,
    JwtAuthGuard,
    EmailPasswordVerifier,
    { provide: CREDENTIAL_VERIFIER, useExisting: EmailPasswordVerifier },
    {
      provide: USER_REGISTERED_HOOK,
      useFactory: (merge: GuestMergeService): UserRegisteredHook => ({
        onUserRegistered: async ({ userId, guestSessionId }) => {
          await merge.mergeGuestSessionIntoUser(guestSessionId, userId);
        },
      }),
      inject: [GuestMergeService],
    },
  ],
  exports: [TokenService, JwtAuthGuard, UsersModule],
})
export class AuthModule {}
