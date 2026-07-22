// Réglages d'accueil (manager). Ici on n'expose que la FAQ générale (gérable depuis le manager) ;
// le PUT est partiel — le backend conserve les autres champs (bannière, slogan, éditorial) tels quels.
import { apiGet, apiPut } from '../apiFetch';

export interface HomeFaqItem {
  question: string;
  answer: string;
}

function mapFaq(value: unknown): HomeFaqItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      return { question: String(r.question ?? '').trim(), answer: String(r.answer ?? '').trim() };
    })
    .filter((f) => f.question && f.answer);
}

/** GET /api/gestion/home-settings — renvoie la FAQ générale actuelle. */
export async function getHomeFaq(signal?: AbortSignal): Promise<HomeFaqItem[]> {
  const res = await apiGet<{ ok: boolean; settings?: { faq?: unknown } }>('/api/gestion/home-settings', undefined);
  void signal;
  return mapFaq(res.settings?.faq);
}

/** PUT /api/gestion/home-settings — met à jour uniquement la FAQ générale. */
export async function saveHomeFaq(faq: HomeFaqItem[]): Promise<HomeFaqItem[]> {
  const res = await apiPut<{ ok: boolean; settings?: { faq?: unknown } }>('/api/gestion/home-settings', { faq });
  return mapFaq(res.settings?.faq);
}
