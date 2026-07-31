/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
export default {
	handbook: [
		'index',
		{
			type: 'category',
			label: 'Studio',
			collapsed: false,
			items: [
				'studio/setup',
				'studio/devices',
				'studio/programme',
				'studio/till',
				'studio/checkin',
				'studio/reconcile'
			]
		},
		{
			type: 'category',
			label: 'Schüler',
			collapsed: false,
			items: ['student/start', 'student/booking', 'student/passes']
		},
		'connecting',
		'what-it-cannot-do',
		'privacy',
		'roadmap'
	]
};
