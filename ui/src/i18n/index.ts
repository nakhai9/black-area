/**
 * Game language: English (default) or Vietnamese. Every on-screen text is written in English in the code and goes
 * through `t()`, which looks the English text up in the Vietnamese dictionary (`vi/*.ts`, merged here) when Vietnamese
 * is chosen. Placeholders `{name}` are filled from `vars`. The choice is kept per browser; changing it reloads the
 * page (a running game is carried over through a save, see Game.switchLanguage).
 */
export type Lang = 'en' | 'vi';
export const LANGS: readonly { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'vi', label: 'Tiếng Việt' },
];

const STORAGE_KEY = 'black-area.lang';

function readLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'vi' ? 'vi' : 'en';
  } catch {
    return 'en';
  }
}

let current: Lang = readLang();

export function getLang(): Lang {
  return current;
}

/** Stores the language (the caller reloads the page so everything is drawn again in it). */
export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* storage unavailable (private mode): the choice lasts this page only */
  }
}

// Every dictionary file under ./vi exports `default: Record<English, Vietnamese>`.
const modules = import.meta.glob<{ default: Record<string, string> }>('./vi/*.ts', { eager: true });
const VI: Record<string, string> = Object.assign({}, ...Object.values(modules).map((m) => m.default));

/** The text in the chosen language; `{key}` placeholders are replaced by `vars[key]`. */
export function t(en: string, vars?: Record<string, string | number>): string {
  const text = current === 'vi' ? (VI[en] ?? en) : en;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

/** A small language picker (select box) that calls `onChange` with the new language. */
export function languageSelect(onChange: (lang: Lang) => void): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'lang-select';
  const text = document.createElement('span');
  text.textContent = t('Language');
  const select = document.createElement('select');
  for (const l of LANGS) {
    const o = document.createElement('option');
    o.value = l.id;
    o.textContent = l.label;
    o.selected = l.id === current;
    select.append(o);
  }
  select.addEventListener('change', () => onChange(select.value === 'vi' ? 'vi' : 'en'));
  label.append(text, select);
  return label;
}
