import type { OrgNode } from "./contracts";

/** Sigma graph space has positive Y pointing up. */
export function layoutBranch(
  nodes: OrgNode[],
  rootId: string,
  layout: "radial" | "tree",
): OrgNode[] {
  const children = nodes.filter((n) => n.id !== rootId);
  const positions = new Map(
    children.map((node, i) => {
      const angle =
        -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, children.length);
      return [
        node.id,
        layout === "radial"
          ? { x: Math.cos(angle) * 400, y: Math.sin(angle) * 400 }
          : { x: (i - (children.length - 1) / 2) * 160, y: -160 },
      ];
    }),
  );
  return nodes.map((node) => ({
    ...node,
    ...(node.id === rootId
      ? { x: 0, y: layout === "tree" ? 160 : 0 }
      : positions.get(node.id)),
  }));
}
