/**
 * Schema barrel — the single import surface for Drizzle (client + drizzle-kit).
 * Domain slices are added by later tasks:
 *   T-011 → credits/billing (subscription_tier, credit_transaction, usage_record, payment_event)
 *   T-012 → support (chat, comparison_result, notification, misidentification_report, app_config, analytics_event, deletion_audit)
 */
export * from './core';
export * from './credits';
export * from './support';
