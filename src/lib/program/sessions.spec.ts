import { describe, expect, it } from 'vitest';

import { addDays, generateSessions, nextOccurrence, seriesWindow, weekdayOf } from './sessions.js';

describe('date arithmetic', () => {
	it('crosses a month boundary', () => {
		expect(addDays('2026-08-30', 3)).toBe('2026-09-02');
	});

	it('crosses a year boundary', () => {
		expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
	});

	it('crosses a leap day', () => {
		expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
		expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
	});

	it('reads weekdays in UTC', () => {
		// 2026-09-08 is a Tuesday.
		expect(weekdayOf('2026-09-08')).toBe(2);
	});
});

describe('series generator', () => {
	it('produces two dates per week for a twice-weekly, five-week course', () => {
		const sessions = generateSessions({
			startDate: '2026-09-08', // Tuesday
			weekdays: [2, 4], // Tuesday and Thursday
			weeks: 5
		});

		expect(sessions).toHaveLength(10);
		expect(sessions[0].date).toBe('2026-09-08');
		expect(sessions[1].date).toBe('2026-09-10');
		expect(sessions.at(-1)?.date).toBe('2026-10-08');
	});

	it('delivers the promised count even when the start falls mid-week', () => {
		// Wednesday start, Monday/Wednesday course, three weeks. Week one has no
		// Monday left, so the run reaches into a sixth calendar day-span to still
		// deliver 2 × 3 sessions — the count is what the series price is for.
		const sessions = generateSessions({
			startDate: '2026-09-09', // Wednesday
			weekdays: [1, 3],
			weeks: 3
		});

		expect(sessions.map((s) => s.date)).toEqual([
			'2026-09-09',
			'2026-09-14',
			'2026-09-16',
			'2026-09-21',
			'2026-09-23',
			'2026-09-28'
		]);
	});

	it('always proposes weekdays × weeks sessions', () => {
		for (const weeks of [1, 4, 8]) {
			for (const weekdays of [[1], [2, 4], [1, 3, 5]] as const) {
				const sessions = generateSessions({
					startDate: '2026-09-09',
					weekdays: [...weekdays],
					weeks
				});

				expect(sessions).toHaveLength(weekdays.length * weeks);
			}
		}
	});

	it('drops a skipped holiday without extending the series', () => {
		const full = generateSessions({ startDate: '2026-09-08', weekdays: [2, 4], weeks: 5 });
		const trimmed = generateSessions({
			startDate: '2026-09-08',
			weekdays: [2, 4],
			weeks: 5,
			skipDates: ['2026-09-24']
		});

		expect(trimmed).toHaveLength(full.length - 1);
		expect(trimmed.map((s) => s.date)).not.toContain('2026-09-24');
		// The end date is unchanged: a cancelled session shortens the course, it
		// does not push it into a sixth week.
		expect(trimmed.at(-1)?.date).toBe(full.at(-1)?.date);
	});

	it('starts on the start date when it already matches a weekday', () => {
		const sessions = generateSessions({ startDate: '2026-09-07', weekdays: [1], weeks: 2 });

		expect(sessions.map((s) => s.date)).toEqual(['2026-09-07', '2026-09-14']);
	});

	it('returns nothing for a series with no weekdays or no weeks', () => {
		expect(generateSessions({ startDate: '2026-09-08', weekdays: [], weeks: 5 })).toEqual([]);
		expect(generateSessions({ startDate: '2026-09-08', weekdays: [2], weeks: 0 })).toEqual([]);
	});
});

describe('series window', () => {
	it('spans the first to the last session', () => {
		const sessions = generateSessions({ startDate: '2026-09-08', weekdays: [2, 4], weeks: 5 });

		expect(seriesWindow(sessions)).toEqual({ from: '2026-09-08', until: '2026-10-08' });
	});

	it('is independent of the order the sessions are stored in', () => {
		const sessions = [{ date: '2026-10-08' }, { date: '2026-09-08' }, { date: '2026-09-15' }];

		expect(seriesWindow(sessions)).toEqual({ from: '2026-09-08', until: '2026-10-08' });
	});

	it('is empty for a series with no sessions left', () => {
		expect(seriesWindow([])).toEqual({ from: null, until: null });
	});
});

describe('recurring class', () => {
	it('finds the next matching weekday', () => {
		// From a Tuesday, the next Wednesday class is the day after.
		expect(nextOccurrence({ weekday: 3 }, '2026-09-08')).toBe('2026-09-09');
	});

	it('returns the same day when the class runs today', () => {
		expect(nextOccurrence({ weekday: 2 }, '2026-09-08')).toBe('2026-09-08');
	});

	it('waits for the offer to open', () => {
		expect(nextOccurrence({ weekday: 3, validFrom: '2026-10-01' }, '2026-09-08')).toBe(
			'2026-10-07'
		);
	});

	it('reports nothing once the offer has ended', () => {
		expect(nextOccurrence({ weekday: 3, validUntil: '2026-09-01' }, '2026-09-08')).toBeNull();
	});
});
