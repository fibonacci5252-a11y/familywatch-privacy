# Video Detector & Downloader

Extension **Chrome, Edge et Firefox** (Manifest V3, une seule base de code) qui détecte les vidéos d'une page,
propose plusieurs qualités, **écarte les publicités** et télécharge en MP4 — 100 % en local, sans serveur.

Stack : TypeScript · [WXT](https://wxt.dev) · React · Vite · mux.js · Vitest.

## Démarrer

```bash
npm install
npm run dev            # Chrome (rechargement à chaud)
npm run dev:firefox    # Firefox   ·   npm run dev:edge   # Edge
npm test               # tests unitaires (classifieur, parsers HLS/DASH, blocklist)
npm run e2e            # test de bout en bout dans Chromium (requiert ffmpeg + playwright)
npm run build && npm run build:edge && npm run build:firefox
npm run zip            # archives prêtes pour les stores (+ zip:edge, zip:firefox)
```

## Architecture

```
Page ── content.ts (monde isolé)  : scanne <video>, shadow DOM, MutationObserver
     └─ injected.content.ts (MAIN): détecte EME (DRM) et requêtes VAST/IMA
                │ runtime.sendMessage
                ▼
Service worker / page événementielle (background.ts)
  detector.ts   webRequest.onHeadersReceived → candidats (direct/HLS/DASH)
                lit les manifestes → qualités, durée, signaux de pub
  classifier    score 0-100 → contenu / incertain / pub   (core/classifier.ts)
  registry.ts   état par onglet dans storage.session (le worker peut s'arrêter)
  headers.ts    règles DNR Referer/Origin le temps d'un job
  processor.ts  Chromium : document offscreen · Firefox : exécution directe
                │
                ▼
core/runner.ts  segments en parallèle → déchiffrement AES-128 → remux TS→MP4 (mux.js)
                → blob: URL → chrome.downloads
Popup React     liste, choix de la qualité, progression, « marquer comme pub »
```

### Différences entre navigateurs

| | Chrome / Edge | Firefox |
|---|---|---|
| Fond | service worker | page événementielle (`background.scripts`) |
| Assemblage | document **offscreen** | directement dans la page de fond (+ keep-alive) |
| Permission `offscreen` | oui | non (retirée du manifeste) |
| Accès aux sites | accordé à l'installation | **MV3 : l'utilisateur doit autoriser « tous les sites » dans about:addons** pour la détection automatique |

### Détection des publicités

Score cumulé (`core/classifier.ts`) : domaine/chemin publicitaire, iframe pub, signaux VAST/IMA, marqueurs
SCTE-35/DATERANGE dans le HLS, durée courte ou très inférieure au média principal, lecteur muet + autoplay + sans
contrôles, petit lecteur, classes DOM (`ad`, `preroll`…), bonus « plus grand lecteur ». ≥ 60 → pub, ≤ 35 → contenu,
entre les deux → « incertain » (affiché, jamais masqué). Le bouton « marquer comme pub/contenu » enregistre le
domaine localement et reclasse.

## État d'avancement

| Fonction | État |
|---|---|
| MP4/WebM directs | fait |
| HLS (TS → MP4, fMP4, AES-128), choix de qualité | fait, testé en e2e |
| Détection de pubs (heuristiques + liste de domaines) | fait (liste de domaines minimale) |
| Blocklist de sites (YouTube, Netflix…), détection DRM | fait |
| HLS avec audio séparé, DASH, BYTERANGE | **à faire (phase 2)** — ffmpeg.wasm + segments DASH |
| EasyList/EasyPrivacy compilées | **à faire (phase 3)** — `scripts/update-filters` |
| Écriture en flux (OPFS) pour très gros fichiers | **à faire** — aujourd'hui assemblage via Blob |
| Tests Firefox / Edge en conditions réelles | **à faire** — build vérifié, exécution non testée |

## Avant publication

- Remplacer l'ID Gecko (`wxt.config.ts`) et compléter `store/privacy-policy.fr.md`.
- Justifier `<all_urls>` dans la fiche du Chrome Web Store (détection automatique sur tout site).
- Le Store rejette les extensions de téléchargement ciblant YouTube & co : la blocklist (`core/blocklist.ts`) est obligatoire.
