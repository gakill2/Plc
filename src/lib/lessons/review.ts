/**
 * Code review by a "senior colleague": checks of habits that tests cannot see — symbols instead
 * of addresses, comments, named values instead of magic numbers, leftovers, alarms for the
 * operator. Advisory only: it never blocks a lesson.
 */
import type { Hmi } from '#lib/hmi/model.js';

export interface ReviewItem {
	ok: boolean;
	text: string;
}

/** The ST source without comments and string-like noise. */
function code(src: string): string {
	return src.replace(/\(\*[\s\S]*?\*\)/g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

/** Statements only: the VAR … END_VAR blocks and TYPE blocks removed. */
function statements(src: string): string {
	return code(src)
		.replace(/\bVAR(?:_INPUT|_OUTPUT)?\b(?:\s+RETAIN)?[\s\S]*?\bEND_VAR\b/gi, ' ')
		.replace(/\bTYPE\b[\s\S]*?\bEND_TYPE\b/gi, ' ');
}

export function reviewSt(src: string, hmi: Hmi | undefined): ReviewItem[] {
	const items: ReviewItem[] = [];
	const body = statements(src);
	const lines = src.split('\n').filter((l) => l.trim());

	// absolute addresses in the logic
	const addresses = [...new Set(body.match(/%?\b[IQM][XBWD]?\d+(?:\.\d)?\b/g) ?? [])];
	items.push(
		addresses.length
			? {
					ok: false,
					text: `Adresy zamiast symboli: ${addresses.slice(0, 5).join(', ')}${addresses.length > 5 ? ' …' : ''}. Dodaj je do tablicy symboli — za rok nikt nie będzie pamiętał, co to I0.3.`
				}
			: { ok: true, text: 'Program używa symboli, nie gołych adresów.' }
	);

	// comments
	const commented = lines.filter((l) => /\/\/|\(\*/.test(l)).length;
	const ratio = lines.length ? commented / lines.length : 0;
	items.push(
		ratio < 0.1
			? {
					ok: false,
					text: `Mało komentarzy (${Math.round(ratio * 100)} % linii). Opisz kroki sekwencji i każdą blokadę: dlaczego, a nie co.`
				}
			: { ok: true, text: 'Kod jest skomentowany.' }
	);

	// magic numbers (outside declarations and CASE labels)
	const numbers = (
		body
			.replace(/^\s*-?\d+\s*(?:,\s*-?\d+\s*)*:/gm, ' ')
			.match(/(?<![\w#.])\d+(?:\.\d+)?(?![\w#])/g) ?? []
	)
		.map(Number)
		.filter((n) => n > 1);
	const distinct = [...new Set(numbers)];
	items.push(
		distinct.length > 6
			? {
					ok: false,
					text: `Dużo liczb wpisanych na sztywno (${distinct.slice(0, 6).join(', ')} …). Nazwij je zmiennymi z wartością początkową, np. \`levelA : INT := 11059; // 40 %\` — zmiana progu będzie w jednym miejscu.`
				}
			: { ok: true, text: 'Progi i czasy są nazwane albo jest ich niewiele.' }
	);

	// leftovers
	const todos = (src.match(/TODO/g) ?? []).length;
	if (todos)
		items.push({ ok: false, text: `Zostało ${todos} × TODO — dokończ albo usuń przed odbiorem.` });

	// alarms for the operator
	if (hmi)
		items.push(
			hmi.alarms.length
				? { ok: true, text: `Panel ma ${hmi.alarms.length} alarm(y) — operator wie, co się stało.` }
				: {
						ok: false,
						text: 'Panel HMI nie ma alarmów. Lampka „Alarm” nie mówi operatorowi, CO się stało — dodaj alarmy z opisem (widok HMI → Alarmy).'
					}
		);

	// sequence readability
	if (/\bCASE\s+\w+\s+OF/i.test(body) && !/\/\/[^\n]*(krok|step)|\(\*[^*]*(krok|step)/i.test(src))
		items.push({
			ok: false,
			text: 'Sekwencja w CASE bez opisu kroków. Dopisz przy każdym numerze, co robi maszyna (np. `10: // dozowanie A`).'
		});

	return items;
}
