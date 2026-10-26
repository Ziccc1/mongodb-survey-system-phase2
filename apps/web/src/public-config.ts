declare global { interface Window { __SURVEY_CONFIG__?: { publicAppUrl: string; libraryEnabled?:boolean } } }
export const libraryEnabled=()=>window.__SURVEY_CONFIG__?.libraryEnabled===true;
export function shareUrl(publicId: string): string {
  const base = window.__SURVEY_CONFIG__?.publicAppUrl;
  if (!base) return '';
  return new URL(`/survey/${encodeURIComponent(publicId)}`, base).href;
}
export function localShare(url: string): boolean {
  return !!url && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
}
