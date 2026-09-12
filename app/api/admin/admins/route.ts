// GET /api/admin/admins — list admins. Gated by canManageOtherAdmins()
// (SUPER_ADMIN, or a plain ADMIN with canManageAdmins=true) — listing
// every admin's email/role is sensitive in the same way creating one is,
// so this checks the requester's FRESH canManageAdmins flag from the DB
// (not the session token — that flag isn't in the token at all, on
// purpose, so revoking it takes effect immediately).
// POST /api/admin/admins
// Creates a new admin. Gated by createAdmin()'s own permission check
// (SUPER_ADMIN, or a plain ADMIN with canManageAdmins=true) — this route
// is a thin wrapper, all the privilege-escalation logic lives in
// src/lib/admin/manage.ts and is tested in tests/admin-management.test.ts.

import { createAdmin } from '../../../../src/lib/admin/manage';
import { buildAdminManagementDeps } from '../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole, canManageOtherAdmins } from '../../../../src/lib/auth/authorize';

export async function GET(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  const deps = buildAdminManagementDeps();
  const requester = await deps.admins.findById(auth.session.sub);
  if (!requester || !canManageOtherAdmins(requester)) {
    return json(403, { error: 'You do not have permission to view the admin list' });
  }

  const admins = await deps.admins.listAll();
  const safe = admins.map(({ passwordHash, ...rest }) => rest);
  return json(200, { admins: safe });
}

export async function POST(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  let body: {
    name?: string;
    email?: string;
    password?: string;
    role?: 'SUPER_ADMIN' | 'ADMIN';
    canManageAdmins?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }

  if (!body.name || !body.email || !body.password) {
    return json(400, { error: 'name, email, and password are required' });
  }

  const result = await createAdmin(buildAdminManagementDeps(), auth.session.sub, {
    name: body.name,
    email: body.email,
    password: body.password,
    role: body.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN',
    canManageAdmins: body.canManageAdmins === true,
  });

  const httpStatus =
    result.outcome === 'CREATED'
      ? 201
      : result.outcome === 'FORBIDDEN'
        ? 403
        : result.outcome === 'ALREADY_EXISTS'
          ? 409
          : 400;

  // Never echo the password hash back.
  const { admin, ...rest } = result;
  return json(httpStatus, {
    ...rest,
    admin: admin ? { id: admin.id, email: admin.email, role: admin.role, canManageAdmins: admin.canManageAdmins } : undefined,
  });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
