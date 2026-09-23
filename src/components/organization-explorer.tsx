"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
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
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Users,
  X,
} from "lucide-react";
import {
  kindLabels,
  type BranchData,
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
  const [data, setData] = useState<BranchData | null>(null);
  const [rootId, setRootId] = useState("company");
  const [page, setPage] = useState(0);
  const department =
    data?.breadcrumbs.find((n) => n.kind === "department")?.id ?? "";
  const [selected, setSelected] = useState<OrgNode | null>(null);
  const [showEdges, setShowEdges] = useState(true);
  const [structureOpen, setStructureOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const structureToggle = useRef<HTMLButtonElement>(null);
  const detailsToggle = useRef<HTMLButtonElement>(null);
  const openDetails = useCallback(() => {
    setDetailsOpen(true);
    if (window.matchMedia("(max-width: 900px)").matches)
      setStructureOpen(false);
  }, []);
  const closeDetails = () => {
    setDetailsOpen(false);
    detailsToggle.current?.focus();
  };
  const closeStructure = () => {
    setStructureOpen(false);
    structureToggle.current?.focus();
  };
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
      fetchJson<BranchData>(
        `/api/branch?root=${encodeURIComponent(rootId)}&page=${page}`,
        controller.signal,
      ),
    ])
      .then(([org, graph]) => {
        if (active) {
          setOrganization(org);
          setData(graph);
          setSelected(
            rootId === "company"
              ? null
              : (graph.nodes.find((n) => n.id === rootId) ?? null),
          );
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
  }, [rootId, page, retry]);
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
  const changeView = useCallback(
    (newRoot: string, nextPage = 0) => {
      if (newRoot === rootId && nextPage === page) return;
      setLoading(true);
      setError(null);
      setSelected(null);
      setSearchOpen(false);
      setQuery("");
      setResults([]);
      setSearchError(null);
      setRootId(newRoot);
      setPage(nextPage);
    },
    [rootId, page],
  );
  const selectNode = useCallback(
    (node: OrgNode | null) => {
      const item = data?.nodes.find((n) => n.id === node?.id);
      if (item && item.id !== rootId && item.child_count > 0)
        changeView(item.id);
      else {
        setSelected(node);
        if (node) openDetails();
      }
    },
    [data, rootId, changeView, openDetails],
  );
  const selectSearch = (node: OrgNode) => {
    openDetails();
    changeView(node.id);
    setSelected(node);
    setSearchOpen(false);
    setQuery("");
    setResults([]);
  };
  const current = data?.nodes.find((n) => n.id === selected?.id) ?? selected;
  const parent = [...(data?.nodes ?? []), ...(data?.breadcrumbs ?? [])].find(
    (n) => n.id === current?.parent_id,
  );
  const children = current
    ? (data?.nodes.filter((n) => n.parent_id === current.id) ?? [])
    : [];
  return (
    <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">ОРГАНИЗАЦИОННАЯ АНАЛИТИКА</div>
              <p>
                Исследуйте подразделения, команды и связи между сотрудниками.
              </p>
            </div>
          </div>
          <section className="explorer" aria-label="Обозреватель структуры">
            <div className="explorer-toolbar">
              <div className="explorer-title">
                <button
                  ref={structureToggle}
                  className="panel-toggle"
                  aria-label={
                    structureOpen
                      ? "Свернуть структуру компании"
                      : "Развернуть структуру компании"
                  }
                  title={
                    structureOpen
                      ? "Свернуть структуру"
                      : "Развернуть структуру"
                  }
                  aria-expanded={structureOpen}
                  aria-controls="company-structure"
                  onClick={() => {
                    setStructureOpen(!structureOpen);
                    if (
                      !structureOpen &&
                      window.matchMedia("(max-width: 900px)").matches
                    )
                      setDetailsOpen(false);
                  }}
                >
                  {structureOpen ? (
                    <PanelLeftClose size={19} />
                  ) : (
                    <PanelLeftOpen size={19} />
                  )}
                </button>
                <Network size={19} />
                <h2>Карта организации</h2>
              </div>
              <div className="level-navigation">
                <span>
                  {rootId === "company"
                    ? "Круговой обзор"
                    : "Дерево сверху вниз"}
                </span>
                <button
                  disabled={loading || rootId === "company"}
                  onClick={() =>
                    changeView(data?.breadcrumbs.at(-2)?.id ?? "company")
                  }
                >
                  ← На уровень выше
                </button>
                <button
                  ref={detailsToggle}
                  className="panel-toggle"
                  aria-label={
                    detailsOpen
                      ? "Скрыть детали объекта"
                      : "Показать детали объекта"
                  }
                  title={detailsOpen ? "Скрыть детали" : "Показать детали"}
                  aria-expanded={detailsOpen}
                  aria-controls="object-details"
                  onClick={() => (detailsOpen ? closeDetails() : openDetails())}
                >
                  {detailsOpen ? (
                    <PanelRightClose size={19} />
                  ) : (
                    <PanelRightOpen size={19} />
                  )}
                  <span>Детали</span>
                </button>
              </div>
            </div>
            <div
              className={`explorer-body ${structureOpen ? "structure-open" : ""} ${detailsOpen ? "details-open" : ""}`}
            >
              {!structureOpen && (
                <aside
                  className="structure-mini"
                  aria-label="Свёрнутая структура"
                >
                  <button
                    title="Развернуть структуру компании"
                    aria-label="Развернуть структуру компании"
                    aria-expanded={false}
                    aria-controls="company-structure"
                    onClick={() => {
                      setStructureOpen(true);
                      if (window.matchMedia("(max-width: 900px)").matches)
                        setDetailsOpen(false);
                    }}
                  >
                    <GitBranch size={20} />
                  </button>
                  <button
                    title="Вся компания"
                    aria-label="Вернуться к компании"
                    onClick={() => changeView("company")}
                  >
                    <Building2 size={19} />
                  </button>
                </aside>
              )}
              {structureOpen && (
                <aside
                  id="company-structure"
                  className="department-panel"
                  aria-label="Структура компании"
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      closeStructure();
                    }
                  }}
                >
                  <div className="panel-caption">
                    СТРУКТУРА КОМПАНИИ
                    <button
                      aria-label="Свернуть панель структуры"
                      onClick={closeStructure}
                    >
                      <PanelLeftClose size={17} />
                    </button>
                  </div>
                  <button
                    className={`department-item root-item ${!department ? "selected" : ""}`}
                    onClick={() => changeView("company")}
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
                        onClick={() => changeView(d.id)}
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
              )}
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
                <nav className="breadcrumbs" aria-label="Путь в структуре">
                  {(data?.breadcrumbs ?? []).map((node, index, list) => (
                    <span key={node.id} className="crumb">
                      {index > 0 && <ChevronRight size={12} />}
                      <button
                        disabled={loading || index === list.length - 1}
                        onClick={() => changeView(node.id)}
                        aria-current={
                          index === list.length - 1 ? "page" : undefined
                        }
                      >
                        {node.label}
                      </button>
                    </span>
                  ))}
                </nav>
                <div className="map-content">
                  {loading ? (
                    <div className="center-state" role="status">
                      <LoaderCircle className="spin" size={25} />
                      <strong>Загружаем структуру</strong>
                      <span>
                        Загружаем только текущий уровень и прямые связи…
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
                {data && !loading && !error && (
                  <div className="branch-pagination">
                    <span>
                      {data.meta.totalChildren === 0
                        ? "Нет вложенных объектов"
                        : `Объекты ${page * data.meta.pageSize + 1}–${Math.min((page + 1) * data.meta.pageSize, data.meta.totalChildren)} из ${data.meta.totalChildren}`}
                    </span>
                    <div>
                      <button
                        disabled={page === 0}
                        onClick={() => changeView(rootId, page - 1)}
                      >
                        ← Назад
                      </button>
                      <button
                        disabled={
                          (page + 1) * data.meta.pageSize >=
                          data.meta.totalChildren
                        }
                        onClick={() => changeView(rootId, page + 1)}
                      >
                        Далее →
                      </button>
                    </div>
                  </div>
                )}
                <div className="map-footer">
                  <span>
                    <i className="legend-dot dark" /> Компания{" "}
                    <i className="legend-dot" /> Подразделения{" "}
                    <i className="legend-dot small" /> Сотрудники
                  </span>
                  <span>
                    {loading
                      ? "Загрузка…"
                      : `${format(data?.meta.edgeCount ?? 0)} связей`}
                    <span className="webgl-tag">WebGL</span>
                  </span>
                </div>
              </div>
              {detailsOpen && (
                <aside
                  id="object-details"
                  className="detail-panel"
                  aria-label="Детали объекта"
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      closeDetails();
                    }
                  }}
                >
                  <div className="panel-caption">
                    {current ? "ВЫБРАННЫЙ ОБЪЕКТ" : "ДЕТАЛИ ОБЪЕКТА"}
                    <button
                      aria-label="Закрыть панель деталей"
                      onClick={closeDetails}
                    >
                      <X size={17} />
                    </button>
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
                            <ArrowUpRight size={15} /> Подчинение /
                            принадлежность
                          </div>
                          <button onClick={() => changeView(parent.id)}>
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
                            <button key={n.id} onClick={() => selectNode(n)}>
                              {n.label}
                              <ChevronRight size={14} />
                            </button>
                          ))}
                          {children.length > 5 && (
                            <small>Ещё {children.length - 5} на карте</small>
                          )}
                        </div>
                      )}
                      {current.id !== rootId &&
                        (data?.nodes.find((n) => n.id === current.id)
                          ?.child_count ?? 0) > 0 && (
                          <button
                            className="primary-button"
                            onClick={() => changeView(current.id)}
                          >
                            Открыть следующий уровень
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
                        Нажмите на подразделение или руководителя, чтобы открыть
                        следующий уровень. У сотрудника без подчинённых
                        откроется карточка.
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
              )}
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
  );
}
function MousePointerIcon() {
  return <Network size={29} strokeWidth={1.4} />;
}
