/** Multi-tab sessions: a `?project=<id>` link boots straight into that project in its own tab. */

export const PROJECT_PARAM = 'project';

/** Reads the project id from a location search string (`?project=...`). */
export function projectIdFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get(PROJECT_PARAM)?.trim();
  return id ? id : null;
}

/** Builds the deep link that opens one project in a tab of its own. */
export function projectTabUrl(href: string, id: string): string {
  const url = new URL(href);
  url.searchParams.set(PROJECT_PARAM, id);
  return url.toString();
}

/** Opens a stored project in a new tab, leaving this tab's document untouched. */
export function openProjectInNewTab(id: string): void {
  window.open(projectTabUrl(window.location.href, id), '_blank', 'noopener');
}

/** Removes the deep-link parameter after it has been consumed, so this tab behaves normally. */
export function stripProjectParam(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(PROJECT_PARAM)) return;
  url.searchParams.delete(PROJECT_PARAM);
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}
