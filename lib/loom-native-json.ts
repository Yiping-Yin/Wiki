import { isNativeMode } from './is-native-mode';

export async function fetchNativeJson<T>(url: string): Promise<T | null> {
  if (!isNativeMode()) return null;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
