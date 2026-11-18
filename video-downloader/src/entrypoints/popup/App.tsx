import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import type { PopupRequest, VideosResponse } from '../../core/messages';
import type { JobProgress, VideoCandidate } from '../../core/types';
import { S } from '../../shared/strings';

const ask = <T,>(req: PopupRequest) => browser.runtime.sendMessage(req) as Promise<T>;

export function App() {
  const [tabId, setTabId] = useState<number>();
  const [data, setData] = useState<VideosResponse>({ blocked: false, candidates: [], jobs: {} });
  const [showAds, setShowAds] = useState(false);
  const [variant, setVariant] = useState<Record<string, string>>({});

  const refresh = useCallback(async (id: number) => setData(await ask<VideosResponse>({ type: 'get-videos', tabId: id })), []);

  useEffect(() => {
    void browser.tabs.query({ active: true, currentWindow: true }).then(([t]) => t?.id != null && setTabId(t.id));
  }, []);
  useEffect(() => {
    if (tabId == null) return;
    void refresh(tabId);
    const t = setInterval(() => void refresh(tabId), 700);
    return () => clearInterval(t);
  }, [tabId, refresh]);

  if (data.blocked) return <main><p className="notice">{S.blocked}</p></main>;
  const ads = data.candidates.filter((c) => c.classification.label === 'ad');
  const shown = data.candidates.filter((c) => c.classification.label !== 'ad');

  return (
    <main>
      <h1>{S.title}</h1>
      {!data.candidates.length && <p className="muted">{S.empty}</p>}
      {shown.map((c) => (
        <Card key={c.id} c={c} job={data.jobs[c.id]} tabId={tabId!} selected={variant[c.id] ?? c.variants[0]?.id} onSelect={(v) => setVariant({ ...variant, [c.id]: v })} />
      ))}
      {ads.length > 0 && (
        <section>
          <button className="link" onClick={() => setShowAds(!showAds)}>
            {S.ads(ads.length)} · {showAds ? S.hideAds : S.showAds}
          </button>
          {showAds && ads.map((c) => <Card key={c.id} c={c} dim tabId={tabId!} selected={variant[c.id] ?? c.variants[0]?.id} onSelect={(v) => setVariant({ ...variant, [c.id]: v })} job={data.jobs[c.id]} />)}
        </section>
      )}
      <footer>{S.legal}</footer>
    </main>
  );
}

function Card(props: { c: VideoCandidate; job?: JobProgress; tabId: number; selected: string; dim?: boolean; onSelect: (v: string) => void }) {
  const { c, job, tabId, selected, dim } = props;
  const host = new URL(c.url).hostname;
  const label = c.classification.label;
  const pct = job && job.total ? `${Math.round((job.done / job.total) * 100)} %` : '…';
  return (
    <article className={dim ? 'card dim' : 'card'}>
      <div className="row">
        <strong className="host" title={c.url}>{host}</strong>
        <span className="tag">{c.kind.toUpperCase()}</span>
        {label === 'unknown' && <span className="tag warn" title={c.classification.reasons.join('\n')}>{S.uncertain}</span>}
      </div>
      {c.unsupportedReason ? (
        <p className="muted">{c.unsupportedReason}</p>
      ) : job ? (
        <div className="row">
          <progress value={job.total ? job.done : undefined} max={job.total || undefined} />
          <span>{job.phase === 'mux' ? S.muxing : S.downloading(pct)}</span>
          <button onClick={() => ask({ type: 'cancel', jobId: job.jobId })}>{S.cancel}</button>
        </div>
      ) : (
        <div className="row">
          <select aria-label={S.quality} value={selected} onChange={(e) => props.onSelect(e.target.value)}>
            {c.variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
          <button className="primary" onClick={() => ask({ type: 'download', tabId, candidateId: c.id, variantId: selected })}>{S.download}</button>
        </div>
      )}
      <button className="link small" onClick={() => ask({ type: 'mark', tabId, candidateId: c.id, as: dim ? 'content' : 'ad' })}>
        {dim ? S.markContent : S.markAd}
      </button>
    </article>
  );
}
