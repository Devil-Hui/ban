import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, Bell, CalendarClock, CalendarDays, Cpu, LayoutDashboard, PanelsTopLeft, Search, ScrollText, ShieldCheck, Users, UsersRound } from "lucide-react";
import { adminGet, adminPatch, adminPost, demoMode, login } from "./api";
import "./styles.css";

const nav = [
  ["overview", "总览", ""],
  ["admins", "管理员账号", ""],
  ["users", "用户与权限", ""],
  ["groups", "分组管理", ""],
  ["tasks", "任务与排班", ""],
  ["notifications", "通知投递", ""],
  ["templates", "班次模板", ""],
  ["jobs", "求解队列", ""],
  ["audit", "审计日志", ""],
  ["system", "运行状态", ""],
];

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("zh-CN", { hour12: false });
}

function Icon({ name }) {
  const icons = { overview: LayoutDashboard, admins: ShieldCheck, users: Users, groups: UsersRound, tasks: CalendarClock, notifications: Bell, templates: PanelsTopLeft, jobs: Cpu, audit: ScrollText, system: Activity, search: Search };
  const Component = icons[name] || Activity;
  return <Component className={`icon icon-${name}`} size={17} strokeWidth={1.8} aria-hidden="true" />;
}
function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const session = await login(username, password, totpCode);
      localStorage.setItem("scheduling-admin-session", JSON.stringify(session));
      onLogin(session);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="login-page">
      <form className="login-panel" onSubmit={submit}>
        <div className="brand-mark"><CalendarDays size={22} strokeWidth={2.2} /></div>
        <span className="eyebrow">OPERATIONS CONSOLE</span>
        <h1>智能排班</h1>
        <p>使用独立运维账号登录</p>
        <label>
          账号
          <input
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>
        <label>
          密码
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <label>
          动态验证码（启用 MFA 时填写）
          <input
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={totpCode}
            onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ""))}
            placeholder="6 位验证码"
          />
        </label>
        {error && <div className="login-error">{error}</div>}
        <button className="primary-button" disabled={loading}>
          {loading ? "正在登录..." : "登录工作台"}
        </button>
      </form>
    </main>
  );
}

function App() {
  const [session, setSession] = useState(() => {
    if (demoMode)
      return { admin: { username: "张三", role: "superadmin" }, demo: true };
    try {
      return JSON.parse(localStorage.getItem("scheduling-admin-session"));
    } catch {
      return null;
    }
  });
  const [active, setActive] = useState("overview");
  const [query, setQuery] = useState("");
  const [overview, setOverview] = useState({ activeGroups: 0, activeTasks: 0, todayAssignments: 0, activeUsers: 0 });
  const [dashboardTasks, setDashboardTasks] = useState([]);
  const [system, setSystem] = useState(null);
  const [records, setRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  useEffect(() => {
    if (!session?.accessToken) return;
    Promise.all([
      adminGet("/admin/overview", session.accessToken),
      adminGet("/admin/tasks?limit=6", session.accessToken),
      adminGet("/admin/system", session.accessToken),
    ]).then(([summary, tasks, runtime]) => { setOverview(summary); setDashboardTasks(tasks); setSystem(runtime); }).catch(() => {});
  }, [session]);
  useEffect(() => {
    const path = {
      admins: "/admin/accounts",
      users: "/admin/users",
      groups: "/admin/groups",
      tasks: "/admin/tasks",
      notifications: "/admin/notifications",
      templates: "/admin/templates",
      jobs: "/admin/solver-jobs",
      audit: "/admin/audit",
    }[active];
    if (!path || !session?.accessToken) {
      setRecords([]);
      return;
    }
    setLoadingRecords(true);
    adminGet(path, session.accessToken)
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoadingRecords(false));
  }, [active, session]);
  const filtered = useMemo(() => dashboardTasks.filter((task) => `${task.title}${task.status}${task.group_id}`.includes(query)), [dashboardTasks, query]);
  if (!session) return <Login onLogin={setSession} />;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><CalendarDays size={20} strokeWidth={2.2} /></div>
          <div>
            <strong>智能排班</strong>
            <span>运营工作台</span>
          </div>
        </div>
        <div className="workspace">
          <span className="workspace-dot" />
          平台运营空间 <span className="chev">⌄</span>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([key, label, count]) => (
            <button
              key={key}
              className={`nav-item ${active === key ? "active" : ""}`}
              onClick={() => setActive(key)}
            >
              <Icon name={key} />
              <span>{label}</span>
              {count && <em>{count}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="health">
            <span className="health-dot" />
            {system?.services?.mysql === "up" && system?.services?.redis === "up" ? "全部服务正常" : "服务状态待确认"}
          </div>
          <div className="admin-profile">
            <div className="avatar">张</div>
            <div>
              <strong>{session.admin?.username || "管理员"}</strong>
              <span>
                {session.admin?.role === "superadmin" ? "超级管理员" : "管理员"}
              </span>
            </div>
            <span className="chev">⌄</span>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="header">
          <div>
            <span className="breadcrumb">
              工作台 /{" "}
              <strong>{nav.find((item) => item[0] === active)?.[1]}</strong>
            </span>
            <h1>{nav.find((item) => item[0] === active)?.[1]}</h1>
          </div>
          <div className="header-actions">
            <label className="search">
              <Icon name="search" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索用户、分组或任务"
              />
            </label>
            <button
              className="icon-button"
              onClick={() => setActive("notifications")}
              aria-label="通知"
            >
              <Bell size={18} strokeWidth={1.8} />{Boolean(system?.queues?.notifications) && <span className="unread" />}
            </button>
          </div>
        </header>
        <div className="content">
          {active === "overview" ? (
            <>
              <section className="welcome-band">
                <div>
                  <span className="eyebrow">OPERATIONS · LIVE DATA</span>
                  <h2>早上好，{session.admin?.username || "管理员"}</h2>
                  <p>这里是今天的运营概况，一切都在按计划进行。</p>
                </div>
                <div className="band-date">
                  <strong>{new Date().getDate()}</strong>
                  <span>
                    {new Date().toLocaleDateString("zh-CN", { weekday: "short" })}
                    <br />
                    {new Date().toLocaleDateString("zh-CN", { month: "long" })}
                  </span>
                </div>
              </section>
              <section className="metric-grid">
                <Metric
                  label="活跃分组"
                  value={String(overview.activeGroups)}
                  delta="实时"
                  detail="当前有效"
                  accent="green"
                />
                <Metric
                  label="活跃任务"
                  value={String(overview.activeTasks)}
                  delta="实时"
                  detail="进行中"
                  accent="blue"
                />
                <Metric
                  label="今日排班"
                  value={String(overview.todayAssignments)}
                  delta="实时"
                  detail="人次"
                  accent="orange"
                />
                <Metric
                  label="待处理事项"
                  value={String((system?.queues?.notifications || 0) + (system?.queues?.solver || 0))}
                  delta="队列中"
                  detail=""
                  accent="red"
                />
              </section>
              <section className="section-head">
                <div>
                  <h3>任务动态</h3>
                  <span>所有分组正在进行的排班任务</span>
                </div>
                <button
                  className="outline-button"
                  onClick={() => setActive("tasks")}
                >
                  查看全部 <span>→</span>
                </button>
              </section>
              <section className="table-card">
                <div className="table-head">
                  <span>任务名称</span>
                  <span>分组 ID</span>
                  <span>版本</span>
                  <span>状态</span>
                  <span>截止时间</span>
                  <span />
                </div>
                {filtered.map((task) => (
                  <div className="table-row" key={task.id}>
                    <div className="task-cell">
                      <div className="task-icon"><CalendarClock size={16} strokeWidth={1.8} /></div>
                      <div>
                        <strong>{task.title}</strong>
                        <span>{formatDate(task.updated_at)}</span>
                      </div>
                    </div>
                    <span className="muted code-cell">{task.group_id}</span>
                    <span className="muted">v{task.version || "-"}</span>
                    <Status value={task.status} />
                    <span className="muted">{formatDate(task.deadline)}</span>
                    <span />
                  </div>
                ))}
              </section>
              <div className="bottom-grid">
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <h3>服务健康</h3>
                      <span>来自当前 API 与基础设施</span>
                    </div>
                  </div>
                  <Operation label="MySQL" value={system?.services?.mysql === "up" ? "健康" : "异常"} tone={system?.services?.mysql === "up" ? "green" : "red"} />
                  <Operation label="Redis" value={system?.services?.redis === "up" ? "健康" : "异常"} tone={system?.services?.redis === "up" ? "green" : "red"} />
                  <Operation label="数据库迁移" value={system?.migration?.name || "未读取"} />
                  <Operation label="备份策略" value={system?.backup?.configured ? "已配置" : "需配置"} tone={system?.backup?.configured ? "green" : "red"} />
                </section>
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <h3>需要关注</h3>
                      <span>最近的异常和提醒</span>
                    </div>
                    <button className="text-button" onClick={() => setActive("notifications")}>查看投递</button>
                  </div>
                  <Attention
                    icon="!"
                    tone="orange"
                    title={`${system?.queues?.notifications || 0} 条通知等待投递`}
                    detail="可在通知投递中查看和重试"
                  />
                  <Attention
                    icon="×"
                    tone="red"
                    title={`${system?.queues?.solver || 0} 个求解任务运行中`}
                    detail="可在求解队列查看进度与错误"
                  />
                  <Attention
                    icon="✓"
                    tone="green"
                    title="备份由外部脚本托管"
                    detail="恢复演练以校验清单为准"
                  />
                </section>
              </div>
            </>
          ) : (
            <ReadOnlyModule
              active={active}
              records={records}
              loading={loadingRecords}
              session={session}
              system={system}
              onSystem={setSystem}
            />
          )}
        </div>
      </main>
    </div>
  );
}
function ReadOnlyModule({ active, records, loading, session, system, onSystem }) {
  const samples = {
    admins: [
      {
        username: "superadmin",
        role: "superadmin",
        status: "active",
        updated_at: "刚刚",
      },
    ],
    users: [
      { nickname: "小明", status: "active", updated_at: "刚刚" },
      { nickname: "小红", status: "active", updated_at: "10 分钟前" },
    ],
    groups: [
      { name: "计科202值班群", status: "active", updated_at: "刚刚" },
      { name: "学生会值班", status: "active", updated_at: "今天 09:20" },
    ],
    tasks: [
      { title: "暂无任务数据", status: "-", deadline: "-" },
    ],
    notifications: [],
    templates: [],
    jobs: [],
    audit: [
      {
        action: "schedule.publish",
        target_type: "task",
        request_id: "req_92d1",
        created_at: "今天 09:41",
      },
      {
        action: "group.member.join",
        target_type: "member",
        request_id: "req_83aa",
        created_at: "今天 09:32",
      },
    ],
  };
  if (active === "system")
    return (
      <div className="operations-grid">
        <section className="panel operation-block">
          <div className="panel-head">
            <div>
              <h3>运行参数</h3>
              <span>生产值由环境变量和版本化配置注入</span>
            </div>
          </div>
          <Operation label="MySQL 8.4" value={system?.services?.mysql === "up" ? "健康" : "异常"} tone={system?.services?.mysql === "up" ? "green" : "red"} />
          <Operation label="Redis" value={system?.services?.redis === "up" ? "健康" : "异常"} tone={system?.services?.redis === "up" ? "green" : "red"} />
          <Operation label="微信接口" value={system?.backup?.mode ? "按环境配置" : "未读取"} />
          <Operation label="手机号加密" value="AES-256-GCM" />
          <Operation label="数据保留" value="通知 90 天 · 审计 1 年" />
        </section>
        <section className="panel operation-block">
          <div className="panel-head">
            <div>
              <h3>服务健康</h3>
              <span>最近一次检查</span>
            </div>
          </div>
          <Operation label="通知队列" value={`${system?.queues?.notifications || 0} 待处理`} />
          <Operation label="求解队列" value={`${system?.queues?.solver || 0} 运行中`} />
          <Operation label="备份策略" value={system?.backup?.configured ? "外部脚本已配置" : "需配置"} tone={system?.backup?.configured ? "green" : "red"} />
          <Operation label="迁移版本" value={system?.migration?.name || "未读取"} />
        </section>
      </div>
    );
  const data = session.demo ? samples[active] || [] : records;
  const columns =
    active === "admins"
      ? [
          ["username", "账号"],
          ["role", "角色"],
          ["status", "状态"],
          ["updated_at", "最近更新"],
        ]
      : active === "users"
        ? [
            ["nickname", "用户"],
            ["status", "状态"],
            ["updated_at", "最近更新"],
            ["action", "操作"],
          ]
        : active === "groups"
          ? [
              ["name", "分组"],
              ["status", "状态"],
              ["updated_at", "最近更新"],
            ]
        : active === "tasks"
            ? [
                ["title", "任务"],
                ["status", "状态"],
                ["deadline", "截止时间"],
              ]
            : active === "notifications"
              ? [["event_type", "事件"], ["status", "状态"], ["attempts", "尝试次数"], ["last_error", "最近错误"], ["created_at", "时间"], ["action", "操作"]]
              : active === "templates"
                ? [["name", "模板"], ["group_name", "分组"], ["period_count", "时段数"], ["is_reusable", "可复用"], ["updated_at", "更新"]]
                : active === "jobs"
                  ? [["title", "任务"], ["status", "状态"], ["progress", "进度"], ["attempts", "尝试次数"], ["updated_at", "更新"]]
            : [
                ["action", "操作"],
                ["target_type", "对象"],
                ["request_id", "请求 ID"],
                ["created_at", "时间"],
              ];
  async function createAdmin() {
    const username = window.prompt("管理员账号");
    const password = window.prompt("初始密码（至少 12 位）");
    if (!username || !password) return;
    try {
      await adminPost("/admin/accounts", session.accessToken, {
        username,
        password,
        role: "admin",
      });
      window.location.reload();
    } catch (error) {
      window.alert(error.message);
    }
  }
  async function toggleUser(row) {
    try {
      await adminPatch(`/admin/users/${row.id}/status`, session.accessToken, {
        status: row.status === "banned" ? "active" : "banned",
      });
      window.location.reload();
    } catch (error) {
      window.alert(error.message);
    }
  }
  async function retryNotification(row) {
    try { await adminPost(`/admin/notifications/${row.id}/retry`, session.accessToken, {}); window.location.reload(); }
    catch (error) { window.alert(error.message); }
  }
  return (
    <section>
      <div className="section-head operations-title">
        <div>
          <h3>{nav.find((item) => item[0] === active)?.[1]}</h3>
          <span>
            {active === "admins"
              ? "独立管理员身份域 · 密码只存 Argon2id 哈希"
              : active === "notifications"
                ? "事务 Outbox 只读监控 · 失败投递可重新入队"
                : active === "system"
                  ? "依赖、队列、迁移与备份策略的运行状态"
                  : "平台只读视图 · 分组业务数据不可在 H5 修改"}
          </span>
        </div>
        {active === "admins" && session.admin?.role === "superadmin" && (
          <button
            className="primary-button inline-button"
            onClick={createAdmin}
          >
            创建管理员
          </button>
        )}
      </div>
      <div className="operations-table">
        <div className="operations-row operations-head">
          {columns.map(([, label]) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        {loading ? (
          <div className="operations-empty">正在加载...</div>
        ) : data.length ? (
          data.map((row, index) => (
            <div className="operations-row" key={index}>
              {columns.map(([key]) =>
                active === "users" && key === "action" ? (
                  <button
                    className="text-button"
                    key={key}
                    onClick={() => toggleUser(row)}
                  >
                    {row.status === "banned" ? "恢复" : "封禁"}
                  </button>
                ) : active === "notifications" && key === "action" ? (
                  <button className="text-button" key={key} onClick={() => retryNotification(row)} disabled={row.status === "sent"}>重试</button>
                ) : (
                  <span key={key}>{key === "is_reusable" ? (row[key] ? "是" : "否") : key === "created_at" || key === "updated_at" ? formatDate(row[key]) : String(row[key] ?? "-")}</span>
                ),
              )}
            </div>
          ))
        ) : (
          <div className="operations-empty">暂无记录</div>
        )}
      </div>
    </section>
  );
}
function Operation({ label, value, tone }) {
  return (
    <div className="operation-row">
      <span>{label}</span>
      <strong className={tone || ""}>{value}</strong>
    </div>
  );
}
function Metric({ label, value, delta, detail, accent }) {
  return (
    <article className="metric">
      <div className={`metric-icon ${accent}`}>
        <Icon
          name={
            accent === "green"
              ? "groups"
              : accent === "blue"
                ? "tasks"
                : accent === "orange"
                  ? "overview"
                  : "audit"
          }
        />
      </div>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <div>
        <span className={`delta ${accent}`}>{delta}</span>
        <span className="metric-detail">{detail}</span>
      </div>
    </article>
  );
}
function Status({ value }) {
  const labels = { collecting: "收集中", ready: "待生成", solving: "求解中", reviewing: "待审核", adjusting: "调整中", published: "已发布", completed: "已完成", sent: "已送达", pending: "待投递", failed: "失败", running: "运行中" };
  const tone = ["published", "completed", "sent"].includes(value) ? "done" : ["ready", "solving", "reviewing", "running"].includes(value) ? "ready" : value === "failed" ? "red" : "collecting";
  return (
    <span className={`status ${tone}`}>
      <i />
      {labels[value] || value || "-"}
    </span>
  );
}
function Attention({ icon, tone, title, detail }) {
  return (
    <div className="attention">
      <span className={`attention-icon ${tone}`}>{icon}</span>
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <span className="arrow">›</span>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
