import type { ExtractedUnit } from "./extraction";
export interface StructureNode { id: string; name: string; entity?: ExtractedUnit; parentId: string | null; unresolved: boolean }
/** A view of extraction only: no alias guessing and no mutation of canonical data. */
export function buildDocumentStructure(units: ExtractedUnit[]): StructureNode[] {
  const nodes: StructureNode[] = units.map(u=>({id:u.unit_id,name:u.unit_name,entity:u,parentId:null,unresolved:false}));
  const placeholders = new Map<string, StructureNode>();
  for (const node of nodes) {
    const parentName = node.entity?.parent_unit;
    if (!parentName) continue;
    const candidates = nodes.filter(n=>n.name === parentName);
    if (candidates.length === 1 && candidates[0].id !== node.id) node.parentId = candidates[0].id;
    else if (!candidates.length) {
      let parent = placeholders.get(parentName);
      if (!parent) { parent = {id:`external-parent-${placeholders.size}`,name:parentName,parentId:null,unresolved:true}; placeholders.set(parentName,parent); }
      node.parentId=parent.id;
    } else node.unresolved=true;
  }
  const all=[...nodes,...placeholders.values()];
  const byId=new Map(all.map(n=>[n.id,n]));
  // Broken cycles stay visible as roots, never recurse forever or hide nodes.
  for (const node of nodes) {
    const visited = new Set([node.id]);
    let id=node.parentId;
    while (id) {
      if (visited.has(id)) { node.parentId=null; node.unresolved=true; break; }
      visited.add(id); id=byId.get(id)?.parentId ?? null;
    }
  }
  return all;
}
