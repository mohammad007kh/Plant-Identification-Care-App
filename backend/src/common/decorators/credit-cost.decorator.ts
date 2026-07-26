import { SetMetadata } from '@nestjs/common';
import type { UsageAction } from '../../credits/credits.service';

export const CREDIT_COST_ACTION_KEY = 'credit_cost_action';

/**
 * Annotates a guarded route handler with which metered AI action it
 * represents (`identify` | `comparison` | `chat`). `CreditCheckGuard` reads
 * this via `Reflector` to resolve the action's current admin-configured cost
 * from `app_config` — never hardcoded per-action costs in the guard itself.
 */
export const CreditCost = (action: UsageAction): MethodDecorator =>
  SetMetadata(CREDIT_COST_ACTION_KEY, action);
