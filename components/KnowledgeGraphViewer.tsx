
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { KnowledgeGraph, GraphNode, GraphEdge, NodeType } from '../types';

// --- Constants ---
const NODE_COLORS: Record<string, string> = {
  architecture: '#3b82f6', // blue-500
  value: '#a855f7',        // purple-600
  concept: '#22d3ee',      // cyan-500
  goal: '#22c55e',         // green-500
  directive: '#f59e0b',    // amber-500
  tool: '#14b8a6',         // teal-500
};

const NODE_TYPE_ORDER: NodeType[] = ['directive', 'value', 'goal', 'concept', 'architecture', 'tool'];

const styles = `
  .kg-svg-container {
    background-color: #020617;
    background-image: radial-gradient(circle, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
    background-size: 20px 20px;
  }
  .kg-node, .kg-edge {
    transition: opacity 0.3s ease-in-out;
  }
`;

// --- Layout Calculation ---
const useStaticLayout = (graph: KnowledgeGraph, width: number, height: number) => {
    return useMemo(() => {
        const nodes: (GraphNode & { x: number; y: number })[] = [];
        const edges: (GraphEdge & { sourcePos: { x: number; y: number }; targetPos: { x: number; y: number } })[] = [];
        if (!graph || !graph.nodes || width === 0 || height === 0) {
            return { nodes, edges };
        }

        const nodesById = new Map<string, GraphNode & { x: number; y: number }>();
        const nodesByType: Record<NodeType, GraphNode[]> = {
            architecture: [], value: [], concept: [], goal: [], directive: [], tool: []
        };

        graph.nodes.forEach(node => {
            if (nodesByType[node.type]) {
                nodesByType[node.type].push(node);
            }
        });

        const columnCount = NODE_TYPE_ORDER.length;
        const columnWidth = width / columnCount;

        NODE_TYPE_ORDER.forEach((type, colIndex) => {
            const columnNodes = nodesByType[type];
            const x = columnWidth * (colIndex + 0.5);
            const rowCount = columnNodes.length;
            const rowHeight = height / (rowCount + 1);

            columnNodes.forEach((node, rowIndex) => {
                const y = rowHeight * (rowIndex + 1);
                const positionedNode = { ...node, x, y };
                nodes.push(positionedNode);
                nodesById.set(node.id, positionedNode);
            });
        });

        graph.edges.forEach(edge => {
            const sourceNode = nodesById.get(edge.source as string);
            const targetNode = nodesById.get(edge.target as string);
            if (sourceNode && targetNode) {
                edges.push({
                    ...edge,
                    sourcePos: { x: sourceNode.x, y: sourceNode.y },
                    targetPos: { x: targetNode.x, y: targetNode.y },
                });
            }
        });

        return { nodes, edges };
    }, [graph, width, height]);
};


const KnowledgeGraphViewer: React.FC<{ graph: KnowledgeGraph }> = ({ graph }) => {
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [hoveredNode, setHoveredNode] = useState<(GraphNode & {x: number, y: number}) | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const resizeObserver = new ResizeObserver(() => {
            setDimensions({ width: container.offsetWidth, height: container.offsetHeight });
        });
        resizeObserver.observe(container);
        setDimensions({ width: container.offsetWidth, height: container.offsetHeight });
        return () => resizeObserver.disconnect();
    }, []);

    const { nodes, edges } = useStaticLayout(graph, dimensions.width, dimensions.height);

    const { highlightedNodeIds, highlightedEdgeIds } = useMemo(() => {
        if (!selectedNodeId) return { highlightedNodeIds: new Set<string>(), highlightedEdgeIds: new Set<string>() };
        
        const nodes = new Set<string>([selectedNodeId]);
        const edgesSet = new Set<string>();
        
        graph.edges.forEach(edge => {
            if (edge.source === selectedNodeId) {
                nodes.add(edge.target as string);
                edgesSet.add(edge.id);
            }
            if (edge.target === selectedNodeId) {
                nodes.add(edge.source as string);
                edgesSet.add(edge.id);
            }
        });
        return { highlightedNodeIds: nodes, highlightedEdgeIds: edgesSet };
    }, [selectedNodeId, graph.edges]);

    const getEdgePath = (sourcePos: {x:number, y:number}, targetPos: {x:number, y:number}) => {
        const dx = targetPos.x - sourcePos.x;
        // Bezier curve for better visuals
        return `M ${sourcePos.x} ${sourcePos.y} C ${sourcePos.x + dx / 2} ${sourcePos.y}, ${sourcePos.x + dx / 2} ${targetPos.y}, ${targetPos.x} ${targetPos.y}`;
    }

    return (
        <div className="h-full flex flex-col">
            <style>{styles}</style>
            <div ref={containerRef} className="relative w-full flex-grow overflow-auto kg-svg-container rounded-b-lg">
                {dimensions.width > 0 && (
                    <svg width={dimensions.width} height={dimensions.height} onClick={() => setSelectedNodeId(null)}>
                        <defs>
                            <marker id="arrowhead" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                                <path d="M 0 0 L 10 5 L 0 10 z" fill="#374151" />
                            </marker>
                            <marker id="arrowhead-highlight" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                                <path d="M 0 0 L 10 5 L 0 10 z" fill="#a855f7" />
                            </marker>
                        </defs>

                        {/* Edges */}
                        <g>
                            {edges.map(edge => {
                                const isHighlighted = highlightedEdgeIds.has(edge.id);
                                return (
                                <path
                                    key={edge.id}
                                    className="kg-edge"
                                    d={getEdgePath(edge.sourcePos, edge.targetPos)}
                                    fill="none"
                                    stroke={isHighlighted ? NODE_COLORS.value : '#374151'}
                                    strokeWidth={isHighlighted ? 1.5 : 1}
                                    opacity={!selectedNodeId || isHighlighted ? 0.7 : 0.15}
                                    markerEnd={isHighlighted ? 'url(#arrowhead-highlight)' : 'url(#arrowhead)'}
                                />
                                );
                            })}
                        </g>

                        {/* Nodes */}
                        <g>
                            {nodes.map(node => {
                                const isHighlighted = highlightedNodeIds.has(node.id);
                                const isSelected = node.id === selectedNodeId;
                                return(
                                <g key={node.id} 
                                    transform={`translate(${node.x}, ${node.y})`}
                                    className="kg-node cursor-pointer"
                                    opacity={!selectedNodeId || isHighlighted ? 1 : 0.3}
                                    onClick={(e) => { e.stopPropagation(); setSelectedNodeId(prevId => prevId === node.id ? null : node.id); }}
                                    onMouseEnter={() => setHoveredNode(node)}
                                    onMouseLeave={() => setHoveredNode(null)}
                                >
                                    <circle r={isSelected ? 9 : 7} fill={NODE_COLORS[node.type] || '#64748b'} stroke={isSelected ? 'white' : '#94a3b8'} strokeWidth={1.5} />
                                    <text
                                        y={18}
                                        textAnchor="middle"
                                        fill="#e2e8f0"
                                        fontSize="10px"
                                        paintOrder="stroke"
                                        stroke="#020617"
                                        strokeWidth="3px"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="select-none pointer-events-none"
                                    >
                                        {node.label}
                                    </text>
                                </g>
                            )})}
                        </g>
                    </svg>
                )}
                 {hoveredNode && (
                    <div
                        className="absolute bg-slate-900/80 border border-slate-600 rounded-md p-2 text-xs shadow-lg pointer-events-none z-10"
                        style={{ left: hoveredNode.x + 15, top: hoveredNode.y + 15 }}
                    >
                        <p className="font-bold text-cyan-400">{hoveredNode.label}</p>
                        <p className="text-slate-400 capitalize">Type: {hoveredNode.type}</p>
                        {hoveredNode.data && Object.entries(hoveredNode.data).map(([key, value]) => (
                            <p key={key} className="text-slate-300">{key}: {String(value)}</p>
                        ))}
                    </div>
                )}
            </div>
            <div className="px-4 py-2 border-t border-slate-700 bg-slate-800/50 rounded-b-lg text-xs text-slate-400 flex justify-between items-center flex-wrap">
                <div className="flex flex-wrap">
                    {NODE_TYPE_ORDER.map(type => (
                        <span key={type} className="inline-flex items-center mr-3 my-1">
                            <span className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: NODE_COLORS[type] }}></span>
                            {type}
                        </span>
                    ))}
                </div>
                <span className="my-1">Click node to highlight connections.</span>
            </div>
        </div>
    );
};

export default KnowledgeGraphViewer;