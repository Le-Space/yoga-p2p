// The QR handshake: build a WebRTC session out of band, then hand it to
// libp2p as a finished connection.
//
// Shape of the exchange — the same three steps whether the payload travels as
// a scanned QR code, a pasted string or a shared message:
//
//   A: createOffer()      → offer payload   ──(QR / paste / share)──▶ B
//   B: acceptOffer(text)  → answer payload  ◀──(QR / paste / share)── A
//   A: acceptAnswer(text) → connection open
//
// Adapted from the helia-file-transfer example in NiKrause/libp2p-webrtc-qr.
// Kept free of Svelte and OrbitDB so the flow can be unit tested and so the
// stores in ./node.js stay a thin layer on top.

import { peerIdFromString } from '@libp2p/peer-id';
import { multiaddr } from '@multiformats/multiaddr';
import {
	createWebRTCUpgradeContext,
	decodeSignedPayload,
	encodeSignedPayload,
	parsePayload,
	PAYLOAD_VERSION,
	QR_TYPE_ANSWER,
	QR_TYPE_OFFER
} from '@le-space/libp2p-webrtc-qr';

import { rtcConfiguration } from './libp2p-config.js';

const ICE_GATHERING_TIMEOUT_MS = 15_000;

// How long a connection may take to come up. Generous on purpose: a mobile
// network behind carrier NAT can need minutes of ICE before it succeeds, and
// the old 30 s cut those off mid-setup — which at a counter looks like "it just
// does not work here". Nothing is lost by waiting, because a connection that
// genuinely fails does not wait for this: waitForConnected rejects on the
// 'failed' and 'closed' events as soon as they arrive.
const CONNECTION_TIMEOUT_MS = 360_000;

// The libp2p upgrade and dial happen *after* the WebRTC connection is already
// up, so they are local work and must stay short. The dial in particular runs
// inside a retry loop: a long signal here would let one hung attempt eat the
// whole budget and turn DIAL_ATTEMPTS retries into a single one.
const UPGRADE_TIMEOUT_MS = 30_000;
/** How long the answering side keeps retrying while the offerer attaches its muxer. */
const DIAL_ATTEMPTS = 15;
const DIAL_RETRY_MS = 300;

/**
 * @typedef {object} OfferSession
 * @property {string} sessionId
 * @property {RTCPeerConnection} peerConnection
 * @property {RTCDataChannel} initDataChannel
 * @property {string | null} remotePeerId
 * @property {unknown} upgradeContext
 */

/**
 * Everything one device needs to run handshakes. One per libp2p node.
 *
 * @param {any} node a started libp2p node
 */
export function createSignalling(node) {
	/**
	 * Offers this device has made, keyed by session id.
	 *
	 * A map rather than one slot, and that was a real defect: with a single slot,
	 * making a second offer closed the first connection. A front desk pairing
	 * with one student after another silently dropped the previous one — and a
	 * studio device that had just approved another device lost the connection
	 * before the approval could replicate. Found by the courier roundtrip, which
	 * is the first scenario that holds three devices at once.
	 *
	 * @type {Map<string, OfferSession>}
	 */
	const offerSessions = new Map();

	/** @type {Set<RTCPeerConnection>} */
	const inboundConnections = new Set();

	/** The transport asks this for a verified session when a dial comes in. */
	function getOutboundSession(/** @type {string} */ remotePeerId) {
		for (const session of offerSessions.values()) {
			if (session.remotePeerId === remotePeerId) return session.upgradeContext;
		}
		return null;
	}

	/**
	 * Forget sessions whose connection is gone.
	 *
	 * Without this the map would grow for the lifetime of the page. A closed
	 * connection is also the one case where reusing a session id would be wrong.
	 */
	function pruneClosedSessions() {
		for (const [id, session] of offerSessions) {
			const state = session.peerConnection.connectionState;
			if (state === 'closed' || state === 'failed') offerSessions.delete(id);
		}
	}

	/**
	 * Step 1 (offering device): produce a signed offer to be carried to the
	 * other device.
	 *
	 * Adds a session rather than replacing one: earlier connections stay open, so
	 * a front desk can pair with one student after another without dropping
	 * anybody. Only sessions whose connection has already died are cleared out.
	 *
	 * @returns {Promise<string>} the payload to render as QR, copy or share
	 */
	async function createOffer() {
		pruneClosedSessions();

		const peerConnection = new RTCPeerConnection(rtcConfiguration());
		const sessionId = crypto.randomUUID();
		// Negotiated, so the remote muxer never mistakes this channel for a stream.
		const initDataChannel = peerConnection.createDataChannel('init', {
			negotiated: true,
			id: 1023
		});

		await peerConnection.setLocalDescription(await peerConnection.createOffer());
		await waitForIceGathering(peerConnection);

		offerSessions.set(sessionId, {
			sessionId,
			peerConnection,
			initDataChannel,
			remotePeerId: null,
			upgradeContext: null
		});

		return encodeSignedPayload(node.components.privateKey, {
			version: PAYLOAD_VERSION,
			type: QR_TYPE_OFFER,
			sessionId,
			peerId: node.peerId.toString(),
			sdp: peerConnection.localDescription?.sdp
		});
	}

	/**
	 * Step 2 (answering device): verify a scanned or pasted offer and answer it.
	 * The signature check happens inside decodeSignedPayload — an offer whose
	 * signature does not match the peer id it claims never gets this far.
	 *
	 * @param {string} text
	 * @returns {Promise<{ answer: string, remotePeerId: string, connected: Promise<any> }>}
	 *   the payload to carry back, plus a promise that settles when the inbound
	 *   upgrade finishes — the answer is ready long before the link is up.
	 */
	async function acceptOffer(text) {
		const offer = await decodeSignedPayload(text, QR_TYPE_OFFER);

		if (offer.peerId === node.peerId.toString()) {
			throw new Error('This code was created by this device. Scan the other device.');
		}

		const peerConnection = new RTCPeerConnection(rtcConfiguration());
		const addr = multiaddr(`/webrtc/p2p/${offer.peerId}`);
		const upgradeContext = createWebRTCUpgradeContext(node.components, peerConnection, addr, {
			direction: 'inbound'
		});

		inboundConnections.add(peerConnection);

		await peerConnection.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
		await peerConnection.setLocalDescription(await peerConnection.createAnswer());
		await waitForIceGathering(peerConnection);

		// The offering peer only attaches its muxer once it has read this answer,
		// so the upgrade has to wait for the connection to actually come up.
		const upgraded = waitForConnected(peerConnection)
			.then(() =>
				node.components.upgrader.upgradeInbound(upgradeContext.connection, {
					skipEncryption: true,
					skipProtection: true,
					remotePeer: peerIdFromString(offer.peerId),
					muxerFactory: upgradeContext.muxerFactory,
					signal: AbortSignal.timeout(UPGRADE_TIMEOUT_MS)
				})
			)
			.catch((/** @type {Error} */ error) => {
				inboundConnections.delete(peerConnection);
				peerConnection.close();
				throw error;
			});

		const answer = await encodeSignedPayload(node.components.privateKey, {
			version: PAYLOAD_VERSION,
			type: QR_TYPE_ANSWER,
			sessionId: offer.sessionId,
			peerId: node.peerId.toString(),
			offerPeerId: offer.peerId,
			sdp: peerConnection.localDescription?.sdp
		});

		return { answer, remotePeerId: offer.peerId, connected: upgraded };
	}

	/**
	 * Step 3 (offering device): verify the answer and open the connection.
	 *
	 * @param {string} text
	 * @returns {Promise<string>} the remote peer id
	 */
	async function acceptAnswer(text) {
		const answer = await decodeSignedPayload(text, QR_TYPE_ANSWER);

		// Matched by session id rather than against "the" current offer, so a
		// reply that arrives after another offer was made still finds its session.
		const offerSession = offerSessions.get(answer.sessionId);
		if (!offerSession) {
			throw new Error('This reply belongs to a different connection attempt.');
		}
		if (answer.offerPeerId !== node.peerId.toString()) {
			throw new Error('This reply was created for another device.');
		}

		await offerSession.peerConnection.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
		await waitForConnected(offerSession.peerConnection);
		offerSession.initDataChannel.close();

		const addr = multiaddr(`/webrtc/p2p/${answer.peerId}`);
		offerSession.remotePeerId = answer.peerId;
		offerSession.upgradeContext = createWebRTCUpgradeContext(
			node.components,
			offerSession.peerConnection,
			addr,
			{ direction: 'outbound' }
		);

		// Dialing is what triggers the transport's upgrade. The answering side may
		// still be attaching its muxer, so retry rather than fail on the first try.
		let lastError = new Error('The other device never accepted the connection.');

		for (let attempt = 0; attempt < DIAL_ATTEMPTS; attempt++) {
			try {
				const connection = await node.dial(addr, {
					signal: AbortSignal.timeout(UPGRADE_TIMEOUT_MS)
				});
				await delay(200);
				if (connection.status === 'open') return answer.peerId;
				lastError = new Error(`The connection closed again right after opening.`);
			} catch (/** @type {any} */ error) {
				lastError = error;
			}
			await delay(DIAL_RETRY_MS);
		}

		throw lastError;
	}

	/**
	 * Route a payload without trusting it: parsePayload only reads the envelope,
	 * the signature is verified by the accept* function that handles it.
	 *
	 * @param {string} text
	 * @returns {Promise<'offer' | 'answer'>}
	 */
	async function classify(text) {
		const parsed = await parsePayload(text);
		return parsed.type === QR_TYPE_OFFER ? 'offer' : 'answer';
	}

	function close() {
		for (const session of offerSessions.values()) session.peerConnection.close();
		offerSessions.clear();
		for (const connection of inboundConnections) connection.close();
		inboundConnections.clear();
	}

	return { createOffer, acceptOffer, acceptAnswer, classify, close, getOutboundSession };
}

/** @param {number} ms */
function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait until ICE has gathered everything it is going to gather.
 *
 * The timeout resolves rather than rejects on purpose: a partially gathered
 * candidate set still connects on a LAN, which is the main path at a studio.
 *
 * @param {RTCPeerConnection} peerConnection
 */
function waitForIceGathering(peerConnection) {
	if (peerConnection.iceGatheringState === 'complete') return Promise.resolve();

	return new Promise((resolve) => {
		const timeout = setTimeout(done, ICE_GATHERING_TIMEOUT_MS);

		function done() {
			clearTimeout(timeout);
			peerConnection.removeEventListener('icegatheringstatechange', onChange);
			resolve(undefined);
		}

		function onChange() {
			if (peerConnection.iceGatheringState === 'complete') done();
		}

		peerConnection.addEventListener('icegatheringstatechange', onChange);
	});
}

/**
 * Resolve when the connection is up; reject as soon as it is known to be dead.
 *
 * Exported for its test rather than for callers: CONNECTION_TIMEOUT_MS is six
 * minutes, which is only defensible because a real failure rejects here on the
 * event and never reaches the timeout. If that regressed, a counter would sit
 * and wait six minutes on a connection that was already gone.
 *
 * @param {RTCPeerConnection} peerConnection
 */
export function waitForConnected(peerConnection) {
	if (peerConnection.connectionState === 'connected') return Promise.resolve();

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error('The connection timed out.'));
		}, CONNECTION_TIMEOUT_MS);

		function cleanup() {
			clearTimeout(timeout);
			peerConnection.removeEventListener('connectionstatechange', onChange);
		}

		function onChange() {
			if (peerConnection.connectionState === 'connected') {
				cleanup();
				resolve(undefined);
			} else if (['failed', 'closed'].includes(peerConnection.connectionState)) {
				cleanup();
				reject(new Error(`The connection is ${peerConnection.connectionState}.`));
			}
		}

		peerConnection.addEventListener('connectionstatechange', onChange);
	});
}
