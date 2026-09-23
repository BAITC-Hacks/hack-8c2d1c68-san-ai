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
  assert.ok(
    info.departments.every(
      (d) => d.employees === (d.id === "dep-01" ? 999 : 1000),
    ),
  );
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
  assert.equal(scoped.nodes.length, 1011);
  assert.equal(scoped.edges.length, 1010);
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

test("branch overview shows only direct departments and company employees", async () => {
  const { branchData } = await import("../src/lib/server/branch");
  const branch = await branchData(db, "company", 0);
  assert.equal(branch.meta.layout, "radial");
  assert.equal(branch.nodes.length, 22);
  assert.equal(branch.nodes.filter((n) => n.kind === "employee").length, 1);
  assert.equal(
    branch.nodes.find((n) => n.id === "emp-00002")?.role,
    "Генеральный директор",
  );
  assert.ok(
    branch.nodes.every((n) => n.id === "company" || n.parent_id === "company"),
  );
  const root = branch.nodes.find((n) => n.id === "company")!;
  for (const node of branch.nodes.filter((n) => n.id !== "company")) {
    assert.ok(
      Math.abs(Math.hypot(node.x - root.x, node.y - root.y) - 400) < 0.001,
    );
  }
});
test("each deeper branch is top-down and includes employees irrespective of kind", async () => {
  const { branchData } = await import("../src/lib/server/branch");
  for (const id of ["dep-01", "dep-01-team-1", "emp-00001"]) {
    const branch = await branchData(db, id, 0);
    const root = branch.nodes.find((n) => n.id === id)!;
    assert.equal(branch.meta.layout, "tree");
    assert.ok(branch.nodes.length <= 13);
    assert.equal(branch.edges.length, branch.nodes.length - 1);
    assert.ok(
      branch.nodes
        .filter((n) => n.id !== id)
        .every((n) => n.parent_id === id && n.y < root.y),
    );
    assert.equal(branch.breadcrumbs[0].id, "company");
    assert.equal(branch.breadcrumbs.at(-1)?.id, id);
  }
  const department = await branchData(db, "dep-01", 0);
  assert.equal(department.nodes.length, 12);
  assert.equal(
    department.nodes.find((n) => n.id === "emp-00003")?.role,
    "Директор департамента",
  );
});
test("all direct reports are reachable through pages, without duplicates or hidden descendants", async () => {
  const { branchData } = await import("../src/lib/server/branch");
  const first = await branchData(db, "emp-00001", 0);
  assert.equal(first.meta.totalChildren, 97);
  const ids: string[] = [];
  for (
    let page = 0;
    page < Math.ceil(first.meta.totalChildren / first.meta.pageSize);
    page++
  ) {
    const branch = await branchData(db, "emp-00001", page);
    ids.push(
      ...branch.nodes.filter((n) => n.id !== "emp-00001").map((n) => n.id),
    );
  }
  assert.equal(ids.length, 97);
  assert.equal(new Set(ids).size, 97);
  await assert.rejects(() => branchData(db, "emp-00001", 99));
});
test("leaf navigation preserves the complete path; invalid roots are rejected", async () => {
  const { branchData, branchParams } = await import("../src/lib/server/branch");
  const leaf = await branchData(db, "emp-00004", 0);
  assert.equal(leaf.nodes.length, 1);
  assert.equal(leaf.meta.totalChildren, 0);
  assert.deepEqual(
    leaf.breadcrumbs.map((n) => n.id),
    ["company", "dep-01", "dep-01-team-1", "emp-00001", "emp-00004"],
  );
  await assert.rejects(() => branchData(db, "missing-node", 0));
  for (const query of ["root=' OR 1=1", "page=-1", "page=abc", "page=1.5"])
    assert.throws(() => branchParams(new URLSearchParams(query)));
});
test("director migration upgrades original demo records but preserves edited roles", async () => {
  await db.query(
    "UPDATE org_nodes SET parent_id='emp-00001',department_id='dep-01',role='Аналитик' WHERE id='emp-00002'",
  );
  await db.query(
    "UPDATE org_nodes SET parent_id='emp-00001',role='Специалист' WHERE id='emp-00003'",
  );
  await db.query(
    "UPDATE org_nodes SET parent_id='emp-01001',role='Аналитик' WHERE id='emp-01002'",
  );
  await migrate(db);
  const chief = (await searchNodes(db, "emp-00002", null))[0];
  assert.equal(chief.parent_id, "company");
  assert.equal(chief.department_id, null);
  assert.equal(
    (await searchNodes(db, "emp-00003", null))[0].parent_id,
    "dep-01",
  );
  assert.equal(
    (await searchNodes(db, "emp-01002", null))[0].parent_id,
    "dep-02",
  );
  assert.equal(
    (await searchNodes(db, "emp-20000", null))[0].role,
    "Изменённая тестовая роль",
  );
});
