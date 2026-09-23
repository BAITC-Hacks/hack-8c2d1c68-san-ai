import type { Database } from "./db";
import type {
  GraphData,
  GraphMode,
  OrganizationData,
  OrgNode,
} from "../contracts";
export class InputError extends Error {}
export function graphParams(params: URLSearchParams): {
  mode: GraphMode;
  department: string | null;
} {
  const mode = params.get("mode") ?? "overview";
  const department = params.get("department");
  if (mode !== "overview" && mode !== "employees")
    throw new InputError("Неизвестный режим графа.");
  if (department && !/^dep-(0[1-9]|1[0-9]|20)$/.test(department))
    throw new InputError("Неизвестный департамент.");
  return { mode, department: department || null };
}
export async function organization(db: Database): Promise<OrganizationData> {
  const { rows } = await db.query<OrganizationData["stats"]>(`SELECT
    count(*) FILTER (WHERE kind='employee')::int employees,
    count(*) FILTER (WHERE kind='department')::int departments,
    count(*) FILTER (WHERE kind='team')::int teams, count(*)::int nodes FROM org_nodes`);
  const departments = await db.query<
    OrganizationData["departments"][number]
  >(`SELECT d.id,d.label,count(e.id)::int employees
    FROM org_nodes d LEFT JOIN org_nodes e ON e.department_id=d.id AND e.kind='employee'
    WHERE d.kind='department' GROUP BY d.id,d.label ORDER BY d.id`);
  return { mock: true, stats: rows[0], departments: departments.rows };
}
export async function graphData(
  db: Database,
  mode: GraphMode,
  department: string | null,
): Promise<GraphData> {
  const { rows: nodes } = await db.query<OrgNode>(
    `SELECT id,label,kind,parent_id,department_id,role,city,x,y FROM org_nodes
    WHERE ($1::text IS NULL OR department_id=$1 OR kind='company')
    AND ($2='employees' OR kind <> 'employee') ORDER BY id`,
    [department, mode],
  );
  const ids = new Set(nodes.map((n) => n.id));
  const edges = nodes.flatMap((n) =>
    n.parent_id && ids.has(n.parent_id)
      ? [{ id: `edge-${n.id}`, source: n.parent_id, target: n.id }]
      : [],
  );
  return {
    nodes,
    edges,
    meta: {
      mock: true,
      mode,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
  };
}
export async function searchNodes(
  db: Database,
  query: string,
  department: string | null,
) {
  if (query.length > 100)
    throw new InputError("Поисковый запрос не должен превышать 100 символов.");
  if (query.trim().length < 2) return [];
  const literal = query.trim().replace(/[\\%_]/g, "\\$&");
  const { rows } = await db.query<OrgNode>(
    `SELECT id,label,kind,parent_id,department_id,role,city,x,y FROM org_nodes
    WHERE ($2::text IS NULL OR department_id=$2) AND (label ILIKE $1 ESCAPE '\\' OR id ILIKE $1 ESCAPE '\\')
    ORDER BY kind,id LIMIT 20`,
    [`%${literal}%`, department],
  );
  return rows;
}
