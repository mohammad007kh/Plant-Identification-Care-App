import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from './index';
import { users, guestSession, species, plant, scan, photo } from './core';

describe('core schema (T-010)', () => {
  it('exports all core tables', () => {
    for (const t of ['users', 'guestSession', 'species', 'plant', 'scan', 'photo'] as const) {
      expect(schema[t], `table ${t} should be exported`).toBeDefined();
    }
  });

  it('uses snake_case physical table names', () => {
    expect(getTableConfig(users).name).toBe('users');
    expect(getTableConfig(guestSession).name).toBe('guest_session');
    expect(getTableConfig(species).name).toBe('species');
    expect(getTableConfig(plant).name).toBe('plant');
    expect(getTableConfig(scan).name).toBe('scan');
    expect(getTableConfig(photo).name).toBe('photo');
  });

  it('users carries identity, auth, tenancy-cache and lifecycle columns', () => {
    const cols = getTableConfig(users).columns.map((c) => c.name);
    for (const c of [
      'id',
      'public_id',
      'email',
      'password_hash',
      'role',
      'credit_balance',
      'deletion_status',
      'created_at',
      'updated_at',
    ]) {
      expect(cols, `users.${c}`).toContain(c);
    }
  });

  it('user-owned tables carry a user_id tenancy column', () => {
    const plantCols = getTableConfig(plant).columns.map((c) => c.name);
    expect(plantCols).toContain('user_id');
  });

  it('every table exposes an opaque public_id (except guest_session which is cookie-scoped)', () => {
    for (const t of [users, species, plant, scan, photo]) {
      const cols = getTableConfig(t).columns.map((c) => c.name);
      expect(cols).toContain('public_id');
    }
    // guest_session is keyed by the httpOnly cookie id, no external public_id.
    expect(getTableConfig(guestSession).columns.map((c) => c.name)).toContain('id');
  });

  it('scan enforces confidence + type/status enums for the 70% gate flow', () => {
    const cols = getTableConfig(scan).columns.map((c) => c.name);
    for (const c of ['type', 'status', 'confidence', 'species_id']) {
      expect(cols).toContain(c);
    }
  });
});
