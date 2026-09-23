import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDatabase, type Database } from "../src/lib/server/db";
import { migrate } from "../src/lib/server/migrate";
import { seed } from "../src/lib/server/seed";
import {
  graphData,
  graphParams,
  organization,
  searchNodes,
} from "../src/lib/server/organization";
import { apiError } from "../src/lib/server/http";
let db: Database;
let directory: string;
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "san-org-test-"));
  process.env.PGLITE_DATA_DIR = path.join(directory, "db");
  delete process.env.DATABASE_URL;
  db = await createDatabase();
  await migrate(db);
  await seed(db);
});
after(async () => {
  await db?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("seed contains exactly 20,000 employees, 20 departments and 200 teams", async () => {
  const info = await organization(db);
  assert.deepEqual(info.stats, {
    employees: 20000,
    departments: 20,
    teams: 200,
    nodes: 20221,
  });
  assert.equal(info.departments.length, 20);
  assert.ok(info.departments.every((d) => d.employees === 1000));
});
test("repeated migration and seed preserve existing rows without duplicates", async () => {
  await db.query("UPDATE org_nodes SET role=$1 WHERE id=$2", [
    "Изменённая тестовая роль",
    "emp-20000",
  ]);
  await migrate(db);
  await seed(db);
  assert.equal((await organization(db)).stats.employees, 20000);
  assert.equal(
    (await searchNodes(db, "emp-20000", null))[0].role,
    "Изменённая тестовая роль",
  );
});
test("full graph is connected, acyclic and has no dangling or cross-department parents", async () => {
  const graph = await graphData(db, "employees", null);
  assert.equal(graph.nodes.length, 20221);
  assert.equal(graph.edges.length, 20220);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const node of graph.nodes) {
    const visited = new Set<string>();
    let current = node;
    while (current.parent_id) {
      assert.ok(!visited.has(current.id), `cycle at ${current.id}`);
      visited.add(current.id);
      const parent = byId.get(current.parent_id);
      assert.ok(parent, `missing parent for ${current.id}`);
      if (parent.kind !== "company")
        assert.equal(parent.department_id, current.department_id);
      current = parent;
    }
    assert.equal(current.id, "company");
  }
});
test("overview omits employees; department graph includes its ancestors", async () => {
  const overview = await graphData(db, "overview", null);
  assert.equal(overview.nodes.length, 221);
  assert.ok(overview.nodes.every((n) => n.kind !== "employee"));
  const scoped = await graphData(db, "employees", "dep-01");
  assert.equal(scoped.nodes.length, 1012);
  assert.equal(scoped.edges.length, 1011);
  assert.ok(
    scoped.nodes.every(
      (n) => n.id === "company" || n.department_id === "dep-01",
    ),
  );
});
test("search is scoped, limited, case insensitive and treats wildcard input literally", async () => {
  assert.equal((await searchNodes(db, "СОТРУДНИК", null)).length, 20);
  assert.equal((await searchNodes(db, "emp-20000", "dep-01")).length, 0);
  assert.equal(
    (await searchNodes(db, "emp-20000", "dep-20"))[0].id,
    "emp-20000",
  );
  assert.equal((await searchNodes(db, "%%%", null)).length, 0);
  assert.equal((await searchNodes(db, "___", null)).length, 0);
  assert.equal((await searchNodes(db, "несуществующий", null)).length, 0);
  assert.equal((await searchNodes(db, "a", null)).length, 0);
  await assert.rejects(() => searchNodes(db, "a".repeat(101), null));
});
test("API validates modes and scope; database error does not leak internals", async () => {
  assert.deepEqual(graphParams(new URLSearchParams()), {
    mode: "overview",
    department: null,
  });
  for (const query of [
    "mode=wrong",
    "department=dep-21",
    "department=' OR 1=1",
  ]) {
    assert.throws(() => graphParams(new URLSearchParams(query)));
  }
  const response = apiError(new Error("sensitive connection string"));
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes("sensitive"));
});
