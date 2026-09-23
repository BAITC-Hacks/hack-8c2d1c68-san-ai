import type { BranchData, BranchNode, OrgNode } from "../contracts";
import type { Database } from "./db";
import { InputError } from "./organization";
import { layoutBranch } from "../branch-layout";
export class NodeNotFoundError extends Error {}
export function branchParams(params: URLSearchParams) {
  const root = params.get("root") || "company";
  const page = params.get("page") || "0";
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(root))
    throw new InputError("Некорректный идентификатор узла.");
  if (!/^\d{1,6}$/.test(page)) throw new InputError("Некорректная страница.");
  return { root, page: Number(page) };
}
export async function branchData(
  db: Database,
  rootId: string,
  page: number,
): Promise<BranchData> {
  const { rows: roots } = await db.query<BranchNode>(
    `SELECT n.id,n.label,n.kind,n.parent_id,n.department_id,n.role,n.city,n.x,n.y,
    (SELECT count(*)::int FROM org_nodes c WHERE c.parent_id=n.id) child_count FROM org_nodes n WHERE n.id=$1`,
    [rootId],
  );
  const root = roots[0];
  if (!root && rootId !== "company")
    throw new NodeNotFoundError("Объект не найден.");
  const layout = rootId === "company" ? "radial" : "tree";
  const pageSize = rootId === "company" ? 24 : 12;
  const totalChildren = root?.child_count ?? 0;
  if (page > Math.max(0, Math.ceil(totalChildren / pageSize) - 1))
    throw new InputError("Страница за пределами списка.");
  const { rows: children } = await db.query<BranchNode>(
    `SELECT n.id,n.label,n.kind,n.parent_id,n.department_id,n.role,n.city,n.x,n.y,
    (SELECT count(*)::int FROM org_nodes c WHERE c.parent_id=n.id) child_count FROM org_nodes n
    WHERE n.parent_id=$1 ORDER BY CASE WHEN n.kind='employee' THEN 0 ELSE 1 END,n.id LIMIT $2 OFFSET $3`,
    [rootId, pageSize, page * pageSize],
  );
  const { rows: breadcrumbs } = await db.query<OrgNode>(
    `WITH RECURSIVE ancestors AS (
      SELECT id,label,kind,parent_id,department_id,role,city,x,y,0 depth,ARRAY[id] visited FROM org_nodes WHERE id=$1
      UNION ALL SELECT n.id,n.label,n.kind,n.parent_id,n.department_id,n.role,n.city,n.x,n.y,a.depth+1,a.visited||n.id
      FROM org_nodes n JOIN ancestors a ON n.id=a.parent_id WHERE NOT n.id=ANY(a.visited) AND a.depth<100
    ) SELECT id,label,kind,parent_id,department_id,role,city,x,y FROM ancestors ORDER BY depth DESC`,
    [rootId],
  );
  const source = root ? [root, ...children] : [];
  const coords = layoutBranch(source, rootId, layout);
  const nodes = coords.map((n, i) => ({
    ...n,
    child_count: source[i].child_count,
  }));
  const edges = children.map((n) => ({
    id: `edge-${n.id}`,
    source: rootId,
    target: n.id,
  }));
  return {
    nodes,
    edges,
    breadcrumbs,
    meta: {
      mock: true,
      rootId,
      layout,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      totalChildren,
      page,
      pageSize,
    },
  };
}
