import { sizeGroupedNodes } from '../graph/size-layout';
import cytoscape from 'cytoscape';
import type { LayoutRequest, LayoutResult } from './types';
import { separateOverlaps } from '../graph/layout-geometry';

const scope = self as unknown as {
	onmessage: (event: MessageEvent<LayoutRequest>) => void;
	postMessage: (message: LayoutResult) => void;
};

scope.onmessage = ({ data }) => {
	if (data.groupBySize) {
		scope.postMessage({ positions: separateOverlaps(sizeGroupedNodes(data.nodes, data.spacing), data.spacing) });
		return;
	}
	const cy = cytoscape({ headless: true, styleEnabled: true, layout: { name: 'preset' },
		style: [{ selector: 'node', style: { width: 'data(layoutWidth)', height: 'data(layoutHeight)' } }],
		elements: [
			...data.nodes.map(({ id, x, y, width, height }) => ({ data: { id, layoutWidth: width ?? 22, layoutHeight: height ?? 22 }, position: { x, y } })),
			...data.edges.map((edge) => ({ data: edge })),
		],
	});
	try {
		const spacing = data.spacing;
		cy.layout({ name: 'cose', animate: false, fit: false, randomize: false,
			nodeRepulsion: () => 12000 * (spacing / 110) ** 2, idealEdgeLength: () => spacing, componentSpacing: spacing * 1.4,
		}).run();
		const sizes = new Map(data.nodes.map((node) => [node.id, node]));
		const nodes = cy.nodes().map((node) => ({ ...sizes.get(node.id())!, ...node.position() }));
		scope.postMessage({ positions: separateOverlaps(nodes, spacing) });
	} finally { cy.destroy(); }
};
