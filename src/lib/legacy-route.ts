import { legacyPages } from '@/generated/legacy-pages';

export type LegacyRoute = { page: string; section: string };

export function resolveLegacyRoute(currentSection: string, rawHref: string): LegacyRoute | null {
  if (!rawHref || rawHref.startsWith('#') || /^(https?:|mailto:|tel:|data:)/i.test(rawHref)) return null;

  const href = decodeURIComponent(rawHref).replace(/\\/g, '/');
  const cleanPath = href.split(/[?#]/)[0];
  const sectionMatch = cleanPath.match(/(?:^|\/)(User|Admin|Login)(?:\/|$)/i);
  const section = sectionMatch ? sectionMatch[1].toLowerCase() : currentSection.toLowerCase();
  const fileName = cleanPath.split('/').filter(Boolean).at(-1);
  if (!fileName?.toLowerCase().endsWith('.html')) return null;

  const page = fileName.slice(0, -5);
  if (legacyPages[`${section}/${page}`]) return { section, page };

  const matchingKey = Object.keys(legacyPages).find((key) => key.endsWith(`/${page}`));
  if (!matchingKey) return null;
  const [matchingSection, matchingPage] = matchingKey.split('/');
  return { section: matchingSection, page: matchingPage };
}
