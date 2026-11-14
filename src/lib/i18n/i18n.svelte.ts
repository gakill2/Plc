/**
 * Interface language. The chrome of the app is translated (English / Polish); the learning
 * content — chapters, lessons, tickets — is written in Polish.
 *
 * `t(key)` reads the current locale, so anything rendered with it updates when it changes.
 * The English dictionary defines the keys; the Polish one must have every key (checked by tsc).
 */
import { en } from './en.js';
import { pl } from './pl.js';

export type Locale = 'pl' | 'en';
export type MessageKey = keyof typeof en;

const STORAGE_KEY = 'plcsim:lang';
const DICTS: Record<Locale, Record<MessageKey, string>> = { en, pl };

class I18n {
	locale = $state<Locale>('pl');

	/** The saved choice, or the browser's language. Call once in the browser. */
	init() {
		let saved: string | null = null;
		try {
			saved = localStorage.getItem(STORAGE_KEY);
		} catch {
			// storage blocked
		}
		this.locale =
			saved === 'pl' || saved === 'en'
				? saved
				: (navigator.language ?? '').toLowerCase().startsWith('pl')
					? 'pl'
					: 'en';
		document.documentElement.lang = this.locale;
	}

	set(locale: Locale) {
		this.locale = locale;
		document.documentElement.lang = locale;
		try {
			localStorage.setItem(STORAGE_KEY, locale);
		} catch {
			// storage blocked
		}
	}
}

export const i18n = new I18n();

/** The message in the current language; `{name}` placeholders are filled from `vars`. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
	const text = DICTS[i18n.locale][key] ?? en[key];
	return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text;
}
