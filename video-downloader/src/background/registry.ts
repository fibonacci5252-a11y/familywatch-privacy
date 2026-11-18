import { browser } from 'wxt/browser';
import type { FrameState, VideoCandidate } from '../core/types';

interface TabRecord {
  candidates: Record<string, VideoCandidate>;
  frames: Record<number, FrameState>;
}

// Le service worker (Chrome) / la page événementielle (Firefox) peut être
// arrêtée à tout moment : l'état vit dans storage.session, pas en mémoire.
const keyOf = (tabId: number) => `tab:${tabId}`;
const locks = new Map<number, Promise<unknown>>();

/** Sérialise les lectures-modifications-écritures d'un même onglet. */
export function withTab<T>(tabId: number, fn: (rec: TabRecord) => T | Promise<T>): Promise<T> {
  const prev = locks.get(tabId) ?? Promise.resolve();
  const run = prev.then(async () => {
    const stored = (await browser.storage.session.get(keyOf(tabId)))[keyOf(tabId)] as TabRecord | undefined;
    const rec: TabRecord = stored ?? { candidates: {}, frames: {} };
    const result = await fn(rec);
    await browser.storage.session.set({ [keyOf(tabId)]: rec });
    return result;
  });
  locks.set(tabId, run.catch(() => undefined));
  return run;
}

export async function readTab(tabId: number): Promise<TabRecord> {
  return withTab(tabId, (rec) => rec);
}

export async function clearTab(tabId: number): Promise<void> {
  await locks.get(tabId);
  locks.delete(tabId);
  await browser.storage.session.remove(keyOf(tabId));
}

export interface UserPrefs {
  adDomains: string[];
  contentDomains: string[];
}
export async function getPrefs(): Promise<UserPrefs> {
  const s = (await browser.storage.local.get('prefs')).prefs as UserPrefs | undefined;
  return s ?? { adDomains: [], contentDomains: [] };
}
export async function savePrefs(p: UserPrefs): Promise<void> {
  await browser.storage.local.set({ prefs: p });
}
