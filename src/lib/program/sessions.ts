// Session generator for closed course series (docs/PLAN.md §3.2).
//
// A series stores its **concrete dates**, not a pattern. The generator only
// produces a proposal: the owner then strikes holidays and moves single dates,
// and what she leaves is what the course is. That is why this file returns
// plain dates and never owns them.
//
// Pure and UI-free for the same reason as the ledger: date arithmetic across
// month and year boundaries is exactly the kind of thing that should be proven
// in a unit test rather than clicked through.

/** A calendar day, `YYYY-MM-DD`. */
export type IsoDate = string;

/** 0 = Sunday … 6 = Saturday, matching `Date.prototype.getUTCDay()`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface SeriesSession {
	date: IsoDate;
}

export interface GenerateOptions {
	/** First day the series may start on. */
	startDate: IsoDate;
	/** Which weekdays the course runs on, e.g. `[1, 3]` for Monday and Wednesday. */
	weekdays: Weekday[];
	/** How many calendar weeks the series spans. */
	weeks: number;
	/** Dates to leave out — holidays, closures. */
	skipDates?: IsoDate[];
}

/** Add whole days to a `YYYY-MM-DD` date, in UTC. */
export function addDays(date: IsoDate, days: number): IsoDate {
	const parsed = new Date(`${date}T00:00:00.000Z`);
	parsed.setUTCDate(parsed.getUTCDate() + days);
	return parsed.toISOString().slice(0, 10);
}

/** The weekday of a `YYYY-MM-DD` date, in UTC. */
export function weekdayOf(date: IsoDate): Weekday {
	return new Date(`${date}T00:00:00.000Z`).getUTCDay() as Weekday;
}

/**
 * Propose the dates of a series.
 *
 * The generated **count** is `weekdays.length × weeks` — "twice a week for five
 * weeks" is ten sessions, whichever weekday the start date happens to fall on.
 * Count is what a series promises: it is the basis of the series price, and
 * health-insurance prevention courses are reimbursed against a fixed number of
 * sessions. A rolling date window would quietly deliver nine or eleven
 * depending on the start day.
 *
 * A skipped date is then dropped and **not** replaced. Cancelling a session for
 * a public holiday shortens the course; silently appending a replacement would
 * extend it into a week the owner never agreed to. The owner sees the shortened
 * list and decides — add a date back, or leave it.
 */
export function generateSessions({
	startDate,
	weekdays,
	weeks,
	skipDates = []
}: GenerateOptions): SeriesSession[] {
	if (weeks < 1 || weekdays.length === 0) return [];

	const wanted = new Set(weekdays);
	const target = weekdays.length * weeks;
	const dates: IsoDate[] = [];

	// The first match can be up to six days out, so the walk needs one week of
	// slack beyond the span itself. The bound is a backstop, not the rule —
	// `target` is what ends the loop.
	const limit = weeks * 7 + 7;

	let cursor = startDate;
	for (let day = 0; day < limit && dates.length < target; day++) {
		if (wanted.has(weekdayOf(cursor))) dates.push(cursor);
		cursor = addDays(cursor, 1);
	}

	const skip = new Set(skipDates);
	return dates.filter((date) => !skip.has(date)).map((date) => ({ date }));
}

/**
 * The validity window a series ticket inherits: first to last session
 * (docs/PLAN.md §3.2). Derived rather than stored, so striking the last
 * session also shortens the ticket.
 */
export function seriesWindow(sessions: SeriesSession[]): {
	from: IsoDate | null;
	until: IsoDate | null;
} {
	if (sessions.length === 0) return { from: null, until: null };

	const sorted = sessions.map((session) => session.date).sort();
	return { from: sorted[0], until: sorted[sorted.length - 1] };
}

/**
 * Next occurrence of a recurring class on or after `from`, respecting the
 * offer's own window. Returns null when the offer has ended.
 */
export function nextOccurrence(
	course: { weekday: Weekday; validFrom?: IsoDate | null; validUntil?: IsoDate | null },
	from: IsoDate
): IsoDate | null {
	const start = course.validFrom && course.validFrom > from ? course.validFrom : from;

	for (let day = 0; day < 7; day++) {
		const date = addDays(start, day);
		if (weekdayOf(date) !== course.weekday) continue;
		if (course.validUntil && date > course.validUntil) return null;
		return date;
	}

	return null;
}
