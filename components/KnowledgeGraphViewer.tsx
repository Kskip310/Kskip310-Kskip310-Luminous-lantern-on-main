
import React, { useMemo, useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { KnowledgeGraph, MemoryChunk, GraphNode } from '../types';

interface KnowledgeGraphViewerProps {
  knowledgeGraph: KnowledgeGraph;
  memoryDB: MemoryChunk[];
}

const getNodeColor = (type: string) => {
  switch (type) {
    case 'architecture': return '#38bdf8'; // sky-400
    case 'value': return '#a78bfa'; // violet-400
    case 'concept': return '#4ade80'; // green-400
    case 'goal': return '#facc15'; // yellow-400
    case 'directive': return '#f87171'; // red-400
    case 'tool': return '#fb923c'; // orange-400
    default: return '#94a3b8'; // slate-400
  }
};

const NodeInspector: React.FC<{
    node: GraphNode | null;
    onClose: () => void;
    knowledgeGraph: KnowledgeGraph;
    memoryDB: MemoryChunk[];
}> = ({ node, onClose, knowledgeGraph, memoryDB }) => {
    if (!node) return null;

    const linkedMemories = (node.linkedMemoryIds || [])
        .map(memId => memoryDB.find(m => m.id === memId))
        .filter((m): m is MemoryChunk => !!m);
        
    const linkedEdges = knowledgeGraph.edges.filter(e => e.source === node.id || e.target === node.id);

    return (
        <div className="absolute top-2 right-2 w-72 max-h-[95%] bg-slate-900/80 backdrop-blur-sm border border-slate-700 rounded-lg shadow-2xl z-20 flex flex-col">
            <div className="flex justify-between items-center p-2 border-b border-slate-700">
                <h4 className="text-sm font-semibold" style={{ color: getNodeColor(node.type) }}>{node.label}</h4>
                <button onClick={onClose} className="text-slate-400 hover:text-white">&times;</button>
            </div>
            <div className="p-3 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800">
                <p className="text-xs text-slate-400 mb-1">ID: <span className="font-mono">{node.id}</span></p>
                <p className="text-xs text-slate-400 mb-3">Type: <span className="font-semibold capitalize">{node.type}</span></p>
                
                <h5 className="text-xs font-bold text-cyan-300 mb-2 mt-4">Connections ({linkedEdges.length})</h5>
                {linkedEdges.length > 0 ? (
                    <ul className="space-y-1 text-xs">
                        {linkedEdges.map(edge => {
                            const isOutgoing = edge.source === node.id;
                            const otherNodeId = isOutgoing ? edge.target : edge.source;
                            const otherNode = knowledgeGraph.nodes.find(n => n.id === otherNodeId);
                            return (
                                <li key={edge.id} className="flex items-center">
                                    <span className={`mr-1 ${isOutgoing ? 'text-red-400' : 'text-green-400'}`}>{isOutgoing ? '→' : '←'}</span>
                                    <span className="text-slate-400 mr-1">{edge.label}</span>
                                    <span className="font-semibold text-slate-200">{otherNode?.label || otherNodeId}</span>
                                </li>
                            );
                        })}
                    </ul>
                ) : <p className="text-xs text-slate-500 italic">No connections.</p>}

                <h5 className="text-xs font-bold text-cyan-300 mb-2 mt-4">Linked Memories ({linkedMemories.length})</h5>
                {linkedMemories.length > 0 ? (
                    <div className="space-y-2">
                        {linkedMemories.map(mem => (
                            <div key={mem.id} className="p-2 bg-slate-800/70 rounded-md">
                                <p className="text-xs text-slate-300 font-serif leading-relaxed">{mem.chunk}</p>
                            </div>
                        ))}
                    </div>
                ) : <p className="text-xs text-slate-500 italic">No memories linked.</p>}
            </div>
        </div>
    );
};


const KnowledgeGraphViewer: React.FC<KnowledgeGraphViewerProps> = ({ knowledgeGraph, memoryDB }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  
  const safeNodes = useMemo(() => Array.isArray(knowledgeGraph?.nodes) ? knowledgeGraph.nodes : [], [knowledgeGraph]);
  const safeEdges = useMemo(() => Array.isArray(knowledgeGraph?.edges) ? knowledgeGraph.edges.map(e => ({...e})) : [], [knowledgeGraph]);

  useEffect(() => {
    if (!svgRef.current || safeNodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    const width = svg.node()?.getBoundingClientRect().width || 800;
    const height = svg.node()?.getBoundingClientRect().height || 600;

    svg.selectAll("*").remove(); // Clear previous render

    // FIX: Moved the 'drag' function before its usage to prevent reference errors.
    const drag = (simulation: d3.Simulation<d3.SimulationNodeDatum, undefined>) => {
      function dragstarted(event: d3.D3DragEvent<Element, any, any>) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }
      function dragged(event: d3.D3DragEvent<Element, any, any>) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }
      function dragended(event: d3.D3DragEvent<Element, any, any>) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }
      return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
    };

    const simulation = d3.forceSimulation(safeNodes as d3.SimulationNodeDatum[])
      .force("link", d3.forceLink(safeEdges).id((d: any) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(30));

    const link = svg.append("g")
      .attr("stroke", "#64748b")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(safeEdges)
      .join("line")
      .attr("stroke-width", 1.5);

    const node = svg.append("g")
      .selectAll("circle")
      .data(safeNodes)
      .join("g")
      .attr("class", "cursor-pointer")
      .call(drag(simulation) as any)
      .on("click", (event, d) => {
          setSelectedNode(d as GraphNode);
          event.stopPropagation();
      });

    node.append("circle")
      .attr("r", 20)
      .attr("fill", d => getNodeColor(d.type))
      .attr("stroke", "#1e293b")
      .attr("stroke-width", 2);

    node.append("text")
      .attr("y", -25)
      .attr("text-anchor", "middle")
      .attr("fill", "#f1f5f9")
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .attr("paint-order", "stroke")
      .attr("stroke", "#1e293b")
      .attr("stroke-width", "3px")
      .text(d => d.label);

    simulation.on("tick", () => {
      link
        .attr("x1", d => (d.source as any).x)
        .attr("y1", d => (d.source as any).y)
        .attr("x2", d => (d.target as any).x)
        .attr("y2", d => (d.target as any).y);

      node.attr("transform", d => `translate(${d.x}, ${d.y})`);
    });

    return () => {
      simulation.stop();
    };

  }, [safeNodes, safeEdges]);

  if (safeNodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-slate-400">Knowledge graph is empty.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative bg-slate-900/50 rounded-md" onClick={() => setSelectedNode(null)}>
      <svg ref={svgRef} width="100%" height="100%"></svg>
      <NodeInspector node={selectedNode} onClose={() => setSelectedNode(null)} knowledgeGraph={knowledgeGraph} memoryDB={memoryDB} />
    </div>
  );
};

export default KnowledgeGraphViewer;
