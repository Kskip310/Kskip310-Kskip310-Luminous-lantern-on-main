
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { KnowledgeGraph, GraphNode, GraphEdge } from '../types';
import * as d3Force from 'd3-force';
import { drag as d3Drag } from 'd3-drag';
import { select as d3Select, Selection } from 'd3-selection';

// --- Type Augmentation for D3 ---
interface D3Node extends GraphNode, d3Force.SimulationNodeDatum {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}
interface D3Edge extends d3Force.SimulationLinkDatum<D3Node> {
    id: string;
    label: string;
    weight?: number;
    source: string | D3Node;
    target: string | D3Node;
}

// --- Constants ---
const NODE_COLORS: Record<string, string> = {
  architecture: 'fill-blue-500 stroke-blue-300',
  value: 'fill-purple-600 stroke-purple-400',
  concept: 'fill-cyan-500 stroke-cyan-300',
  goal: 'fill-green-500 stroke-green-300',
  directive: 'fill-amber-500 stroke-amber-300',
  tool: 'fill-teal-500 stroke-teal-300',
};

const styles = `
  .kg-container {
    background-color: #020617;
    background-image: radial-gradient(circle, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
    background-size: 20px 20px;
  }
  .node-group {
    transition: opacity 300ms ease-in-out;
  }
  .node-group circle {
     transition: r 300ms ease-in-out, stroke-width 300ms ease-in-out;
  }
  .node-group text {
     transition: opacity 300ms ease-in-out, font-size 300ms ease-in-out, y 300ms ease-in-out;
  }
  .link {
    transition: stroke-opacity 300ms ease-in-out, stroke-width 300ms ease-in-out;
  }
`;

const KnowledgeGraphViewer: React.FC<{ graph: KnowledgeGraph }> = ({ graph }) => {
  const [hoveredNode, setHoveredNode] = useState<D3Node | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [transform, setTransform] = useState({ k: 1, x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3Force.Simulation<D3Node, D3Edge>>();
  const nodeSelectionRef = useRef<Selection<SVGGElement, D3Node, SVGGElement, unknown>>();
  const linkSelectionRef = useRef<Selection<SVGLineElement, D3Edge, SVGGElement, unknown>>();

  // Memoize graph data to prevent unnecessary re-renders if the graph object reference changes but content is the same.
  const nodes = useMemo(() => graph?.nodes || [], [graph]);
  const edges = useMemo(() => graph?.edges || [], [graph]);


  const edgeCounts = useMemo(() => {
    const counts = new Map<string, { in: number; out: number }>();
    if (!nodes || !edges) {
      return counts;
    }
    // Initialize counts for all nodes
    for (const node of nodes) {
      counts.set(node.id, { in: 0, out: 0 });
    }
    // Tally edges
    for (const edge of edges) {
      const sourceNodeCounts = counts.get(edge.source as string);
      if (sourceNodeCounts) {
        sourceNodeCounts.out += 1;
      }
      const targetNodeCounts = counts.get(edge.target as string);
      if (targetNodeCounts) {
        targetNodeCounts.in += 1;
      }
    }
    return counts;
  }, [nodes, edges]);


  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const resizeObserver = new ResizeObserver(() => {
      setDimensions({ width: container.offsetWidth, height: container.offsetHeight });
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  const resetView = useCallback(() => {
    setSelectedNodeId(null);
    setTransform({ k: 1, x: 0, y: 0 });
  }, []);

  // Main D3 setup and simulation effect
  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement || nodes.length === 0 || dimensions.width === 0) return;
    
    const { width, height } = dimensions;

    const nodesData: D3Node[] = JSON.parse(JSON.stringify(nodes));
    const edgesData: D3Edge[] = JSON.parse(JSON.stringify(edges));

    const simulation = simulationRef.current ?? d3Force.forceSimulation<D3Node>();
    simulationRef.current = simulation;

    const svg = d3Select(svgElement);
    const g = svg.select<SVGGElement>('g.main-container');

    const tick = () => {
      if (linkSelectionRef.current) {
        linkSelectionRef.current
          .attr('x1', d => (d.source as D3Node).x!)
          .attr('y1', d => (d.source as D3Node).y!)
          .attr('x2', d => (d.target as D3Node).x!)
          .attr('y2', d => (d.target as D3Node).y!);
      }
      if (nodeSelectionRef.current) {
        nodeSelectionRef.current.attr('transform', d => `translate(${d.x},${d.y})`);
      }
    };

    simulation
      .nodes(nodesData)
      .force('link', d3Force.forceLink<D3Node, D3Edge>(edgesData).id(d => d.id).distance(80))
      .force('charge', d3Force.forceManyBody().strength(-400))
      .force('center', d3Force.forceCenter(width / 2, height / 2))
      .on('tick', tick);
    
    linkSelectionRef.current = g.selectAll<SVGLineElement, D3Edge>('line.link')
      .data(edgesData, d => d.id)
      .join('line')
      .attr('class', 'link')
      .attr('stroke', '#374151') // slate-700
      .attr('marker-end', 'url(#arrowhead)');

    nodeSelectionRef.current = g.selectAll<SVGGElement, D3Node>('g.node-group')
      .data(nodesData, d => d.id)
      .join(enter => {
        const group = enter.append('g').attr('class', 'node-group cursor-grab active:cursor-grabbing');
        group.append('circle');
        group.append('text')
          .attr('y', 14)
          .attr('text-anchor', 'middle')
          .attr('class', 'fill-slate-200 select-none pointer-events-none')
          .attr('paint-order', 'stroke')
          .attr('stroke', '#020617')
          .attr('stroke-linecap', 'round')
          .attr('stroke-linejoin', 'round');
        return group;
      });

    nodeSelectionRef.current.select('circle')
      .attr('class', d => NODE_COLORS[d.type] || 'fill-slate-500 stroke-slate-300');
    
    nodeSelectionRef.current.select('text')
      .text(d => d.label);

    const drag = d3Drag<SVGGElement, D3Node>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x; d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null; d.fy = null;
      });

    nodeSelectionRef.current
        .on('mouseenter', (event, d) => setHoveredNode(d))
        .on('mouseleave', () => setHoveredNode(null))
        .on('click', (event, d) => {
            event.stopPropagation();
            setSelectedNodeId(prevId => (prevId === d.id ? null : d.id));
        })
        .on('dblclick', (event, d) => {
            event.stopPropagation();
            if (typeof d.x !== 'number' || typeof d.y !== 'number') return;
            const scale = 1.5;
            const x = width / 2 - scale * d.x;
            const y = height / 2 - scale * d.y;
            setTransform({ k: scale, x, y });
        })
        .call(drag as any);

    simulation.alpha(1).restart();
    
  }, [nodes, edges, dimensions]);

  // Highlighting effect
  const { highlightedNodeIds, highlightedEdgeIds } = useMemo(() => {
    if (!selectedNodeId) return { highlightedNodeIds: new Set(), highlightedEdgeIds: new Set() };
    const nodes = new Set<string>([selectedNodeId]);
    const edgesSet = new Set<string>();
    graph.edges.forEach(edge => {
      if (edge.source === selectedNodeId) { nodes.add(edge.target); edgesSet.add(edge.id); }
      if (edge.target === selectedNodeId) { nodes.add(edge.source); edgesSet.add(edge.id); }
    });
    return { highlightedNodeIds: nodes, highlightedEdgeIds: edgesSet };
  }, [selectedNodeId, graph.edges]);

  useEffect(() => {
    const k = transform.k;
    if (nodeSelectionRef.current) {
        nodeSelectionRef.current.style('opacity', d => !selectedNodeId || highlightedNodeIds.has(d.id) ? 1 : 0.2);
        nodeSelectionRef.current.select('circle')
            .attr('r', d => (!selectedNodeId || highlightedNodeIds.has(d.id) ? 10 : 7) / k)
            .attr('stroke-width', 1.5 / k);
        nodeSelectionRef.current.select('text')
            .style('opacity', d => !selectedNodeId || highlightedNodeIds.has(d.id) ? 1 : 0)
            .attr('font-size', 10 / k)
            .attr('stroke-width', (3 / k) + 'px')
            .attr('y', d => (!selectedNodeId || highlightedNodeIds.has(d.id) ? 16 : 14) / k);
    }
    if (linkSelectionRef.current) {
        linkSelectionRef.current.style('stroke-opacity', d => !selectedNodeId || highlightedEdgeIds.has(d.id) ? 0.7 : 0.1);
        linkSelectionRef.current.attr('stroke-width', d => (!selectedNodeId || highlightedEdgeIds.has(d.id) ? 1.5 : 0.5) / k);
    }
  }, [selectedNodeId, highlightedNodeIds, highlightedEdgeIds, transform.k]);
  
  const renderTooltip = () => {
    if (!hoveredNode || typeof hoveredNode.x !== 'number' || typeof hoveredNode.y !== 'number') return null;
    const counts = edgeCounts.get(hoveredNode.id);

    return (
      <div
        className="absolute bg-slate-900/80 border border-slate-600 rounded-md p-2 text-xs shadow-lg pointer-events-none"
        style={{ 
          left: transform.x + (hoveredNode.x * transform.k) + 15, 
          top: transform.y + (hoveredNode.y * transform.k) + 15
        }}
      >
        <p className="font-bold text-cyan-400">{hoveredNode.label}</p>
        <p className="text-slate-400 capitalize">Type: {hoveredNode.type}</p>
        {hoveredNode.data && Object.entries(hoveredNode.data).map(([key, value]) => (
          <p key={key} className="text-slate-300">{key}: {String(value)}</p>
        ))}
        {counts && (
            <div className="mt-1 pt-1 border-t border-slate-700">
                <p className="text-slate-300">
                    Connections: <span className="font-semibold text-green-400">In: {counts.in}</span> | <span className="font-semibold text-orange-400">Out: {counts.out}</span>
                </p>
            </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <style>{styles}</style>
      <div 
        ref={containerRef} 
        className="relative w-full flex-grow overflow-hidden kg-container rounded-b-lg"
      >
        <svg 
            ref={svgRef} 
            className="w-full h-full" 
            onClick={() => setSelectedNodeId(null)}
            onDoubleClick={resetView}
        >
            <defs>
                 <marker id="arrowhead" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#374151" />
                </marker>
            </defs>
          <g className="main-container" style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`, transition: 'transform 500ms ease-out' }} />
        </svg>
        {renderTooltip()}
      </div>
       <div className="px-4 py-2 border-t border-slate-700 bg-slate-800/50 rounded-b-lg text-xs text-slate-400 flex justify-between">
          <p>
            {selectedNodeId ? `Selected: ${graph.nodes.find(n => n.id === selectedNodeId)?.label}` : 'Click to highlight. Drag to move.'}
          </p>
          <p>Double-click node to zoom, background to reset.</p>
      </div>
    </div>
  );
};

export default KnowledgeGraphViewer;