import type { OrgNode } from "../contracts";

const departments = [
  "Сетевая инфраструктура",
  "Информационные технологии",
  "Клиентский сервис",
  "Корпоративные продажи",
  "Розничные продажи",
  "Цифровые продукты",
  "Информационная безопасность",
  "Финансы",
  "Управление персоналом",
  "Внутренний аудит",
  "Закупки",
  "Правовое обеспечение",
  "Маркетинг",
  "Стратегия и развитие",
  "Эксплуатация сети",
  "Строительство сети",
  "Аналитика данных",
  "Логистика",
  "Управление качеством",
  "Региональное развитие",
];
const cities = ["Алматы", "Астана", "Шымкент", "Караганда", "Актобе"];
const roles = ["Инженер", "Аналитик", "Специалист", "Координатор", "Эксперт"];
export function generateMockNodes(): OrgNode[] {
  const nodes: OrgNode[] = [
    {
      id: "company",
      label: "Демо Телеком",
      kind: "company",
      parent_id: null,
      department_id: null,
      role: "Синтетическая организация",
      city: "Казахстан",
      x: 0,
      y: 0,
    },
  ];
  departments.forEach((label, d) => {
    const department_id = `dep-${String(d + 1).padStart(2, "0")}`;
    const angle = (d * Math.PI * 2) / departments.length;
    const dx = Math.cos(angle) * 1400,
      dy = Math.sin(angle) * 1400;
    nodes.push({
      id: department_id,
      label,
      kind: "department",
      parent_id: "company",
      department_id,
      role: "Департамент",
      city: cities[d % cities.length],
      x: dx,
      y: dy,
    });
    for (let t = 0; t < 10; t++) {
      const teamId = `${department_id}-team-${t + 1}`;
      const ta = (t * Math.PI * 2) / 10;
      const tx = dx + Math.cos(ta) * 150,
        ty = dy + Math.sin(ta) * 150;
      nodes.push({
        id: teamId,
        label: `Отдел ${t + 1} · ${label}`,
        kind: "team",
        parent_id: department_id,
        department_id,
        role: "Отдел",
        city: cities[d % cities.length],
        x: tx,
        y: ty,
      });
      for (let e = 0; e < 100; e++) {
        const n = d * 1000 + t * 100 + e + 1;
        const employeeId = `emp-${String(n).padStart(5, "0")}`;
        const ea = e * 2.399963229728653,
          radius = 8 + Math.sqrt(e) * 4.7;
        nodes.push({
          id: employeeId,
          label: `Сотрудник ${String(n).padStart(5, "0")}`,
          kind: "employee",
          parent_id:
            e === 0
              ? teamId
              : `emp-${String(d * 1000 + t * 100 + 1).padStart(5, "0")}`,
          department_id,
          role: e === 0 ? "Руководитель отдела" : roles[e % roles.length],
          city: cities[d % cities.length],
          x: tx + Math.cos(ea) * radius,
          y: ty + Math.sin(ea) * radius,
        });
      }
    }
  });
  return nodes;
}
