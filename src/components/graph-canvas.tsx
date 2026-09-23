"use client";
import { useEffect, useRef, useState } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import { Minus, Plus, Maximize, MousePointer2 } from "lucide-react";
import type { GraphData, OrgNode } from "@/lib/contracts";
const colors = ["#5676db", "#669a85", "#a68bd0", "#cf9870", "#719fbe"];
export function nodeColor(node: OrgNode) {
  return node.kind === "company"
    ? "#182b30"
    : colors[(Number(node.department_id?.slice(4) ?? 1) - 1) % colors.length];
}
export default function GraphCanvas({
  data,
  selected,
  onSelect,
  showEdges,
}: {
  data: GraphData;
  selected: string | null;
  onSelect: (node: OrgNode | null) => void;
  showEdges: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const renderer = useRef<Sigma | null>(null);
  const selectRef = useRef(onSelect);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    if (!container.current) return;
    const graph = new Graph({ type: "directed" });
    const byId = new Map(data.nodes.map((n) => [n.id, n]));
    data.nodes.forEach((n) =>
      graph.addNode(n.id, {
        x: n.x,
        y: n.y,
        label: n.label,
        color: nodeColor(n),
        size:
          n.kind === "company"
            ? 10
            : n.kind === "department"
              ? 7
              : n.kind === "team"
                ? 3.5
                : 1.5,
        kind: n.kind,
        zIndex: n.kind === "employee" ? 0 : 1,
      }),
    );
    data.edges.forEach((e) =>
      graph.addEdgeWithKey(e.id, e.source, e.target, {
        size: 0.4,
        color: "#cbd4d8",
      }),
    );
    let sigma: Sigma;
    try {
      sigma = new Sigma(graph, container.current, {
        renderEdgeLabels: false,
        labelFont: "Arial",
        labelSize: 12,
        labelColor: { color: "#3d5058" },
        labelDensity: 0.12,
        labelRenderedSizeThreshold: 5,
        hideEdgesOnMove: true,
        zIndex: true,
        minCameraRatio: 0.008,
        maxCameraRatio: 3,
        stagePadding: 70,
        allowInvalidContainer: true,
      });
    } catch {
      // Renderer creation can fail on browsers without WebGL.
      queueMicrotask(() =>
        setError(
          "WebGL недоступен. Включите аппаратное ускорение браузера. Поиск и карточки остаются доступны.",
        ),
      );
      return;
    }
    renderer.current = sigma;
    sigma.on("clickNode", ({ node }) =>
      selectRef.current(byId.get(node) ?? null),
    );
    sigma.on("clickStage", () => selectRef.current(null));
    sigma.on("enterNode", () => {
      if (container.current) container.current.style.cursor = "pointer";
    });
    sigma.on("leaveNode", () => {
      if (container.current) container.current.style.cursor = "grab";
    });
    return () => {
      renderer.current = null;
      sigma.kill();
    };
  }, [data]);
  useEffect(() => {
    const sigma = renderer.current;
    if (!sigma) return;
    const graph = sigma.getGraph();
    const neighbors =
      selected && graph.hasNode(selected)
        ? new Set(graph.neighbors(selected))
        : new Set<string>();
    sigma.setSetting("nodeReducer", (id, attrs) => ({
      ...attrs,
      ...(selected && id !== selected && !neighbors.has(id)
        ? { color: "#c8d2d5", label: "" }
        : {}),
      ...(id === selected
        ? {
            highlighted: true,
            forceLabel: true,
            zIndex: 10,
            size: Math.max(attrs.size, 6),
          }
        : {}),
    }));
    sigma.setSetting("edgeReducer", (id, attrs) => ({
      ...attrs,
      hidden:
        !showEdges ||
        Boolean(selected && !graph.extremities(id).includes(selected)),
    }));
    if (selected && graph.hasNode(selected)) {
      const point = sigma.getNodeDisplayData(selected);
      if (point)
        void sigma
          .getCamera()
          .animate(
            {
              x: point.x,
              y: point.y,
              ratio:
                graph.getNodeAttribute(selected, "kind") === "employee"
                  ? 0.035
                  : 0.2,
            },
            { duration: 400 },
          );
    }
  }, [selected, showEdges, data]);
  return (
    <div className="graph-stage">
      <div
        ref={container}
        className="sigma-container"
        role="img"
        aria-label={`Граф организации: ${data.nodes.length} узлов`}
      />
      {error && (
        <div className="graph-error" role="alert">
          {error}
        </div>
      )}
      <div className="graph-hint">
        <MousePointer2 size={14} /> Перемещайте карту · прокрутите для масштаба
      </div>
      <div className="graph-controls">
        <button
          aria-label="Приблизить"
          onClick={() =>
            void renderer.current?.getCamera().animatedZoom({ duration: 200 })
          }
        >
          <Plus size={18} />
        </button>
        <button
          aria-label="Отдалить"
          onClick={() =>
            void renderer.current?.getCamera().animatedUnzoom({ duration: 200 })
          }
        >
          <Minus size={18} />
        </button>
        <button
          aria-label="Уместить граф"
          onClick={() => {
            onSelect(null);
            void renderer.current?.getCamera().animatedReset({ duration: 300 });
          }}
        >
          <Maximize size={17} />
        </button>
      </div>
    </div>
  );
}
