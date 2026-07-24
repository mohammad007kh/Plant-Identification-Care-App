import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from './index';
import {
  chatConversation,
  chatMessage,
  comparisonResult,
  notification,
  misidentificationReport,
  appConfig,
  analyticsEvent,
  deletionAudit,
} from './support';

describe('support schema (T-012)', () => {
  it('exports all support tables', () => {
    for (const t of [
      'chatConversation',
      'chatMessage',
      'comparisonResult',
      'notification',
      'misidentificationReport',
      'appConfig',
      'analyticsEvent',
      'deletionAudit',
    ] as const) {
      expect(schema[t], `table ${t} should be exported`).toBeDefined();
    }
  });

  it('uses snake_case physical table names', () => {
    expect(getTableConfig(chatConversation).name).toBe('chat_conversation');
    expect(getTableConfig(chatMessage).name).toBe('chat_message');
    expect(getTableConfig(comparisonResult).name).toBe('comparison_result');
    expect(getTableConfig(notification).name).toBe('notification');
    expect(getTableConfig(misidentificationReport).name).toBe('misidentification_report');
    expect(getTableConfig(appConfig).name).toBe('app_config');
    expect(getTableConfig(analyticsEvent).name).toBe('analytics_event');
    expect(getTableConfig(deletionAudit).name).toBe('deletion_audit');
  });

  it('chat_message carries context_photo_ids (max-2 array, defense-in-depth CHECK)', () => {
    const config = getTableConfig(chatMessage);
    const cols = config.columns.map((c) => c.name);
    expect(cols).toContain('context_photo_ids');
    expect(cols).toContain('conversation_id');
    expect(cols).toContain('role');
    expect(cols).toContain('usage_record_id');

    const checkNames = config.checks.map((c) => c.name);
    expect(checkNames).toContain('chat_message_context_photo_ids_max_2');
  });

  it('comparison_result carries a verdict enum column', () => {
    const cols = getTableConfig(comparisonResult).columns.map((c) => c.name);
    for (const c of ['scan_id', 'plant_id', 'verdict', 'referenced_photo_ids']) {
      expect(cols).toContain(c);
    }
  });

  it('notification carries reminder scheduling + delivery columns', () => {
    const cols = getTableConfig(notification).columns.map((c) => c.name);
    for (const c of ['user_id', 'plant_id', 'type', 'channel', 'scheduled_for', 'status', 'sent_at']) {
      expect(cols).toContain(c);
    }
  });

  it('misidentification_report carries admin-review columns', () => {
    const cols = getTableConfig(misidentificationReport).columns.map((c) => c.name);
    for (const c of ['user_id', 'scan_id', 'photo_id', 'ai_result', 'status']) {
      expect(cols).toContain(c);
    }
  });

  it('app_config uses key as the primary key (no migration needed for new settings)', () => {
    const config = getTableConfig(appConfig);
    const cols = config.columns.map((c) => c.name);
    expect(cols).toContain('key');
    expect(cols).toContain('value');

    const keyColumn = config.columns.find((c) => c.name === 'key');
    expect(keyColumn?.primary).toBe(true);
  });

  it('analytics_event.user_id is nullable (guest-attributed events)', () => {
    const config = getTableConfig(analyticsEvent);
    const userIdColumn = config.columns.find((c) => c.name === 'user_id');
    expect(userIdColumn).toBeDefined();
    expect(userIdColumn?.notNull).toBe(false);
  });

  it('deletion_audit is PII-free: no user_id column, only a one-way hash', () => {
    const cols = getTableConfig(deletionAudit).columns.map((c) => c.name);
    expect(cols).toContain('user_public_id_hash');
    expect(cols).toContain('requested_at');
    expect(cols).not.toContain('user_id');
    expect(cols).not.toContain('email');
    expect(cols).not.toContain('public_id');
  });
});
