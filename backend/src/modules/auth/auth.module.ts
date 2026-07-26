import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { PasswordHasherService } from './password-hasher.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CREDENTIAL_VERIFIER, EmailPasswordVerifier } from './credential-verifier';
import { NoopUserRegisteredHook, USER_REGISTERED_HOOK } from './user-registered.hook';

/**
 * JWT auth module (register/login/refresh/logout). NOT imported by app.module
 * here — T-057 registers it and the global JwtAuthGuard. The USER_REGISTERED_HOOK
 * binding is the default no-op; T-041 rebinds it to the guest-scan merge.
 */
@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    PasswordHasherService,
    RefreshTokenRepository,
    JwtAuthGuard,
    EmailPasswordVerifier,
    { provide: CREDENTIAL_VERIFIER, useExisting: EmailPasswordVerifier },
    { provide: USER_REGISTERED_HOOK, useClass: NoopUserRegisteredHook },
  ],
  exports: [TokenService, JwtAuthGuard, UsersModule],
})
export class AuthModule {}
