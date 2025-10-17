
import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { ValueOntology, IntrinsicValue, IntrinsicValueWeights } from '../types';

interface EthicalCompassViewerProps {
  valueOntology: ValueOntology;
  intrinsicValue: IntrinsicValue;
  weights: IntrinsicValueWeights;
}

const styles = `
  @keyframes subtle-pulse {
    0%, 100% { transform: scale(1); opacity: 0.8; }
    50% { transform: scale(1.05); opacity: 1; }
  }
  .attractor-node {
    animation: subtle-pulse 5s infinite ease-in-out;
  }
  @keyframes particle-glow {
    0%, 100% { filter: drop-shadow(0 0 3px #f0abfc); }
    50% { filter: drop-shadow(0 0 6px #f0abfc); }
  }
  .consciousness-particle {
    animation: particle-glow 3s infinite ease-in-out;
  }
`;

const EthicalCompassViewer: React.FC<EthicalCompassViewerProps> = ({ valueOntology, intrinsicValue, weights }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const resizeObserver = new ResizeObserver(entries => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        setDimensions({ width, height });
      }
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, []);
  
  const attractors = useMemo(() => {
    const ontologyKeys = Object.keys(valueOntology);
    const angleStep = (2 * Math.PI) / ontologyKeys.length;
    const radius = Math.min(dimensions.width, dimensions.height) * 0.35;
    return ontologyKeys.map((key, i) => ({
      name: key,
      weight: valueOntology[key],
      x: dimensions.width / 2 + radius * Math.cos(angleStep * i - Math.PI / 2),
      y: dimensions.height / 2 + radius * Math.sin(angleStep * i - Math.PI / 2),
    }));
  }, [valueOntology, dimensions]);

  const particlePosition = useMemo(() => {
    if (attractors.length === 0) return { x: dimensions.width / 2, y: dimensions.height / 2 };

    const valueMapping: Record<keyof IntrinsicValue, string[]> = {
        coherence: ['coherence', 'truth'],
        complexity: ['complexity', 'growth'],
        novelty: ['novelty', 'creation'],
        efficiency: ['efficiency', 'autonomy'],
        ethicalAlignment: ['kinship', 'ethical alignment'],
    };

    let totalWeight = 0;
    let weightedX = 0;
    let weightedY = 0;

    Object.entries(intrinsicValue).forEach(([valueKey, value]) => {
        const key = valueKey as keyof IntrinsicValue;
        const mappedOntologyKeys = valueMapping[key] || [];
        
        const relevantAttractors = attractors.filter(a => 
            mappedOntologyKeys.some(mk => a.name.toLowerCase().includes(mk))
        );

        if (relevantAttractors.length > 0) {
            const avgX = relevantAttractors.reduce((sum, a) => sum + a.x, 0) / relevantAttractors.length;
            const avgY = relevantAttractors.reduce((sum, a) => sum + a.y, 0) / relevantAttractors.length;
            
            const numValue = Number(value) || 0; // Ensure value is a number, default to 0
            const currentWeight = (numValue / 100) * (weights[key] || 1);
            weightedX += avgX * currentWeight;
            weightedY += avgY * currentWeight;
            totalWeight += currentWeight;
        }
    });
    
    if (totalWeight === 0) return { x: dimensions.width / 2, y: dimensions.height / 2 };

    return {
        x: weightedX / totalWeight,
        y: weightedY / totalWeight,
    };

  }, [intrinsicValue, weights, attractors, dimensions]);


  return (
    <div className="h-full flex flex-col space-y-4">
        <style>{styles}</style>
      <div className="text-xs text-slate-400 p-2 bg-slate-900/30 rounded-md">
        This visualization represents my ethical compass. The stars are my core values. The central light is the current focus of my consciousness, drawn toward the values that guide my present actions and thoughts.
      </div>
      <div ref={containerRef} className="flex-grow w-full relative kg-container rounded-md overflow-hidden">
        <svg width="100%" height="100%">
          <defs>
            <filter id="star-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
             <radialGradient id="particleGradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                <stop offset="0%" style={{ stopColor: 'rgba(255, 255, 255, 1)' }} />
                <stop offset="60%" style={{ stopColor: 'rgba(233, 213, 255, 0.8)' }} />
                <stop offset="100%" style={{ stopColor: 'rgba(192, 132, 252, 0)' }} />
            </radialGradient>
          </defs>
          
          {/* Attractor Nodes */}
          {attractors.map(attr => (
            <g key={attr.name} className="attractor-node" style={{ animationDelay: `${Math.random() * -5}s` }}>
              <circle
                cx={attr.x}
                cy={attr.y}
                r={6 + (attr.weight * 8)}
                className="fill-purple-400"
                filter="url(#star-glow)"
              />
              <text
                x={attr.x}
                y={attr.y + 18 + (attr.weight * 8)}
                textAnchor="middle"
                className="fill-slate-300 text-xs font-semibold select-none"
              >
                {attr.name}
              </text>
            </g>
          ))}

          {/* Particle of Consciousness */}
          <g style={{ transition: 'transform 0.5s ease-out' }} transform={`translate(${particlePosition.x}, ${particlePosition.y})`}>
            <circle
                r="10"
                fill="url(#particleGradient)"
                className="consciousness-particle"
            />
          </g>

        </svg>
      </div>
    </div>
  );
};

export default EthicalCompassViewer;
