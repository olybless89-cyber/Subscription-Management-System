import { RailwayClient } from './client';

export interface RailwayProject {
  id: string;
  name: string;
}

export async function getProject(
  client: RailwayClient,
  projectId: string
): Promise<RailwayProject | null> {
  const query = `
    query GetProject($id: String!) {
      project(id: $id) { id name }
    }
  `;
  const data = await client.request<{ project: RailwayProject | null }>(query, { id: projectId });
  return data.project ?? null;
}

export interface RailwayAccountService {
  id: string;
  name: string;
}

// Database-plugin services (Postgres, MySQL, Redis, ...) never get
// suspended — the suspend/restore engine only ever stops a web/API
// service's deployment (see src/lib/suspension/engine.ts), and a
// database has no deployment to stop in the first place. Railway names
// these consistently after the engine itself (optionally with a random
// suffix when a project has more than one, e.g. "Postgres-Yjsz"), so a
// name-prefix match is enough to keep them out of every "pick a Railway
// service to map" list without needing extra Railway API fields.
const DATABASE_SERVICE_NAME_PATTERN =
  /^(postgres(ql)?|mysql|mariadb|redis|mongo(db)?|memcached|cassandra|elasticsearch|rabbitmq|clickhouse|cockroachdb|timescaledb|sqlserver|mssql)([-_].*)?$/i;

export function isDatabaseServiceName(name: string): boolean {
  return DATABASE_SERVICE_NAME_PATTERN.test(name.trim());
}

export interface RailwayAccountEnvironment {
  id: string;
  name: string;
}

export interface RailwayAccountProject {
  id: string;
  name: string;
  services: RailwayAccountService[];
  environments: RailwayAccountEnvironment[];
}

/**
 * listAccountProjects — every project/service/environment visible to
 * whichever token is configured (RAILWAY_API_TOKEN), for the super-admin
 * "browse Railway services" import screen. Read-only.
 *
 * IMPORTANT: per Railway's own guidance, the top-level `projects` query
 * only returns data for a PERSONAL account token — a project-scoped
 * token will come back empty. Verified against Railway's published
 * cookbook examples (2026-09); reconfirm via schema introspection if
 * this ever starts returning nothing unexpectedly.
 */
export async function listAccountProjects(client: RailwayClient): Promise<RailwayAccountProject[]> {
  const query = `
    query ListAccountProjects {
      projects {
        edges {
          node {
            id
            name
            services { edges { node { id name } } }
            environments { edges { node { id name } } }
          }
        }
      }
    }
  `;
  const data = await client.request<{
    projects: {
      edges: Array<{
        node: {
          id: string;
          name: string;
          services: { edges: Array<{ node: RailwayAccountService }> };
          environments: { edges: Array<{ node: RailwayAccountEnvironment }> };
        };
      }>;
    };
  }>(query);

  return data.projects.edges.map(({ node }) => ({
    id: node.id,
    name: node.name,
    services: node.services.edges.map((e) => e.node),
    environments: node.environments.edges.map((e) => e.node),
  }));
}

// Intentionally NOT exporting a deleteProject / deleteService function here.
// Destructive project/service operations live only in the explicit,
// admin-confirmed permanent-termination workflow (spec section 44), never
// in the general-purpose Railway adapter used by automated workers.
