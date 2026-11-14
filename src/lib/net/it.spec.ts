import { describe, expect, it } from 'vitest';
import { FLOWS, grade, topicMatches, validFilter } from './it.js';

describe('MQTT topics', () => {
	it('matches + and # wildcards', () => {
		expect(topicMatches('plant/line1/+/speed', 'plant/line1/conveyor/speed')).toBe(true);
		expect(topicMatches('plant/line1/+/speed', 'plant/line1/conveyor/temp')).toBe(false);
		expect(topicMatches('plant/#', 'plant/line2/oven/temp')).toBe(true);
		expect(topicMatches('plant/#', 'plant')).toBe(true); // # also matches the parent level
		expect(topicMatches('plant/line1/oven/temp', 'plant/line1/oven/temp')).toBe(true);
		expect(topicMatches('+/+', 'plant/line1/oven')).toBe(false);
	});

	it('rejects malformed filters', () => {
		expect(validFilter('plant/#/temp')).toBe(false);
		expect(validFilter('plant/li+ne')).toBe(false);
		expect(validFilter('plant/+/temp')).toBe(true);
	});
});

describe('OT firewall', () => {
	it('grades the decisions', () => {
		const perfect = Object.fromEntries(FLOWS.map((f) => [f.id, f.allow]));
		expect(grade(perfect).correct).toBe(FLOWS.length);
		expect(grade({ 'office-plc': true }).correct).toBe(0);
	});
});
