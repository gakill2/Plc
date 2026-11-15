import { StreamLanguage, type StreamParser } from '@codemirror/language';

const MNEMONICS = new Set(
	'A AN O ON X XN NOT SET CLR S R FP FN L T SD SE SP SF JU JC JCN BE BEC BEU NOP NETWORK NW TITLE'.split(
		' '
	)
);

const parser: StreamParser<{ start: boolean }> = {
	startState: () => ({ start: true }),
	token(stream, state) {
		if (stream.sol()) state.start = true;
		if (stream.eatSpace()) return null;
		if (stream.match('//')) {
			stream.skipToEnd();
			return 'comment';
		}
		if (state.start && stream.match(/^[A-Za-z_]\w{0,7}:(?!=)/)) return 'labelName';
		if (stream.match(/^"[^"]*"/)) return 'variableName.special';
		if (stream.match(/^(S5T|S5TIME|T|TIME|L|B|W|DW)#[\w#.]+/i) || stream.match(/^2#[01_]+/))
			return 'number';
		if (stream.match(/^[+-]?\d+(\.\d+)?/)) return 'number';
		if (state.start) {
			state.start = false;
			if (stream.match(/^(==|<>|>=|<=|>|<|[+\-*/])[IDR]\b/) || stream.match(/^[=)]/))
				return 'operator';
			const w = stream.match(/^[A-Za-z]+\(?/);
			if (w) {
				const word = (w as RegExpMatchArray)[0].replace('(', '').toUpperCase();
				return MNEMONICS.has(word) ? 'keyword' : null;
			}
		}
		if (stream.match(/^P?[IQM][BWD]?\s?\d+(\.\d)?/i) || stream.match(/^[TC]\s?\d+/i)) return 'atom';
		if (stream.match(/^[A-Za-z_]\w*/)) return 'variableName';
		stream.next();
		return null;
	},
	languageData: { commentTokens: { line: '//' } }
};

export const stlLanguage = StreamLanguage.define(parser);
