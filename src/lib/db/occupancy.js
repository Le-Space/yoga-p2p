// Occupancy — how many places are taken, without saying by whom
// (docs/PLAN.md §3.3.1).
//
// This is what the per-student cut costs and how it is paid back. With one
// bookings database per student, a student device can no longer count a class
// itself: it holds exactly one booking record, its own. So studio devices —
// which do see all of them — publish the *number* into the programme database
// that everyone replicates anyway.
//
// Numbers only. "Four places left" is not personal data; "who the other eight
// are" is exactly what the cut was made to stop distributing.
//
// The counter is an advisory display value, never the decision. Two students
// asking for the last place both get `requested`, and a studio device decides
// — the same way it works in a studio without a server.

import { get } from 'svelte/store';

import { coursesStore, occupancyStore, programDbStore, refreshProgram } from './program.js';
import { studentBookingsStore } from './bookings.js';

/** A series booked as a whole has no date; this stands in for one in the id. */
const WHOLE_SERIES = 'series';

/**
 * @param {string} courseId
 * @param {string | null} date
 */
export function occupancyId(courseId, date) {
	return `occupancy:${courseId}:${date ?? WHOLE_SERIES}`;
}

/**
 * Count confirmed places for one course and date across every student this
 * device knows.
 *
 * @param {string} courseId
 * @param {string | null} date
 * @returns {number}
 */
export function countConfirmed(courseId, date) {
	let confirmed = 0;

	for (const student of get(studentBookingsStore).values()) {
		for (const booking of student.bookings) {
			if (booking.courseId !== courseId) continue;
			if ((booking.date ?? null) !== (date ?? null)) continue;
			if (booking.status !== 'confirmed') continue;
			confirmed += 1;
		}
	}

	return confirmed;
}

/**
 * Publish the count for one course and date.
 *
 * Written by studio devices only — the programme's access controller refuses
 * anyone else, and a student has nothing to count anyway.
 *
 * @param {object} slot
 * @param {string} slot.courseId
 * @param {string | null} slot.date
 * @param {number} slot.capacity
 * @param {string} slot.deviceDid
 */
export async function publishOccupancy({ courseId, date, capacity, deviceDid }) {
	const db = get(programDbStore);
	if (!db) return;

	await db.put({
		_id: occupancyId(courseId, date),
		type: 'occupancy',
		courseId,
		date,
		confirmed: countConfirmed(courseId, date),
		capacity,
		updatedBy: { deviceDid },
		updatedAt: new Date().toISOString()
	});

	await refreshProgram();
}

/**
 * Whether one more place can be confirmed.
 *
 * Checked at confirmation, not at request: a request is a wish, and the studio
 * is the only party that can see the whole picture. Refusing earlier would
 * pretend to a certainty the requesting device does not have.
 *
 * @param {object} slot
 * @param {string} slot.courseId
 * @param {string | null} slot.date
 * @param {number} slot.capacity
 */
export function hasFreePlace({ courseId, date, capacity }) {
	if (!Number.isFinite(capacity) || capacity <= 0) return true;
	return countConfirmed(courseId, date) < capacity;
}

/**
 * The published count for a slot, as a student's device sees it.
 *
 * @param {any[]} programDocuments
 * @param {string} courseId
 * @param {string | null} date
 * @returns {{ confirmed: number, capacity: number } | null}
 */
export function readOccupancy(programDocuments, courseId, date) {
	const found = programDocuments.find((doc) => doc._id === occupancyId(courseId, date));
	if (!found) return null;

	return { confirmed: found.confirmed ?? 0, capacity: found.capacity ?? 0 };
}

/**
 * Bring every published count in line with what this device can see.
 *
 * Writes only where the number actually changed. Republishing an unchanged
 * count would append an entry to an append-only log for nothing, and the
 * programme is replicated by every device in the studio.
 *
 * @param {string} deviceDid the device doing the publishing
 * @returns {Promise<number>} how many slots were updated
 */
export async function syncOccupancy(deviceDid) {
	const db = get(programDbStore);
	if (!db) return 0;

	const courses = new Map(get(coursesStore).map((course) => [course._id, course]));
	const published = get(occupancyStore);

	/** @type {Map<string, { courseId: string, date: string | null }>} */
	const slots = new Map();

	for (const student of get(studentBookingsStore).values()) {
		for (const booking of student.bookings) {
			const date = booking.date ?? null;
			slots.set(occupancyId(booking.courseId, date), { courseId: booking.courseId, date });
		}
	}

	let written = 0;

	for (const [id, slot] of slots) {
		const course = courses.get(slot.courseId);
		if (!course) continue;

		const confirmed = countConfirmed(slot.courseId, slot.date);
		const current = published.find((doc) => doc._id === id);
		if (current?.confirmed === confirmed && current?.capacity === course.capacity) continue;

		await publishOccupancy({
			courseId: slot.courseId,
			date: slot.date,
			capacity: course.capacity,
			deviceDid
		});
		written += 1;
	}

	return written;
}
