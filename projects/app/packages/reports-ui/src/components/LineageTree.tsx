import type { LineageEdge, LineageNode } from "../types.js";
import { formatNumber, truncate } from "./svg-helpers.js";

export type LineageTreeProps = {
  readonly nodes: readonly LineageNode[];
  readonly edges: readonly LineageEdge[];
  readonly ariaLabel?: string;
};

function edgeKey(edge: LineageEdge): string {
  return [edge.kind ?? "parent", edge.fromId, edge.toId, edge.label ?? "none"].join(":");
}

/**
 * Tree view of branch lineage: initial commit, candidate siblings, and optional
 * synthesis with dashed cherry-pick edges back to source candidates.
 */
export function LineageTree(props: LineageTreeProps) {
  if (props.nodes.length === 0) {
    return (
      <svg
        className="lineage-svg"
        viewBox="0 0 800 240"
        role="img"
        aria-label={props.ariaLabel ?? "Empty lineage diagram"}
      >
        <rect x={0} y={0} width={800} height={240} fill="#ffffff" />
        <text x={400} y={120} textAnchor="middle" fill="#9b9aa0" fontSize={13}>
          No branch lineage yet.
        </text>
      </svg>
    );
  }

  const candidates = props.nodes.filter((node) => node.kind === "candidate");
  const initial = props.nodes.find((node) => node.kind === "initial");
  const synthesis = props.nodes.find((node) => node.kind === "synthesis");

  const totalRows = synthesis === undefined ? 2 : 3;
  const rowHeight = 130;
  const baseWidth = Math.max(800, 220 + candidates.length * 220);
  const totalHeight = totalRows * rowHeight + 20;
  const xCenter = baseWidth / 2;

  const positions = new Map<string, { x: number; y: number }>();
  if (initial !== undefined) {
    positions.set(initial.id, { x: xCenter, y: 60 });
  }
  const candidateSpacing = (baseWidth - 160) / Math.max(candidates.length, 1);
  for (const [index, node] of candidates.entries()) {
    positions.set(node.id, {
      x: 80 + candidateSpacing / 2 + index * candidateSpacing,
      y: rowHeight,
    });
  }
  if (synthesis !== undefined) {
    positions.set(synthesis.id, { x: xCenter, y: rowHeight * 2 });
  }

  return (
    <svg
      className="lineage-svg"
      viewBox={`0 0 ${baseWidth} ${totalHeight}`}
      role="img"
      aria-label={props.ariaLabel ?? "Branch lineage"}
    >
      <rect x={0} y={0} width={baseWidth} height={totalHeight} fill="#ffffff" />
      {props.edges.map((edge) => {
        const from = positions.get(edge.fromId);
        const to = positions.get(edge.toId);
        if (from === undefined || to === undefined) {
          return null;
        }
        const isCherry = edge.kind === "cherry-pick";
        const path = curvedPath(from, to);
        return (
          <g key={edgeKey(edge)}>
            <path
              d={path}
              stroke={isCherry ? "#a14e16" : "#1a1a1a"}
              strokeWidth={isCherry ? 1 : 0.9}
              fill="none"
              strokeDasharray={isCherry ? "4 4" : undefined}
            />
            {isCherry && edge.label !== undefined && (
              <text
                x={(from.x + to.x) / 2}
                y={(from.y + to.y) / 2}
                textAnchor="middle"
                fill="#a14e16"
                fontSize={9}
                fontFamily="ui-monospace, Menlo, monospace"
              >
                cherry {edge.label}
              </text>
            )}
          </g>
        );
      })}
      {props.nodes.map((node) => {
        const position = positions.get(node.id);
        if (position === undefined) {
          return null;
        }
        return <LineageNodeRect key={node.id} node={node} x={position.x} y={position.y} />;
      })}
    </svg>
  );
}

function curvedPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dy = to.y - from.y;
  const c1y = from.y + dy / 2;
  const c2y = to.y - dy / 2;
  return `M ${formatNumber(from.x)} ${formatNumber(from.y)} C ${formatNumber(from.x)} ${formatNumber(c1y)}, ${formatNumber(to.x)} ${formatNumber(c2y)}, ${formatNumber(to.x)} ${formatNumber(to.y)}`;
}

function LineageNodeRect(props: { node: LineageNode; x: number; y: number }) {
  const width = 210;
  const height = 72;
  const x = props.x - width / 2;
  const y = props.y - height / 2;
  const { fill, stroke } = nodeColors(props.node);
  return (
    <g className="lineage-node">
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={3}
        fill={fill}
        stroke={stroke}
        strokeWidth={0.8}
      />
      <text
        x={x + 12}
        y={y + 22}
        fill="#1a1a1a"
        fontSize={11}
        fontWeight={600}
        fontFamily="ui-monospace, Menlo, monospace"
      >
        {truncate(props.node.label, 30)}
      </text>
      <text x={x + 12} y={y + 40} fill="#5e5e63" fontSize={10}>
        {truncate(props.node.subLabel, 34)}
      </text>
      {props.node.actor !== undefined && (
        <text x={x + 12} y={y + 58} fill="#5e5e63" fontSize={9}>
          {truncate(props.node.actor, 30)}
          {props.node.delta !== undefined ? ` · ${props.node.delta}` : ""}
        </text>
      )}
    </g>
  );
}

function nodeColors(node: LineageNode): { fill: string; stroke: string } {
  if (node.kind === "synthesis") {
    return { fill: "#fdf2e7", stroke: "#a14e16" };
  }
  if (node.kind === "initial") {
    return { fill: "#f5f3ed", stroke: "#1a1a1a" };
  }
  if (node.status === "accepted" || node.status === "approved") {
    return { fill: "#eaf2ec", stroke: "#2b6a47" };
  }
  if (node.status === "rejected" || node.status === "abandoned") {
    return { fill: "#f5ecea", stroke: "#9c3a2d" };
  }
  return { fill: "#fdfcf7", stroke: "#1a1a1a" };
}
