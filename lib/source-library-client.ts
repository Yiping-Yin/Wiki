'use client';

import { isNativeMode } from './is-native-mode';

export type SourceLibraryGroupRoutePayload = {
  groups: Array<{
    id: string;
    label: string;
    order: number;
    count: number;
    categories: string[];
  }>;
  error?: string;
};

type SourceLibraryBridgeRequest = {
  action: string;
  label?: string;
  groupId?: string;
  categorySlug?: string;
};

type SourceLibraryBridge = {
  postMessage(payload: SourceLibraryBridgeRequest): Promise<SourceLibraryGroupRoutePayload>;
};

function nativeSourceLibraryBridge(): SourceLibraryBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as {
    webkit?: {
      messageHandlers?: {
        loomSourceLibrary?: SourceLibraryBridge;
      };
    };
  }).webkit?.messageHandlers?.loomSourceLibrary ?? null;
}

function requestPath(input: RequestInfo | URL) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.pathname;
  return input.url;
}

function parseBody(init: RequestInit): Record<string, unknown> {
  if (typeof init.body !== 'string') return {};
  try {
    const value = JSON.parse(init.body);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function bridgeRequestFor(input: RequestInfo | URL, init: RequestInit): SourceLibraryBridgeRequest | null {
  const method = (init.method ?? 'GET').toUpperCase();
  const path = requestPath(input);
  const body = parseBody(init);

  if (path.endsWith('/api/source-library/groups')) {
    if (method === 'POST') {
      return { action: 'createGroup', label: String(body.label ?? '') };
    }
    if (method === 'PATCH') {
      return {
        action: 'renameGroup',
        groupId: String(body.groupId ?? ''),
        label: String(body.label ?? ''),
      };
    }
    if (method === 'DELETE') {
      return { action: 'deleteGroup', groupId: String(body.groupId ?? '') };
    }
  }

  if (path.endsWith('/api/source-library/membership')) {
    if (method === 'PATCH') {
      return {
        action: 'assignCategory',
        categorySlug: String(body.categorySlug ?? ''),
        groupId: String(body.groupId ?? ''),
      };
    }
    if (method === 'DELETE') {
      return { action: 'hideCategory', categorySlug: String(body.categorySlug ?? '') };
    }
  }

  return null;
}

function assertPayload(payload: SourceLibraryGroupRoutePayload): SourceLibraryGroupRoutePayload {
  if (!payload || !Array.isArray(payload.groups)) {
    throw new Error('Malformed source-library response');
  }
  return payload;
}

export async function mutateSourceLibrary(
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<SourceLibraryGroupRoutePayload> {
  if (isNativeMode()) {
    const bridge = nativeSourceLibraryBridge();
    const request = bridgeRequestFor(input, init);
    if (!bridge || !request) {
      throw new Error('Source-library editing is unavailable in this Loom build.');
    }
    return assertPayload(await bridge.postMessage(request));
  }

  const response = await fetch(input, init);
  const payload = await response.json() as SourceLibraryGroupRoutePayload;
  if (!response.ok) {
    throw new Error(payload.error ?? 'Request failed');
  }
  return assertPayload(payload);
}
