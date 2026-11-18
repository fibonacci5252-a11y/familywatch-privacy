import { browser } from 'wxt/browser';
import { hostOf } from '../core/url';

// Certains CDN exigent Referer/Origin de la page d'origine. On les fixe le
// temps d'un téléchargement, uniquement pour les domaines concernés.
let nextRuleId = 1;
const ruleByJob = new Map<string, number>();

export async function clearStaleRules(): Promise<void> {
  const rules = await browser.declarativeNetRequest.getSessionRules();
  if (rules.length) await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds: rules.map((r) => r.id) });
}

export async function addRefererRule(jobId: string, mediaUrls: string[], pageUrl: string): Promise<void> {
  const domains = [...new Set(mediaUrls.map(hostOf).filter(Boolean))];
  if (!domains.length || !/^https?:/.test(pageUrl)) return;
  const id = nextRuleId++;
  ruleByJob.set(jobId, id);
  await browser.declarativeNetRequest.updateSessionRules({
    addRules: [
      {
        id,
        priority: 1,
        action: {
          type: 'modifyHeaders' as any,
          requestHeaders: [
            { header: 'referer', operation: 'set' as any, value: pageUrl },
            { header: 'origin', operation: 'set' as any, value: new URL(pageUrl).origin },
          ],
        },
        condition: { requestDomains: domains, resourceTypes: ['xmlhttprequest', 'media', 'other'] as any },
      },
    ],
  });
}

export async function removeRefererRule(jobId: string): Promise<void> {
  const id = ruleByJob.get(jobId);
  if (id == null) return;
  ruleByJob.delete(jobId);
  await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] }).catch(() => undefined);
}
