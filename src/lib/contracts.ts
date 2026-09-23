export type NodeKind = "company" | "department" | "team" | "employee";
export type GraphMode = "overview" | "employees";
export interface OrgNode {
  id: string;
  label: string;
  kind: NodeKind;
  parent_id: string | null;
  department_id: string | null;
  role: string;
  city: string;
  x: number;
  y: number;
}
export interface GraphData {
  nodes: OrgNode[];
  edges: { id: string; source: string; target: string }[];
  meta: { mock: true; mode: GraphMode; nodeCount: number; edgeCount: number };
}
export interface OrganizationData {
  mock: true;
  stats: {
    employees: number;
    departments: number;
    teams: number;
    nodes: number;
  };
  departments: { id: string; label: string; employees: number }[];
}
export const kindLabels: Record<NodeKind, string> = {
  company: "Компания",
  department: "Департамент",
  team: "Отдел",
  employee: "Сотрудник",
};

export interface BranchNode extends OrgNode {
  child_count: number;
}
export interface BranchData {
  nodes: BranchNode[];
  edges: GraphData["edges"];
  breadcrumbs: OrgNode[];
  meta: {
    mock: true;
    rootId: string;
    layout: "radial" | "tree";
    nodeCount: number;
    edgeCount: number;
    totalChildren: number;
    page: number;
    pageSize: number;
  };
}
