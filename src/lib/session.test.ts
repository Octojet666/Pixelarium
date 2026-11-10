import { describe, expect, it } from 'vitest';
import { projectIdFromSearch, projectTabUrl } from './session';

describe('project session links', () => {
  it('reads a project id from the query string', () => {
    expect(projectIdFromSearch('?project=abc-123')).toBe('abc-123');
    expect(projectIdFromSearch('?foo=1&project=abc-123&bar=2')).toBe('abc-123');
  });

  it('ignores empty or missing ids', () => {
    expect(projectIdFromSearch('')).toBeNull();
    expect(projectIdFromSearch('?project=%20')).toBeNull();
    expect(projectIdFromSearch('?project=')).toBeNull();
  });

  it('builds a same-origin tab link and keeps other parameters', () => {
    const url = new URL(projectTabUrl('https://pixelarium.app/?ref=home', 'abc-123'));
    expect(url.origin).toBe('https://pixelarium.app');
    expect(url.pathname).toBe('/');
    expect(url.searchParams.get('project')).toBe('abc-123');
    expect(url.searchParams.get('ref')).toBe('home');
  });

  it('encodes ids that need escaping', () => {
    const url = new URL(projectTabUrl('https://pixelarium.app/editor?x=1', 'a b&c'));
    expect(url.searchParams.get('project')).toBe('a b&c');
  });
});
