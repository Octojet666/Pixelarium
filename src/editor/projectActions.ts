/** Shared project open/import helpers used by the library, dialogs and menus. */

import type { ProjectDoc } from '../types';
import { createProject } from '../engine/document';
import { deserializeProject } from '../engine/serialize';
import { listStoredProjects, loadRecoveryDraft, loadStoredProject, saveStoredProject } from '../db/library';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';
import {
  COMFORTABLE_URL_LENGTH,
  MAX_URL_LENGTH,
  copyTextToClipboard,
  createShareLink,
  formatByteSize,
  openShareToken,
} from '../lib/share';

export async function openStoredProject(id: string): Promise<boolean> {
  const ui = useUi.getState();
  try {
    const doc = await loadStoredProject(id);
    if (!doc) {
      ui.pushToast('That project could not be found in local storage.', 'error');
      return false;
    }
    useEditor.getState().loadDocument(doc);
    ui.setScreen('editor');
    ui.pushToast(`Opened “${doc.name}”.`, 'success');
    return true;
  } catch (error) {
    ui.pushToast(error instanceof Error ? error.message : 'Could not open the project.', 'error');
    return false;
  }
}

export async function openProjectFile(file: File): Promise<boolean> {
  const ui = useUi.getState();
  try {
    const text = await file.text();
    const doc = deserializeProject(text);
    doc.name = doc.name || file.name.replace(/\.pxl$/i, '');
    useEditor.getState().loadDocument(doc);
    ui.setScreen('editor');
    ui.pushToast(`Opened “${doc.name}” from ${file.name}.`, 'success');
    return true;
  } catch (error) {
    ui.pushToast(error instanceof Error ? error.message : 'That file is not a valid Pixelarium project.', 'error');
    return false;
  }
}

/** Imports a project from a self-contained share link as a new local copy. */
export async function openSharedProject(token: string): Promise<boolean> {
  const ui = useUi.getState();
  try {
    const doc = await openShareToken(token);
    await saveStoredProject(doc);
    useEditor.getState().loadDocument(doc);
    ui.setScreen('editor');
    ui.pushToast(`Opened “${doc.name}” from a share link — it is now in your library.`, 'success');
    return true;
  } catch (error) {
    ui.pushToast(error instanceof Error ? error.message : 'Could not open that share link.', 'error');
    return false;
  }
}

/** Copies a self-contained link for the active project. Nothing is uploaded. */
export async function copyShareLink(): Promise<boolean> {
  const ui = useUi.getState();
  try {
    const link = await createShareLink(useEditor.getState().doc);
    if (link.length > MAX_URL_LENGTH) {
      ui.pushToast(
        `This project is too large for a share link (${formatByteSize(link.length)}). Export a .pxl file instead.`,
        'error',
      );
      return false;
    }
    const copied = await copyTextToClipboard(link.url);
    if (!copied) {
      window.prompt('Copy this share link:', link.url);
      return false;
    }
    if (link.length > COMFORTABLE_URL_LENGTH) {
      ui.pushToast(
        `Link copied (${formatByteSize(link.length)}) — it is long, so some chat apps may cut it. A .pxl file is safer.`,
        'warning',
      );
    } else {
      ui.pushToast(`Share link copied (${formatByteSize(link.length)}). No account needed.`, 'success');
    }
    return true;
  } catch (error) {
    ui.pushToast(error instanceof Error ? error.message : 'Could not build a share link.', 'error');
    return false;
  }
}

export async function openRecovery(): Promise<boolean> {
  const ui = useUi.getState();
  const draft = await loadRecoveryDraft();
  if (!draft) {
    ui.pushToast('No recovery draft was found.', 'warning');
    return false;
  }
  useEditor.getState().loadDocument(draft.doc);
  ui.setScreen('editor');
  ui.pushToast(`Recovered “${draft.doc.name}” from autosave.`, 'success');
  return true;
}

export async function openDemoProject(doc: ProjectDoc): Promise<void> {
  const ui = useUi.getState();
  const copy = deserializeProject({
    format: 'pixelarium',
    version: 1,
    app: 'Pixelarium',
    savedAt: new Date().toISOString(),
    document: sanitizeForCopy(doc),
  });
  copy.id = `${doc.id}-${Date.now().toString(36)}`;
  useEditor.getState().loadDocument(copy);
  useUi.getState().setScreen('editor');
  ui.pushToast('Demo project opened. Yours to modify — save it to keep your version.', 'success');
}

export async function duplicateStoredProject(doc: ProjectDoc): Promise<void> {
  const ui = useUi.getState();
  const copy = deserializeProject({
    format: 'pixelarium',
    version: 1,
    app: 'Pixelarium',
    savedAt: new Date().toISOString(),
    document: sanitizeForCopy(doc),
  });
  copy.id = `${doc.id}-copy-${Date.now().toString(36)}`;
  copy.name = `${doc.name} copy`;
  copy.meta.createdAt = Date.now();
  copy.meta.updatedAt = Date.now();
  await saveStoredProject(copy);
  ui.pushToast(`Duplicated as “${copy.name}”.`, 'success');
}

function sanitizeForCopy(doc: ProjectDoc) {
  return {
    ...doc,
    frames: doc.frames.map((f) => ({
      ...f,
      cels: Object.fromEntries(
        Object.entries(f.cels).map(([k, v]) => {
          const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
          let binary = '';
          for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          }
          return [k, btoa(binary)];
        }),
      ),
    })),
  };
}

export async function refreshLibrary(): Promise<Awaited<ReturnType<typeof listStoredProjects>>> {
  return listStoredProjects();
}

export function blankProject(width: number, height: number, name = 'Untitled project'): ProjectDoc {
  return createProject({ width, height, name });
}
