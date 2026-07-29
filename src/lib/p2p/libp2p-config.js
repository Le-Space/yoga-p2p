// libp2p node configuration — relay-free by construction.
//
// One transport only: @le-space/libp2p-webrtc-qr. There is no WebSocket, no
// circuit relay, no bootstrap list and no peer discovery, because there is no
// server to discover anyone from. A connection exists only after a human
// carried a signed SDP payload from one device to the other (CLAUDE.md).
//
// Gossipsub is the one service that looks like infrastructure and is not:
// OrbitDB's replication needs a pubsub instance to exchange log heads, and it
// runs entirely inside the direct WebRTC connection the QR handshake built.

import { gossipsub } from '@libp2p/gossipsub';
import { identify, identifyPush } from '@libp2p/identify';
import { webRTCQR } from '@le-space/libp2p-webrtc-qr';

/**
 * ICE servers used while gathering candidates.
 *
 * STUN only ever tells a device its own public address; no user data and no
 * signalling passes through it, so it does not make the app server-dependent.
 * It is still a third-party lookup — see docs/LIMITS.md — hence configurable,
 * and switched off entirely with `?ice=host` (LAN and CI, where host
 * candidates are deterministic).
 *
 * @returns {RTCConfiguration}
 */
export function rtcConfiguration() {
	if (iceMode() === 'host') return { iceServers: [] };

	const configured = import.meta.env?.VITE_STUN_SERVERS;
	const urls = (configured || 'stun:stun.l.google.com:19302,stun:stun.cloudflare.com:3478')
		.split(',')
		.map((/** @type {string} */ url) => url.trim())
		.filter(Boolean);

	return { iceServers: [{ urls }] };
}

const ICE_MODE_KEY = 'yoga-p2p.iceMode';

/**
 * The ICE mode, remembered for the session.
 *
 * `?ice=host` is a property of *this session*, not of the page it was typed on:
 * the app routes client-side, so requiring the parameter on every URL would
 * mean a single in-app navigation silently switches STUN back on. Reading it
 * once and remembering it keeps the choice where the user made it.
 *
 * @returns {string | null}
 */
function iceMode() {
	if (typeof location === 'undefined') return null;

	const fromUrl = new URLSearchParams(location.search).get('ice');

	try {
		if (fromUrl) {
			sessionStorage.setItem(ICE_MODE_KEY, fromUrl);
			return fromUrl;
		}
		return sessionStorage.getItem(ICE_MODE_KEY);
	} catch {
		// Storage blocked — fall back to whatever this URL says.
		return fromUrl;
	}
}

/**
 * @param {object} [options]
 * @param {(remotePeerId: string) => unknown} [options.getOutboundSession]
 *   Returns the upgrade context for a peer whose answer was already verified.
 * @returns {any} a libp2p init object
 */
export function createLibp2pConfig({ getOutboundSession = () => null } = {}) {
	return {
		// No listen addresses: this node is never dialable out of the blue. A
		// session is always built by the application first, then dialed.
		addresses: { listen: [] },
		transports: [webRTCQR({ getOutboundSession })],
		connectionGater: {
			// Belt and braces against a future transport sneaking in: the QR
			// transport only ever produces /webrtc/p2p/<peer> addresses.
			denyDialMultiaddr: (/** @type {{ toString: () => string }} */ addr) =>
				!String(addr).includes('/webrtc/p2p/')
		},
		services: {
			identify: identify(),
			identifyPush: identifyPush(),
			pubsub: gossipsub({
				emitSelf: false,
				allowPublishToZeroTopicPeers: true,
				// A QR session is a single direct connection; without this,
				// gossipsub would refuse to graft its mesh onto it.
				runOnLimitedConnection: true
			})
		}
	};
}
