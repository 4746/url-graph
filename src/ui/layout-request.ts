import type { NodeSizeMode } from '../graph/options';
import type { Core } from 'cytoscape';
import { adaptiveSpacing } from '../graph/layout-geometry';
import type { LayoutRequest } from '../workers/types';

export function createLayoutRequest(cy: Core, spacing: number, includeLabels: boolean, sizeMode: NodeSizeMode = 'uniform'): LayoutRequest {
	return {
		groupBySize: sizeMode !== 'uniform',
		nodes: cy.nodes().map((node) => {
			const position = node.position();
			const box = node.boundingBox({ includeLabels, includeOverlays: false });
			return { id: node.id(), ...position,
				rank: sizeMode === 'uniform' ? 0 : Number(node.data(sizeMode === 'incoming' ? 'incomingCount' : 'outgoingCount')) || 0,
				width: Math.max(22, 2 * Math.max(position.x - box.x1, box.x2 - position.x)),
				height: Math.max(22, 2 * Math.max(position.y - box.y1, box.y2 - position.y)),
			};
		}),
		edges: cy.edges().map((edge) => ({ id: edge.id(), source: edge.source().id(), target: edge.target().id() })),
		spacing: adaptiveSpacing(spacing, cy.nodes().length, cy.edges().length),
	};
}
