/**
 * Hard safety boundary (spec section 7).
 *
 * The automated suspension/restoration engines must be structurally
 * incapable of reaching these actions. They are not exported from
 * lib/railway/* at all (see projects.ts / domains.ts comments), and this
 * module exists as a second, explicit checkpoint: any code path that
 * calls assertActionAllowed() with one of these will throw immediately,
 * even if a future refactor accidentally wires one in.
 */
export const FORBIDDEN_AUTOMATED_ACTIONS = [
  'DELETE_PROJECT',
  'DELETE_SERVICE',
  'DELETE_DATABASE',
  'DELETE_VOLUME',
  'DELETE_DOMAIN',
] as const;

export type ForbiddenAutomatedAction = (typeof FORBIDDEN_AUTOMATED_ACTIONS)[number];

export const ALLOWED_AUTOMATED_STRATEGIES = [
  'STOP_DEPLOYMENT',
  'APP_LEVEL',
  'REDIRECT',
] as const;

export type AllowedAutomatedStrategy = (typeof ALLOWED_AUTOMATED_STRATEGIES)[number];

export class ForbiddenSuspensionActionError extends Error {
  constructor(action: string) {
    super(
      `Refusing to run "${action}" from an automated worker. This action is ` +
        `destructive and is only reachable through the explicit, ` +
        `admin-confirmed permanent-termination workflow.`
    );
    this.name = 'ForbiddenSuspensionActionError';
  }
}

export function assertActionAllowed(action: string): void {
  if ((FORBIDDEN_AUTOMATED_ACTIONS as readonly string[]).includes(action)) {
    throw new ForbiddenSuspensionActionError(action);
  }
}

/**
 * Guards the suspension strategy read off a RailwayResource before the
 * engine acts on it. `MANUAL` strategy is allowed to exist in the data
 * model (spec enum SuspensionStrategy) but is never eligible for
 * automatic (worker-driven) suspension — it requires an admin action.
 */
export function assertStrategyAutomatable(
  strategy: string
): asserts strategy is AllowedAutomatedStrategy {
  if (!(ALLOWED_AUTOMATED_STRATEGIES as readonly string[]).includes(strategy)) {
    throw new ForbiddenSuspensionActionError(
      `AUTO_SUSPEND_WITH_STRATEGY:${strategy}`
    );
  }
}
