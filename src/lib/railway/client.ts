/**
 * Railway GraphQL client.
 *
 * SERVER-SIDE ONLY. Never import this file from client components or
 * anything that ships to the browser. The token lives only in
 * process.env and is read lazily so this module can be imported safely
 * in test contexts without the env var set.
 *
 * IMPORTANT (spec section 48): mutation/query names below are our best
 * abstraction target, but Railway's GraphQL schema changes over time.
 * Before wiring this against production, introspect the live schema
 * (`{ __schema { types { name } } }` against RAILWAY_API_URL) and
 * confirm the mutation names in services.ts / deployments.ts /
 * domains.ts / projects.ts still match. If a mutation name has drifted,
 * fail loudly rather than guessing.
 */

export class RailwayApiError extends Error {
  constructor(
    message: string,
    public readonly status: 'UNREACHABLE' | 'GRAPHQL_ERROR' | 'HTTP_ERROR',
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'RailwayApiError';
  }
}

export interface RailwayClientConfig {
  apiUrl: string;
  apiToken: string;
  /** ms before a request is treated as unreachable. Default 15s. */
  timeoutMs?: number;
}

function getConfig(): RailwayClientConfig {
  const apiUrl = process.env.RAILWAY_API_URL || 'https://backboard.railway.com/graphql/v2';
  const apiToken = process.env.RAILWAY_API_TOKEN;

  if (!apiToken) {
    throw new RailwayApiError(
      'RAILWAY_API_TOKEN is not configured on the server',
      'HTTP_ERROR'
    );
  }

  return { apiUrl, apiToken, timeoutMs: 15_000 };
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; [key: string]: unknown }>;
}

/**
 * Executes a raw GraphQL request against Railway.
 * Never throws on "expected" infrastructure failures in a way that loses
 * information — callers (the sync/suspension engines) are responsible for
 * translating a thrown RailwayApiError into RailwayResourceStatus.UNKNOWN
 * or an ERROR SuspensionEvent, never into a silent success.
 */
export async function railwayRequest<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
  config: RailwayClientConfig = getConfig()
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 15_000);

  let res: Response;
  try {
    res = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiToken}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new RailwayApiError('Railway API unreachable', 'UNREACHABLE', err);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new RailwayApiError(
      `Railway API returned HTTP ${res.status}`,
      'HTTP_ERROR',
      body
    );
  }

  const json = (await res.json()) as GraphQLResponse<T>;

  if (json.errors && json.errors.length > 0) {
    throw new RailwayApiError(
      `Railway GraphQL error: ${json.errors.map((e) => e.message).join('; ')}`,
      'GRAPHQL_ERROR',
      json.errors
    );
  }

  if (json.data === undefined) {
    throw new RailwayApiError('Railway API returned no data', 'GRAPHQL_ERROR', json);
  }

  return json.data;
}

/** Injectable client shape used by the higher-level adapters and the
 * suspension/restoration engines, so tests can supply a mock without
 * hitting the network or requiring RAILWAY_API_TOKEN. */
export interface RailwayClient {
  request: <T = unknown>(query: string, variables?: Record<string, unknown>) => Promise<T>;
}

export function createRailwayClient(config?: RailwayClientConfig): RailwayClient {
  return {
    request: (query, variables) => railwayRequest(query, variables, config ?? getConfig()),
  };
}
