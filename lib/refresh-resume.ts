export const REFRESH_RESUME_KEY = 'loom:refresh:resume';

export type RefreshResumePayload = {
  href: string;
  source?: 'today' | 'home' | 'patterns' | 'graph' | 'browse' | 'knowledge' | 'upload';
};
