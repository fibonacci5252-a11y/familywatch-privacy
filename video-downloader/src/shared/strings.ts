// Textes de l'interface (français). Centralisés pour une future traduction.
export const S = {
  title: 'Vidéos détectées',
  empty: 'Aucune vidéo détectée sur cette page. Lancez la lecture pour la faire apparaître.',
  blocked: "Cette extension est désactivée sur ce site : ses conditions d'utilisation interdisent le téléchargement.",
  download: 'Télécharger',
  cancel: 'Annuler',
  quality: 'Qualité',
  ads: (n: number) => `Publicités masquées (${n})`,
  showAds: 'Afficher',
  hideAds: 'Masquer',
  uncertain: 'Incertain',
  markAd: 'Marquer comme pub',
  markContent: 'Marquer comme contenu',
  saved: 'Téléchargement lancé',
  downloading: (pct: string) => `Téléchargement… ${pct}`,
  muxing: 'Conversion en MP4…',
  legal: "Ne téléchargez que des contenus dont vous avez le droit de disposer.",
};
