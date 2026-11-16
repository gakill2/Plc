/*
 * A minimal .xlsx writer: one worksheet of text cells, shared strings, no styles, stored
 * (uncompressed) zip. Enough for tag tables that TIA Portal and Excel import.
 */

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

export function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/** A zip archive with the files stored as they are (method 0). */
export function zipStored(files: { name: string; data: Uint8Array }[]): Uint8Array<ArrayBuffer> {
	const enc = new TextEncoder();
	const chunks: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;
	for (const f of files) {
		const name = enc.encode(f.name);
		const crc = crc32(f.data);
		const local = new Uint8Array(30 + name.length);
		const v = new DataView(local.buffer);
		v.setUint32(0, 0x04034b50, true);
		v.setUint16(4, 20, true); // version needed
		v.setUint16(6, 0x0800, true); // UTF-8 names
		v.setUint16(8, 0, true); // stored
		v.setUint16(10, 0, true); // time
		v.setUint16(12, 0x21, true); // date: 1980-01-01
		v.setUint32(14, crc, true);
		v.setUint32(18, f.data.length, true);
		v.setUint32(22, f.data.length, true);
		v.setUint16(26, name.length, true);
		local.set(name, 30);
		chunks.push(local, f.data);

		const c = new Uint8Array(46 + name.length);
		const cv = new DataView(c.buffer);
		cv.setUint32(0, 0x02014b50, true);
		cv.setUint16(4, 20, true);
		cv.setUint16(6, 20, true);
		cv.setUint16(8, 0x0800, true);
		cv.setUint16(10, 0, true);
		cv.setUint16(12, 0, true);
		cv.setUint16(14, 0x21, true);
		cv.setUint32(16, crc, true);
		cv.setUint32(20, f.data.length, true);
		cv.setUint32(24, f.data.length, true);
		cv.setUint16(28, name.length, true);
		cv.setUint32(42, offset, true);
		c.set(name, 46);
		central.push(c);
		offset += local.length + f.data.length;
	}
	const size = central.reduce((n, c) => n + c.length, 0);
	const end = new Uint8Array(22);
	const ev = new DataView(end.buffer);
	ev.setUint32(0, 0x06054b50, true);
	ev.setUint16(8, files.length, true);
	ev.setUint16(10, files.length, true);
	ev.setUint32(12, size, true);
	ev.setUint32(16, offset, true);
	const all = [...chunks, ...central, end];
	const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
	let at = 0;
	for (const c of all) {
		out.set(c, at);
		at += c.length;
	}
	return out;
}

const esc = (s: string) =>
	s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		// characters XML 1.0 does not allow
		.replace(/[\p{Cc}]/gu, (c) => (c === '\t' || c === '\n' || c === '\r' ? c : ''));

const column = (i: number): string =>
	i < 26 ? String.fromCharCode(65 + i) : column(Math.floor(i / 26) - 1) + column(i % 26);

/** One sheet of text cells as an .xlsx file. */
export function xlsx(sheetName: string, rows: string[][]): Uint8Array<ArrayBuffer> {
	const strings: string[] = [];
	const index = new Map<string, number>();
	const sid = (s: string) => {
		let i = index.get(s);
		if (i === undefined) {
			i = strings.length;
			strings.push(s);
			index.set(s, i);
		}
		return i;
	};
	const sheetRows = rows
		.map(
			(r, y) =>
				`<row r="${y + 1}">${r
					.map((cell, x) => `<c r="${column(x)}${y + 1}" t="s"><v>${sid(cell)}</v></c>`)
					.join('')}</row>`
		)
		.join('');
	const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
	const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
	const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
	const parts: [string, string][] = [
		[
			'[Content_Types].xml',
			`${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`
		],
		[
			'_rels/.rels',
			`${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`
		],
		[
			'xl/workbook.xml',
			`${xml}<workbook xmlns="${main}" xmlns:r="${rel}"><sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`
		],
		[
			'xl/_rels/workbook.xml.rels',
			`${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`
		],
		[
			'xl/worksheets/sheet1.xml',
			`${xml}<worksheet xmlns="${main}"><sheetData>${sheetRows}</sheetData></worksheet>`
		],
		[
			'xl/sharedStrings.xml',
			`${xml}<sst xmlns="${main}" count="${strings.length}" uniqueCount="${strings.length}">${strings
				.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`)
				.join('')}</sst>`
		]
	];
	const enc = new TextEncoder();
	return zipStored(parts.map(([name, text]) => ({ name, data: enc.encode(text) })));
}
