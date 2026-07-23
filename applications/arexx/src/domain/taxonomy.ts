/**
 * Extraction de la taxonomie QUOI/OÙ depuis un `name` au format `quoi---lieu_precis--lieu--...`
 * (spec-nommage-v1.0.md, repris par fonctionnelles-rfxcom_specs_v5.6.md §9.3).
 *
 * Copie verbatim de applications/rfxcom/src/domain/taxonomy.ts — aucun parseur partagé n'existe
 * dans core, chaque intégration matérielle duplique ce fichier (précédent : rfxcom, evoo7).
 */

export interface ExtractedTaxonomy {
  rawQuoi: string;
  slugQuoi: string;
  nomPrecis: string | null;
  slugPrecis: string | null;
  nomLieu: string | null;
  slugLieu: string | null;
  nomPere: string | null;
  slugPere: string | null;
  nomGrandPere: string | null;
  slugGrandPere: string | null;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

export function extractTaxonomy(fullName: string): ExtractedTaxonomy {
  const parts = fullName.split('---');
  const rawQuoi = (parts[0] || '').trim();
  const lieux = parts[1] ? parts[1].split('--').map((s) => s.trim()) : [];

  const nomPrecis = lieux[0] || null;
  const nomLieu = lieux.length > 1 ? (lieux[1] || null) : (lieux[0] || null);
  const nomPere = lieux[2] || null;
  const nomGrandPere = lieux[3] || null;

  return {
    rawQuoi,
    slugQuoi: rawQuoi ? slugify(rawQuoi) : '',
    nomPrecis,
    slugPrecis: nomPrecis ? slugify(nomPrecis) : null,
    nomLieu,
    slugLieu: nomLieu ? slugify(nomLieu) : null,
    nomPere,
    slugPere: nomPere ? slugify(nomPere) : null,
    nomGrandPere,
    slugGrandPere: nomGrandPere ? slugify(nomGrandPere) : null
  };
}

/** Construit le bloc `attributs_taxonomie` porté par l'état MQTT (json_attributes_topic). */
export function buildAttributsTaxonomie(t: ExtractedTaxonomy): Record<string, string | null> {
  return {
    quoi: t.rawQuoi,
    slug_quoi: t.slugQuoi,
    lieu_principal: t.nomLieu,
    slug_lieu: t.slugLieu,
    lieu_precis: t.nomPrecis,
    slug_precis: t.slugPrecis,
    lieu_pere: t.nomPere,
    slug_pere: t.slugPere,
    lieu_grand_pere: t.nomGrandPere,
    slug_grand_pere: t.slugGrandPere
  };
}
