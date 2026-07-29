// The Devanagari OM sign (U+0950), as an outline path.
//
// Extracted once from **Noto Sans Devanagari** (SIL Open Font License 1.1,
// github.com/google/fonts → ofl/notosansdevanagari) with opentype.js. Embedded
// as a path rather than rendered as text on purpose: a <text> element would
// depend on a Devanagari font being installed, which fails on most Windows and
// Android devices — the mark would silently render as a box.
//
// Neither the font file nor opentype.js is a dependency of this repository;
// this constant is the whole result of that extraction.
//
// Coordinate space: 1000 units/em, y-up flipped to SVG's y-down, so the glyph
// sits at y = -842 … -62 with the baseline at y = 0.
export const OM_GLYPH = {
	path: 'M333-346L364-394Q390-366 407.50-355Q425-344 446-344Q466-344 482.50-355.50Q499-367 516-396L544-443Q577-498 615.50-522.50Q654-547 713-547Q759-547 793.50-526Q828-505 848-463Q868-421 868-358Q868-298 847.50-255Q827-212 789.50-189Q752-166 699-166Q650-166 613.50-183.50Q577-201 548-229L595-285Q617-264 641-250.50Q665-237 696-237Q731-237 759.50-266Q788-295 788-359Q788-413 768-444.50Q748-476 707-476Q675-476 653-459Q631-442 608-401L583-357Q562-320 533-297Q504-274 457-274Q426-274 403.50-283Q381-292 364.50-308Q348-324 333-346M299-632Q356-632 391.50-612Q427-592 443-559.50Q459-527 459-488Q459-418 407.50-374Q356-330 237-320L221-391Q284-399 318-411.50Q352-424 365.50-443Q379-462 379-489Q379-522 358-541.50Q337-561 296-561Q262-561 229.50-551Q197-541 165-521L139-591Q174-611 213.50-621.50Q253-632 299-632M475-216Q475-167 453-132.50Q431-98 392.50-80Q354-62 305-62Q245-62 197.50-88.50Q150-115 109-176.50Q68-238 29-344L100-373Q141-256 187-195.50Q233-135 298-135Q342-135 369-158.50Q396-182 396-225Q396-269 364-301.50Q332-334 293-356L337-369L362-378Q376-367 393-351Q410-335 420-320L441-301Q458-282 466.50-260.50Q475-239 475-216M545-793Q545-814 559.50-828Q574-842 594-842Q614-842 628.50-828Q643-814 643-793Q643-772 628.50-757.50Q614-743 594-743Q574-743 559.50-757.50Q545-772 545-793M713-816L782-794Q764-700 715.50-662Q667-624 594-624Q521-624 472.50-662Q424-700 406-794L475-816Q486-743 516.50-715.50Q547-688 594-688Q641-688 672-715.50Q703-743 713-816',
	// Bounding box of the path above, used to centre it without re-measuring.
	bbox: { x1: 29, y1: -842, x2: 868, y2: -62 }
};

/**
 * Transform that places the glyph centred on (cx, cy) at a given height.
 *
 * @param {number} cx
 * @param {number} cy
 * @param {number} height
 * @returns {string} an SVG transform attribute value
 */
export function omTransform(cx, cy, height) {
	const { x1, y1, x2, y2 } = OM_GLYPH.bbox;
	const scale = height / (y2 - y1);
	const tx = cx - ((x1 + x2) / 2) * scale;
	const ty = cy - ((y1 + y2) / 2) * scale;
	return `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(5)})`;
}
