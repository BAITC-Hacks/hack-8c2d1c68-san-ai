import type { Database } from "./db";
import { generateMockNodes } from "./mock-data";
export async function seed(db: Database) {
  const nodes = generateMockNodes();
  await db.transaction(async (tx) => {
    for (let i = 0; i < nodes.length; i += 1000) {
      await tx.query(
        `INSERT INTO org_nodes (id,label,kind,parent_id,department_id,role,city,x,y,dataset)
        SELECT id,label,kind,parent_id,department_id,role,city,x,y,'demo-v1'
        FROM json_to_recordset($1::json) AS n(id text,label text,kind text,parent_id text,department_id text,role text,city text,x double precision,y double precision)
        ON CONFLICT (id) DO NOTHING`,
        [JSON.stringify(nodes.slice(i, i + 1000))],
      );
    }
  });
  return nodes.length;
}
