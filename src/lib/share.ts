/**
 * Self-contained share links.
 *
 * A link carries the whole project, compressed and base64url-encoded, in the URL.
 * There is no server, no account and nothing to moderate: opening the link imports
 * a copy into the reader's local library. The sender keeps their own project.
 */

import type { ProjectDoc } from '../types';
import { deserializeProject, serializeProjectToString } from '../engine/serialize';

export const SHARE_PARAM = 'share';
/** Browsers accept much longer URLs, but chat apps and QR codes do not. */
export const COMFORTABLE_URL_LENGTH = 8000;
/** Hard stop before a URL grows past what browsers accept. */
export const MAX_URL_LENGTH = 60000;

const TOKEN_PREFIX_DEFLATE = 'z1.';
const TOKEN_PREFIX_JSON = 'j1.';

export interface ShareLink {
  url: string;
  token: string;
  /** Length of the complete URL in characters. */
  length: number;
  /** False when the browser could not compress (the payload is still valid). */
  compressed: boolean;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot open compressed share links.');
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Builds a shareable URL for the document, without uploading anything. */
export async function createShareLink(doc: ProjectDoc, baseUrl?: string): Promise<ShareLink> {
  const json = serializeProjectToString(doc);
  const compressed = await deflateRaw(new TextEncoder().encode(json));
  const token = compressed
    ? TOKEN_PREFIX_DEFLATE + bytesToBase64Url(compressed)
    : TOKEN_PREFIX_JSON + bytesToBase64Url(new TextEncoder().encode(json));

  const fallbackBase =
    typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : 'https://pixelarium.app/';
  let url: string;
  try {
    const url_ = new URL(baseUrl ?? fallbackBase);
    url_.searchParams.set(SHARE_PARAM, token);
    url_.hash = '';
    url = url_.toString();
  } catch {
    url = `${baseUrl ?? fallbackBase}?${SHARE_PARAM}=${token}`;
  }
  return { url, token, length: url.length, compressed: compressed !== null };
}

/** Reads a project out of a share token. Always returns a fresh document identity. */
export async function openShareToken(token: string): Promise<ProjectDoc> {
  if (!token) throw new Error('The share link is empty.');
  let json: string;
  if (token.startsWith(TOKEN_PREFIX_DEFLATE)) {
    const bytes = await inflateRaw(base64UrlToBytes(token.slice(TOKEN_PREFIX_DEFLATE.length)));
    json = new TextDecoder().decode(bytes);
  } else if (token.startsWith(TOKEN_PREFIX_JSON)) {
    const bytes = base64UrlToBytes(token.slice(TOKEN_PREFIX_JSON.length));
    json = new TextDecoder().decode(bytes);
  } else {
    throw new Error('This share link was made by a different Pixelarium version.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('This share link is damaged. Ask the sender to copy it again.');
  }

  const doc = deserializeProject(parsed);
  const now = Date.now();
  // A copy, not the sender's project: new id, fresh timestamps, same artwork.
  doc.id = `shared-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  doc.meta = { ...doc.meta, createdAt: now, updatedAt: now };
  return doc;
}

/** Extracts the token from `?share=` (or a legacy `#share=`), if present. */
export function shareTokenFromLocation(search: string, hash: string): string | null {
  const fromSearch = new URLSearchParams(search).get(SHARE_PARAM);
  if (fromSearch) return fromSearch;
  const fromHash = new URLSearchParams(hash.replace(/^#/, '')).get(SHARE_PARAM);
  return fromHash || null;
}

/** Removes the share parameter after boot so reloading does not import again. */
export function stripShareParam(): void {
  const url = new URL(window.location.href);
  const hadSearch = url.searchParams.has(SHARE_PARAM);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  const hadHash = hashParams.has(SHARE_PARAM);
  if (!hadSearch && !hadHash) return;
  url.searchParams.delete(SHARE_PARAM);
  if (hadHash) {
    hashParams.delete(SHARE_PARAM);
    const nextHash = hashParams.toString();
    url.hash = nextHash ? `#${nextHash}` : '';
  } else if (!url.search) {
    url.hash = '';
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

/** Clipboard API with a fallback for non-secure contexts. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the textarea trick */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function formatByteSize(chars: number): string {
  return chars < 1024 ? `${chars} B` : `${(chars / 1024).toFixed(1)} KB`;
}
