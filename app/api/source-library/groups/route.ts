import {
  createSourceLibraryGroup,
  deleteSourceLibraryGroup,
  renameSourceLibraryGroup,
} from '../../../../lib/source-library-metadata';
import { getSourceLibraryGroups } from '../../../../lib/knowledge-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}

function serializeGroups(groups: Awaited<ReturnType<typeof getSourceLibraryGroups>>) {
  return groups.map((group) => ({
    id: group.id,
    label: group.label,
    order: group.order,
    count: group.count,
    categories: group.categories.map((category) => category.slug),
  }));
}

async function groupsResponse(status = 200) {
  return Response.json({ groups: serializeGroups(await getSourceLibraryGroups()) }, { status });
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const status = /required|cannot|exists|unknown group/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}

export async function GET() {
  return groupsResponse();
}

export async function POST(req: Request) {
  try {
    const body = await readJsonBody(req);
    if (!body) return badRequest('invalid json');
    const label = typeof body.label === 'string' ? body.label : '';
    await createSourceLibraryGroup(label);
    return groupsResponse();
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await readJsonBody(req);
    if (!body) return badRequest('invalid json');
    const groupId = typeof body.groupId === 'string' ? body.groupId : '';
    const label = typeof body.label === 'string' ? body.label : '';
    await renameSourceLibraryGroup(groupId, label);
    return groupsResponse();
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await readJsonBody(req);
    if (!body) return badRequest('invalid json');
    const groupId = typeof body.groupId === 'string' ? body.groupId : '';
    await deleteSourceLibraryGroup(groupId);
    return groupsResponse();
  } catch (error) {
    return errorResponse(error);
  }
}
