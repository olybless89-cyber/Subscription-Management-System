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

// Intentionally NOT exporting a deleteProject / deleteService function here.
// Destructive project/service operations live only in the explicit,
// admin-confirmed permanent-termination workflow (spec section 44), never
// in the general-purpose Railway adapter used by automated workers.
