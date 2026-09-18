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
