import { Module } from '@nestjs/common';
import { UsersRepository } from './users.repository';

/** Shared users data-access module (consumed by auth, and later user features). */
@Module({
  providers: [UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}
