import { describe, expect, it, vi } from 'vitest';

import { OpenSet } from './lru.js';

describe('OpenSet', () => {
	it('keeps everything while there is room', async () => {
		const close = vi.fn();
		const set = new OpenSet<string>(3, close);

		await set.add('a', 'A');
		await set.add('b', 'B');

		expect(set.size).toBe(2);
		expect(close).not.toHaveBeenCalled();
	});

	it('closes the coldest when it overflows', async () => {
		const closed: string[] = [];
		const set = new OpenSet<string>(2, (key) => {
			closed.push(key);
		});

		await set.add('a', 'A');
		await set.add('b', 'B');
		const evicted = await set.add('c', 'C');

		expect(evicted).toEqual(['a']);
		expect(closed).toEqual(['a']);
		expect(set.keys()).toEqual(['b', 'c']);
	});

	it('never evicts the student being served', async () => {
		// The whole point of the policy: whoever is at the counter was just touched,
		// so they are the newest entry and cannot be the one that gets closed.
		const closed: string[] = [];
		const set = new OpenSet<string>(2, (key) => {
			closed.push(key);
		});

		await set.add('alice', 'A');
		await set.add('bob', 'B');
		set.touch('alice');
		await set.add('carol', 'C');

		expect(closed).toEqual(['bob']);
		expect(set.has('alice')).toBe(true);
	});

	it('re-adding an open database does not grow the set', async () => {
		const close = vi.fn();
		const set = new OpenSet<string>(2, close);

		await set.add('a', 'A');
		await set.add('a', 'A again');
		await set.add('b', 'B');

		expect(set.size).toBe(2);
		expect(close).not.toHaveBeenCalled();
	});

	it('evicts as many as it takes to fit', async () => {
		const closed: string[] = [];
		const set = new OpenSet<string>(3, (key) => {
			closed.push(key);
		});

		await set.add('a', 'A');
		await set.add('b', 'B');
		await set.add('c', 'C');
		set.limit = 1;
		await set.add('d', 'D');

		expect(closed).toEqual(['a', 'b', 'c']);
		expect(set.keys()).toEqual(['d']);
	});

	it('drops a handle even when closing it fails', async () => {
		// A close that throws still means the app has let go. Keeping the entry would
		// push the set past its limit permanently, which is the failure this bound
		// exists to prevent.
		const set = new OpenSet<string>(1, () => {
			throw new Error('storage already gone');
		});

		await set.add('a', 'A');
		await expect(set.add('b', 'B')).resolves.toEqual(['a']);
		expect(set.keys()).toEqual(['b']);
	});

	it('refuses a limit that cannot hold the current student', () => {
		expect(() => new OpenSet<string>(0, () => {})).toThrow();
	});
});
