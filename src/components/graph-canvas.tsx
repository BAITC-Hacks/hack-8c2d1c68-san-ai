"use client";
import { useEffect, useRef, useState } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import { Minus, Plus, Maximize, MousePointer2 } from "lucide-react";
import type { BranchData, OrgNode } from "@/lib/contracts";
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
  data: BranchData;
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
        label:
          n.kind === "team"
            ? n.label.split(" · ")[0]
            : data.meta.layout === "radial" && n.kind === "employee"
              ? n.role
              : n.label,
        subLabel:
          n.kind === "employee"
            ? n.role
            : n.child_count > 0
              ? `${n.child_count} вложенных объектов`
              : "",
        forceLabel:
          n.id === data.meta.rootId ||
          (data.meta.layout === "radial" && n.kind === "employee"),

        color: nodeColor(n),
        size: n.id === data.meta.rootId ? 11 : n.kind === "employee" ? 6 : 8,
        kind: n.kind,
        zIndex: n.kind === "employee" ? 0 : 1,
      }),
    );
    data.edges.forEach((e) =>
      graph.addEdgeWithKey(e.id, e.source, e.target, {
        size: 1,
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
        labelDensity: 0.4,
        ...(data.meta.layout === "tree"
          ? {
              defaultDrawNodeLabel: (
                context: CanvasRenderingContext2D,
                node: {
                  x: number;
                  y: number;
                  size: number;
                  label?: string | null;
                  subLabel?: string;
                },
              ) => {
                const text = node.label ?? "";
                const words = text.split(" ");
                const lines: string[] = [];
                for (const word of words) {
                  if (
                    !lines.length ||
                    (lines[lines.length - 1] + " " + word).length > 23
                  )
                    lines.push(word);
                  else lines[lines.length - 1] += " " + word;
                }
                const visible = lines.slice(0, 3);
                if (node.subLabel) visible.push(node.subLabel);
                context.font = "11px Arial";
                context.textAlign = "center";
                const y = node.y + node.size + 17;
                const width =
                  Math.max(
                    ...visible.map((line) => context.measureText(line).width),
                    0,
                  ) + 10;
                context.fillStyle = "rgba(252,253,253,0.94)";
                context.fillRect(
                  node.x - width / 2,
                  y - 12,
                  width,
                  visible.length * 15 + 5,
                );
                visible.forEach((line, index) => {
                  context.fillStyle =
                    index === visible.length - 1 && node.subLabel
                      ? "#829692"
                      : "#304d53";
                  context.fillText(line, node.x, y + index * 15);
                });
              },
            }
          : {}),
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
    // Panel toggles resize the container without changing the browser window.
    let resizeFrame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        sigma.resize();
        sigma.refresh();
      });
    });
    observer.observe(container.current);
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
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
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
        ? { color: "#c8d2d5" }
        : {}),
      ...(id === selected
        ? {
            highlighted: false,
            forceLabel: true,
            zIndex: 10,
            size: Math.max(attrs.size, 6),
          }
        : {}),
    }));
    sigma.setSetting("edgeReducer", (id, attrs) => ({
      ...attrs,
      hidden: !showEdges,
    }));
  }, [selected, showEdges, data]);
  return (
    <div className="graph-stage">
      <div className="graph-scroll">
        <div
          ref={container}
          className="sigma-container"
          role="img"
          aria-label={`Граф организации: ${data.nodes.length} узлов`}
        />
      </div>
      {error && (
        <div className="graph-error" role="alert">
          {error}
        </div>
      )}
      <div className="graph-hint">
        <MousePointer2 size={14} /> Нажмите на узел с подчинёнными, чтобы
        раскрыть уровень. Перетаскивание — перемещение, колесо — масштаб.
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
