import { assignCategoryToGroup } from '../../../../lib/source-library-metadata';
import {
  getKnowledgeCategories,
  getSourceLibraryCategories,
  getSourceLibraryGroups,
} from '../../../../lib/knowledge-store';

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

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const status = /Unknown category slug/i.test(message)
    ? 404
    : /required|unknown group|not a source-library category/i.test(message)
      ? 400
      : 500;
  return Response.json({ error: message }, { status });
}

export async function PATCH(req: Request) {
  try {
    const body = await readJsonBody(req);
    if (!body) return badRequest('invalid json');

    const categorySlug = typeof body.categorySlug === 'string' ? body.categorySlug : '';
    const groupId = typeof body.groupId === 'string' ? body.groupId : '';
    if (!categorySlug.trim()) {
      return badRequest('Category slug is required');
    }
    if (!groupId.trim()) {
      return badRequest('Group id is required');
    }

    const [allCategories, sourceCategories] = await Promise.all([
      getKnowledgeCategories(),
      getSourceLibraryCategories(),
    ]);
    if (!allCategories.some((category) => category.slug === categorySlug)) {
      throw new Error('Unknown category slug');
    }
    if (!sourceCategories.some((category) => category.slug === categorySlug)) {
      throw new Error('Category is not a source-library category');
    }

    await assignCategoryToGroup(categorySlug, groupId);
    return Response.json({ groups: serializeGroups(await getSourceLibraryGroups()) });
  } catch (error) {
    return errorResponse(error);
  }
}
