"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  ChevronRight,
  CircleHelp,
  Database,
  FlaskConical,
  GitBranch,
  Layers3,
  LoaderCircle,
  Network,
  Search,
  Users,
  X,
} from "lucide-react";
import {
  kindLabels,
  type GraphData,
  type GraphMode,
  type OrganizationData,
  type OrgNode,
} from "@/lib/contracts";
const GraphCanvas = dynamic(() => import("./graph-canvas"), {
  ssr: false,
  loading: () => (
    <div className="center-state">
      <LoaderCircle className="spin" /> Подготовка визуализации…
    </div>
  ),
});
const format = (n: number) => new Intl.NumberFormat("ru-RU").format(n);
async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Не удалось загрузить данные.");
  }
  return response.json();
}
export function OrganizationExplorer() {
  const [organization, setOrganization] = useState<OrganizationData | null>(
    null,
  );
  const [data, setData] = useState<GraphData | null>(null);
  const [mode, setMode] = useState<GraphMode>("overview");
  const [department, setDepartment] = useState("");
  const [selected, setSelected] = useState<OrgNode | null>(null);
  const [showEdges, setShowEdges] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OrgNode[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    Promise.all([
      fetchJson<OrganizationData>("/api/organization", controller.signal),
      fetchJson<GraphData>(
        `/api/graph?mode=${mode}&department=${department}`,
        controller.signal,
      ),
    ])
      .then(([org, graph]) => {
        if (active) {
          setOrganization(org);
          setData(graph);
          setLoading(false);
        }
      })
      .catch((cause) => {
        if (controller.signal.aborted && !active) return;
        setError(
          controller.signal.aborted
            ? "Загрузка заняла слишком много времени. Повторите попытку."
            : cause.message,
        );
        setData(null);
        setLoading(false);
      })
      .finally(() => clearTimeout(timer));
    let active = true;
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [mode, department, retry]);
  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const timer = setTimeout(() => {
      fetchJson<{ nodes: OrgNode[] }>(
        `/api/search?q=${encodeURIComponent(query)}&department=${department}`,
        controller.signal,
      )
        .then((body) => {
          if (active) {
            setResults(body.nodes);
            setSearching(false);
          }
        })
        .catch(() => {
          if (active) {
            setSearchError("Поиск недоступен. Повторите запрос.");
            setSearching(false);
          }
        });
    }, 250);
    let active = true;
    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, department]);
  const changeView = (newMode: GraphMode, newDepartment: string) => {
    if (newMode === mode && newDepartment === department) return;
    setLoading(true);
    setError(null);
    setSelected(null);
    setSearchOpen(false);
    setQuery("");
    setResults([]);
    setSearchError(null);
    setMode(newMode);
    setDepartment(newDepartment);
  };
  const selectNode = useCallback(
    (node: OrgNode | null) => setSelected(node),
    [],
  );
  const selectSearch = (node: OrgNode) => {
    const nextMode = node.kind === "employee" ? "employees" : mode;
    changeView(nextMode, node.department_id ?? "");
    setSelected(node);
    setSearchOpen(false);
    setQuery("");
    setResults([]);
  };
  const departmentName = organization?.departments.find(
    (d) => d.id === department,
  )?.label;
  const current = data?.nodes.find((n) => n.id === selected?.id) ?? selected;
  const parent = data?.nodes.find((n) => n.id === current?.parent_id);
  const children = current
    ? (data?.nodes.filter((n) => n.parent_id === current.id) ?? [])
    : [];
  return (
    <div className="app-shell">
      <aside className="rail">
        <div className="brand-mark" aria-label="San.ai">
          s<span>.</span>
        </div>
        <div className="rail-divider" />
        <div className="rail-item active" title="Организационная структура">
          <Network size={22} />
        </div>
        <div className="rail-bottom">
          <span className="avatar">SA</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="brand-name">
            san<span>.ai</span>
            <span className="brand-separator">/</span>
            <span className="workspace-label">Рабочее пространство</span>
          </div>
          <span className="demo-pill">
            <FlaskConical size={13} /> Демо-среда
          </span>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">ОРГАНИЗАЦИОННАЯ АНАЛИТИКА</div>
              <h1>
                Вся структура. Одна картина<span>.</span>
              </h1>
              <p>
                Исследуйте подразделения, команды и связи между сотрудниками.
              </p>
            </div>
            <div className="dataset-tag">
              <span className="status-dot" /> DEMO DATASET{" "}
              <span className="dataset-version">v1.0</span>
            </div>
          </div>
          <section className="stats" aria-label="Статистика организации">
            {[
              {
                label: "Сотрудников",
                value: organization?.stats.employees,
                icon: Users,
                detail: "Синтетические записи",
              },
              {
                label: "Департаментов",
                value: organization?.stats.departments,
                icon: Building2,
                detail: "Функциональные направления",
              },
              {
                label: "Отделов",
                value: organization?.stats.teams,
                icon: GitBranch,
                detail: "По 10 в каждом департаменте",
              },
              {
                label: "Узлов на экране",
                value: loading ? undefined : data?.meta.nodeCount,
                icon: Network,
                detail:
                  mode === "overview"
                    ? "Обзор подразделений"
                    : "Включая сотрудников",
              },
            ].map(({ label, value, icon: Icon, detail }) => (
              <div className="stat" key={label}>
                <div className="stat-top">
                  {label}
                  <Icon size={17} />
                </div>
                <div className="stat-value">
                  {value === undefined ? "—" : format(value)}
                </div>
                <div className="stat-detail">{detail}</div>
              </div>
            ))}
          </section>
          <section className="explorer" aria-label="Обозреватель структуры">
            <div className="explorer-toolbar">
              <div className="explorer-title">
                <Network size={19} />
                <h2>Карта организации</h2>
              </div>
              <div className="mode-tabs" aria-label="Режим графа">
                <button
                  className={mode === "overview" ? "chosen" : ""}
                  aria-pressed={mode === "overview"}
                  onClick={() => changeView("overview", department)}
                >
                  Подразделения
                </button>
                <button
                  className={mode === "employees" ? "chosen" : ""}
                  aria-pressed={mode === "employees"}
                  onClick={() => changeView("employees", department)}
                >
                  Все сотрудники
                </button>
              </div>
            </div>
            <div className="explorer-body">
              <aside className="department-panel">
                <div className="panel-caption">СТРУКТУРА КОМПАНИИ</div>
                <button
                  className={`department-item root-item ${!department ? "selected" : ""}`}
                  onClick={() => changeView(mode, "")}
                >
                  <Building2 size={16} />
                  <span>Демо Телеком</span>
                  <ChevronRight size={14} />
                </button>
                <div className="department-list">
                  {organization?.departments.map((d, i) => (
                    <button
                      key={d.id}
                      className={`department-item ${department === d.id ? "selected" : ""}`}
                      onClick={() => changeView(mode, d.id)}
                    >
                      <span className={`department-dot color-${i % 5}`} />
                      <span>{d.label}</span>
                      <span className="department-count">
                        {format(d.employees)}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="panel-note">
                  <Database size={15} />
                  <span>
                    Данные из локального API
                    <br />
                    <strong>20 000 тестовых сотрудников</strong>
                  </span>
                </div>
              </aside>
              <div className="map-panel">
                <div className="map-toolbar">
                  <div className="search-wrap">
                    <Search size={16} />
                    <input
                      aria-label="Поиск сотрудников и подразделений"
                      placeholder="Найти сотрудника или подразделение…"
                      value={query}
                      maxLength={100}
                      onFocus={() => setSearchOpen(true)}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setResults([]);
                        setSearchError(null);
                        setSearching(event.target.value.trim().length >= 2);
                        setSearchOpen(true);
                      }}
                    />
                    {query && (
                      <button
                        aria-label="Очистить поиск"
                        onClick={() => {
                          setQuery("");
                          setResults([]);
                          setSearchOpen(false);
                        }}
                      >
                        <X size={14} />
                      </button>
                    )}
                    {searchOpen && query.trim().length >= 2 && (
                      <div className="search-results">
                        {searching ? (
                          <p>Поиск…</p>
                        ) : searchError ? (
                          <p role="alert">{searchError}</p>
                        ) : results.length === 0 ? (
                          <p>Ничего не найдено</p>
                        ) : (
                          <>
                            <div className="search-caption">
                              До 20 совпадений в выбранной области
                            </div>
                            {results.map((n) => (
                              <button
                                key={n.id}
                                onClick={() => selectSearch(n)}
                              >
                                <span>{n.label}</span>
                                <small>
                                  {kindLabels[n.kind]} · {n.id}
                                </small>
                              </button>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <label className="edges-toggle">
                    <input
                      type="checkbox"
                      checked={showEdges}
                      onChange={(e) => setShowEdges(e.target.checked)}
                    />{" "}
                    Связи
                  </label>
                </div>
                <div className="breadcrumbs">
                  <span
                    onClick={() => changeView(mode, "")}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") changeView(mode, "");
                    }}
                  >
                    Демо Телеком
                  </span>
                  <ChevronRight size={12} />
                  <strong>{departmentName ?? "Вся организация"}</strong>
                </div>
                <div className="map-content">
                  {loading ? (
                    <div className="center-state" role="status">
                      <LoaderCircle className="spin" size={25} />
                      <strong>Загружаем структуру</strong>
                      <span>
                        {mode === "employees"
                          ? "Подготавливаем сотрудников и связи…"
                          : "Получаем подразделения…"}
                      </span>
                    </div>
                  ) : error ? (
                    <div className="center-state" role="alert">
                      <CircleHelp size={28} />
                      <strong>Не удалось открыть структуру</strong>
                      <span>{error}</span>
                      <button
                        className="primary-button"
                        onClick={() => {
                          setLoading(true);
                          setError(null);
                          setRetry((r) => r + 1);
                        }}
                      >
                        Повторить
                      </button>
                    </div>
                  ) : !data?.nodes.length ? (
                    <div className="center-state">
                      <Layers3 size={28} />
                      <strong>В базе пока нет структуры</strong>
                      <span>Подготовьте демоданные: npm run db:seed</span>
                    </div>
                  ) : (
                    <GraphCanvas
                      data={data}
                      selected={selected?.id ?? null}
                      onSelect={selectNode}
                      showEdges={showEdges}
                    />
                  )}
                </div>
                <div className="map-footer">
                  <span>
                    <i className="legend-dot dark" /> Компания{" "}
                    <i className="legend-dot" /> Подразделения{" "}
                    {mode === "employees" && (
                      <>
                        <i className="legend-dot small" /> Сотрудники
                      </>
                    )}
                  </span>
                  <span>
                    {loading
                      ? "Загрузка…"
                      : `${format(data?.meta.edgeCount ?? 0)} связей`}
                    <span className="webgl-tag">WebGL</span>
                  </span>
                </div>
              </div>
              <aside className="detail-panel">
                <div className="panel-caption">
                  {current ? "ВЫБРАННЫЙ ОБЪЕКТ" : "ДЕТАЛИ ОБЪЕКТА"}
                  {current && (
                    <button
                      aria-label="Закрыть карточку"
                      onClick={() => setSelected(null)}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
                {current ? (
                  <>
                    <div className="detail-icon">
                      {current.kind === "employee" ? (
                        <Users size={25} />
                      ) : (
                        <Building2 size={25} />
                      )}
                    </div>
                    <span className="object-kind">
                      {kindLabels[current.kind]}
                    </span>
                    <h3>{current.label}</h3>
                    <span className="object-id">{current.id}</span>
                    <dl>
                      <dt>Роль</dt>
                      <dd>{current.role}</dd>
                      <dt>Город</dt>
                      <dd>{current.city}</dd>
                      <dt>Источник</dt>
                      <dd>Синтетический набор v1</dd>
                    </dl>
                    {parent && (
                      <div className="relationship">
                        <div>
                          <ArrowUpRight size={15} /> Подчинение / принадлежность
                        </div>
                        <button onClick={() => setSelected(parent)}>
                          {parent.label}
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    )}
                    {children.length > 0 && (
                      <div className="relationship">
                        <div>
                          <ArrowDownLeft size={15} /> Связанные объекты ·{" "}
                          {children.length}
                        </div>
                        {children.slice(0, 5).map((n) => (
                          <button key={n.id} onClick={() => setSelected(n)}>
                            {n.label}
                            <ChevronRight size={14} />
                          </button>
                        ))}
                        {children.length > 5 && (
                          <small>Ещё {children.length - 5} на карте</small>
                        )}
                      </div>
                    )}
                    {current.kind !== "employee" && mode === "overview" && (
                      <button
                        className="primary-button"
                        onClick={() =>
                          changeView("employees", current.department_id ?? "")
                        }
                      >
                        Показать сотрудников
                      </button>
                    )}
                  </>
                ) : (
                  <div className="detail-empty">
                    <div className="detail-icon">
                      <MousePointerIcon />
                    </div>
                    <h3>Начните с любого узла</h3>
                    <p>
                      Выберите объект на карте, чтобы увидеть его роль,
                      подразделение и связи.
                    </p>
                    <div className="tip">
                      <Search size={16} />
                      <span>
                        Или найдите сотрудника
                        <br />
                        по имени или ID
                      </span>
                    </div>
                  </div>
                )}
                <div className="detail-disclaimer">
                  <FlaskConical size={15} />
                  <p>
                    Учебная структура. Не отражает штат или организацию
                    Казахтелекома. AI-анализ пока не подключён.
                  </p>
                </div>
              </aside>
            </div>
          </section>
          <footer className="page-footer">
            <span>
              SAN.AI <span className="footer-dot">·</span> Организация
              становится понятнее
            </span>
            <span>
              Sigma.js + Graphology <span className="footer-dot">/</span> 20K
              demo
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function MousePointerIcon() {
  return <Network size={29} strokeWidth={1.4} />;
}
