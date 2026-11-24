/**
 * Language of the interface: French or English.
 *
 * The language is read once at start-up (localStorage, else the browser's language) and changing
 * it reloads the page: every text can then simply call `t(fr, en)`, in components as well as in
 * plain modules and constants, without a React context.
 */
export type Lang = 'fr' | 'en';

/** localStorage key of the language (JSON string, like the other settings). */
export const LANG_KEY = 'lang';

function initialLang(): Lang {
  try {
    const raw = localStorage.getItem(LANG_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      if (stored === 'fr' || stored === 'en') return stored;
    }
  } catch {
    // No localStorage (worker, private mode): fall back on the browser's language.
  }
  const nav = typeof navigator !== 'undefined' ? navigator.languages?.[0] ?? navigator.language : 'fr';
  return nav?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export const lang: Lang = initialLang();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

/** BCP 47 locale for numbers and dates (toLocaleString, Intl). */
export const locale = lang === 'fr' ? 'fr-FR' : 'en-US';

/** The text in the current language: `t('Réessayer', 'Try again')`. */
export function t<T = string>(fr: T, en: T): T {
  return lang === 'fr' ? fr : en;
}

/** Saves the language and reloads the page in it. */
export function setLang(l: Lang) {
  if (l === lang) return;
  localStorage.setItem(LANG_KEY, JSON.stringify(l));
  location.reload();
}

/** A number in the current locale: "1 234" / "1,234". */
export const fmt = (n: number, options?: Intl.NumberFormatOptions) => n.toLocaleString(locale, options);

/**
 * Plural in the current language: "1 partie", "3 parties" / "1 game", "3 games".
 * French uses the singular for 0 and 1, English only for 1.
 */
export const plural = (n: number, one: string, many: string) =>
  `${fmt(n)} ${(lang === 'fr' ? n > 1 : n !== 1) ? many : one}`;

/**
 * Error messages written in French by @tabiya/data and the server, in English. Exact messages
 * first, then patterns for those with a value inside.
 */
const ERRORS_EN: Record<string, string> = {
  'Pas un coup à entraîner dans ce répertoire': 'Not a move to train in this repertoire',
  'Cette position n’est pas encore apprise : entraînez-la d’abord': 'This position is not learnt yet: train it first',
  'Indiquez votre pseudo Chess.com dans les paramètres': 'Enter your Chess.com username in the settings',
  'Liez votre compte Lichess dans les paramètres': 'Link your Lichess account in the settings',
  'Répertoire introuvable': 'Repertoire not found',
  'Coup illégal': 'Illegal move',
  'Chess.com est injoignable : pseudo enregistré, les classements seront récupérés plus tard.':
    'Chess.com cannot be reached: username saved, the ratings will be fetched later.',
  'Lichess est injoignable, réessayez plus tard': 'Lichess cannot be reached, try again later',
  'Lichess limite le nombre de requêtes : réessayez dans une minute': 'Lichess limits the number of requests: try again in a minute',
  'Lichess a refusé la requête (étude privée, ou accès bloqué)': 'Lichess refused the request (private study, or access blocked)',
  'Étude introuvable ou privée': 'Study not found or private',
};
const ERROR_PATTERNS_EN: [RegExp, (...m: string[]) => string][] = [
  [/^Coup illégal (\S+) au demi-coup (\d+)$/, (_, uci, ply) => `Illegal move ${uci} at ply ${ply}`],
  [/^Lichess a répondu (\d+)$/, (_, status) => `Lichess answered ${status}`],
];

/** An error message from @tabiya/data or the server, in the current language. */
export function translateError(message: string): string {
  if (lang === 'fr') return message;
  if (ERRORS_EN[message]) return ERRORS_EN[message];
  for (const [re, en] of ERROR_PATTERNS_EN) {
    const m = message.match(re);
    if (m) return en(...m);
  }
  return message;
}
