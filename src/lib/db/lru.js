// How many student databases a studio device keeps open (docs/PLAN.md §6.4).
//
// Not an optimisation. A studio device holds two databases per student — a ledger
// and a bookings log — so a thousand students is two thousand OrbitDB instances,
// each with its own pubsub subscription and heads handler. At 50–200 ms to open
// one, "open them all" is not slow, it is impossible. §6.4 calls lazy-open plus an
// LRU a precondition, and this is that LRU.
//
// The policy is small enough to be worth stating exactly, because getting it wrong
// is silent: it closes the *least recently used* database, and the student standing
// at the counter is by definition the most recently used one. The counter can never
// evict the person it is serving.
//
// Kept free of OrbitDB so the policy can be tested without opening anything.

/**
 * A bounded set of open things, closing the coldest when it overflows.
 *
 * @template T
 */
export class OpenSet {
	/**
	 * @param {number} limit
	 * @param {(key: string, value: T) => Promise<void> | void} close
	 */
	constructor(limit, close) {
		if (limit < 1) throw new Error('An open set with no room cannot hold the current student.');
		this.limit = limit;
		this.close = close;
		/** @type {Map<string, T>} Map preserves insertion order, which is the LRU order. */
		this.entries = new Map();
	}

	get size() {
		return this.entries.size;
	}

	/** @param {string} key */
	has(key) {
		return this.entries.has(key);
	}

	/**
	 * Fetch and mark as most recently used.
	 *
	 * The re-insertion is the whole mechanism: deleting and setting moves the key to
	 * the end of the iteration order, so the front of the map is always the coldest.
	 *
	 * @param {string} key
	 */
	touch(key) {
		if (!this.entries.has(key)) return undefined;
		const value = this.entries.get(key);
		this.entries.delete(key);
		this.entries.set(key, /** @type {T} */ (value));
		return value;
	}

	/**
	 * Add something, evicting the coldest entries until the set fits.
	 *
	 * @param {string} key
	 * @param {T} value
	 * @returns {Promise<string[]>} what was evicted, for the caller to report
	 */
	async add(key, value) {
		this.entries.delete(key);
		this.entries.set(key, value);

		/** @type {string[]} */
		const evicted = [];

		while (this.entries.size > this.limit) {
			const [coldestKey, coldestValue] = /** @type {[string, T]} */ (
				this.entries.entries().next().value
			);
			this.entries.delete(coldestKey);
			evicted.push(coldestKey);
			// A failure to close is not a reason to keep the handle in the set: it is
			// already out of the app's reach, and holding it would grow the set past
			// its limit for good. `Promise.resolve(fn())` alone would not do — a
			// *synchronous* throw escapes before there is a promise to catch it on,
			// which a test found before this comment existed.
			await this.#closeQuietly(coldestKey, coldestValue);
		}

		return evicted;
	}

	/** @param {string} key */
	async drop(key) {
		const value = this.entries.get(key);
		if (value === undefined) return false;
		this.entries.delete(key);
		await this.#closeQuietly(key, value);
		return true;
	}

	async clear() {
		const all = [...this.entries.entries()];
		this.entries.clear();
		for (const [key, value] of all) {
			await this.#closeQuietly(key, value);
		}
	}

	/**
	 * @param {string} key
	 * @param {T} value
	 */
	async #closeQuietly(key, value) {
		try {
			await this.close(key, value);
		} catch {
			// Already out of reach; see add().
		}
	}

	/** Coldest first — the order things will be evicted in. */
	keys() {
		return [...this.entries.keys()];
	}
}
