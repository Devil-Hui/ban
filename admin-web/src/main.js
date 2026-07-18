import { api, getToken, setToken } from './api.js';

const app = document.getElementById('app');

const state = {
  token: getToken(),
  user: null,
  overview: null,
  settings: null,
  profiles: [],
  notify: null,
  audits: [],
  timeModes: [],
  loading: false,
  message: '',
  error: '',
  form: {
    defaultTimeMode: 'section_range',
    defaultProfileId: '',
  },
};

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setMsg(okText, errText) {
  state.message = okText || '';
  state.error = errText || '';
}

function modeLabelText(m) {
  if (m === 'section_range') return '节次+时段';
  if (m === 'section') return '节次';
  if (m === 'range') return '时间段';
  return m || '—';
}

async function login(username, password) {
  setMsg('', '');
  state.loading = true;
  render();
  try {
    const data = await api.login(username, password);
    setToken(data.accessToken);
    state.token = data.accessToken;
    state.user = data.user || { role: 'admin', username };
    await loadDashboard();
  } catch (e) {
    setMsg('', e.message || '登录失败');
  } finally {
    state.loading = false;
    render();
  }
}

function logout() {
  setToken('');
  state.token = '';
  state.user = null;
  state.overview = null;
  state.profiles = [];
  setMsg('', '');
  render();
}

async function loadDashboard() {
  setMsg('', '');
  state.loading = true;
  render();
  try {
    const [overview, settingsPack, notify, timeMeta, auditsPack] = await Promise.all([
      api.overview(),
      api.settings(),
      api.notifyTemplates().catch(() => null),
      api.timeConstants().catch(() => null),
      api.auditLogs({ page: 1, pageSize: 30 }).catch(() => ({ list: [] })),
    ]);
    state.overview = overview;
    state.settings = settingsPack.settings || {};
    state.profiles = settingsPack.profiles || [];
    state.notify = notify;
    state.audits = (auditsPack && auditsPack.list) || [];
    state.timeModes = Object.keys(
      (timeMeta && timeMeta.TIME_MODE_META) || {
        section: {},
        range: {},
        section_range: {},
      }
    );
    state.form.defaultTimeMode = state.settings.defaultTimeMode || 'section_range';
    state.form.defaultProfileId = state.settings.defaultProfileId || '';
    setMsg('已同步最新配置', '');
  } catch (e) {
    if (e.status === 401 || e.code === 4010 || e.code === 4011 || e.code === 4012) {
      logout();
      setMsg('', '登录已失效，请重新登录');
      return;
    }
    setMsg('', e.message || '加载失败');
  } finally {
    state.loading = false;
    render();
  }
}

async function saveSettings() {
  setMsg('', '');
  state.loading = true;
  render();
  try {
    const data = await api.putSettings({
      defaultTimeMode: state.form.defaultTimeMode,
      defaultProfileId: state.form.defaultProfileId,
    });
    state.settings = data.settings || state.form;
    setMsg('默认设置已保存', '');
    await loadDashboard();
  } catch (e) {
    setMsg('', e.message || '保存失败');
    state.loading = false;
    render();
  }
}

function renderLogin() {
  app.innerHTML = '';
  const card = el(`
    <div class="login-wrap">
      <div class="card login-card">
        <h1>排班运维台</h1>
        <p class="muted">H5 管理端 · 默认账号见 backend/.env 的 H5_ADMIN_*</p>
        <div class="field">
          <label>用户名</label>
          <input id="username" value="admin" autocomplete="username" />
        </div>
        <div class="field">
          <label>密码</label>
          <input id="password" type="password" value="admin123" autocomplete="current-password" />
        </div>
        <div id="alert"></div>
        <div class="row-actions">
          <button class="btn" id="loginBtn">${state.loading ? '登录中…' : '登录'}</button>
        </div>
      </div>
    </div>
  `);
  app.appendChild(card);
  if (state.loading) card.querySelector('#loginBtn').disabled = true;
  const alert = card.querySelector('#alert');
  if (state.error) alert.appendChild(el(`<div class="error">${esc(state.error)}</div>`));
  if (state.message) alert.appendChild(el(`<div class="ok">${esc(state.message)}</div>`));
  card.querySelector('#loginBtn').onclick = () => {
    const u = card.querySelector('#username').value.trim();
    const p = card.querySelector('#password').value;
    login(u, p);
  };
  card.querySelector('#password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') card.querySelector('#loginBtn').click();
  });
}

function renderDashboard() {
  const s = state.settings || {};
  const profiles = state.profiles || [];
  const notify = state.notify || {};
  const modeLabel = notify.mode === 'wechat_subscribe' ? '微信订阅 + 站内' : '仅站内消息';
  const modeClass = notify.mode === 'wechat_subscribe' ? 'tag-ok' : 'tag-warn';

  const modeOptions = (state.timeModes.length ? state.timeModes : ['section', 'range', 'section_range'])
    .map(
      (m) =>
        `<option value="${esc(m)}" ${
          state.form.defaultTimeMode === m ? 'selected' : ''
        }>${esc(m)}</option>`
    )
    .join('');
  const profileOptions = profiles
    .map(
      (p) =>
        `<option value="${esc(p.id)}" ${
          state.form.defaultProfileId === p.id ? 'selected' : ''
        }>${esc(p.name || p.id)}${p.isDefault ? '（默认）' : ''}</option>`
    )
    .join('');

  const rows = profiles
    .map((p) => {
      const slots = Array.isArray(p.slots) ? p.slots : [];
      const preview = slots
        .slice(0, 6)
        .map((x) => {
          const name = x.name || x.id || '';
          const se = x.start && x.end ? `${x.start}-${x.end}` : '';
          return `${name}${se ? ' ' + se : ''}`;
        })
        .join('\n');
      const more = slots.length > 6 ? `\n…共 ${slots.length} 个时段` : '';
      return `<tr>
        <td><code>${esc(p.id)}</code></td>
        <td>${esc(p.name || '—')}${p.isDefault ? ' <span class="tag">默认</span>' : ''}</td>
        <td>${esc(p.scope || 'system')}</td>
        <td>${slots.length}</td>
        <td class="slots">${esc(preview + more || '—')}</td>
      </tr>`;
    })
    .join('');

  const tmplRows = (notify.items || [])
    .map(
      (i) => `<tr>
      <td>${esc(i.key)}</td>
      <td>${esc(i.label || i.tmplName || '—')}</td>
      <td>${
        i.enabled
          ? '<span class="tag tag-ok">已配置</span>'
          : '<span class="tag tag-warn">未配置</span>'
      }</td>
      <td><code>${esc(i.templateId ? i.templateId.slice(0, 12) + '…' : '—')}</code></td>
    </tr>`
    )
    .join('');

  const tips = (state.overview && state.overview.tips) || [];
  const tipsHtml = tips.map((t) => `<li>${esc(t)}</li>`).join('') ||
    '<li>配置默认模板后，小程序建任务可少选一步</li>';

  app.innerHTML = '';
  const root = el(`
    <div class="layout">
      <div class="topbar">
        <div>
          <h1>排班运维台</h1>
          <div class="muted">管理员 · ${esc(
            (state.user && (state.user.username || state.user.nickname)) || 'admin'
          )}</div>
        </div>
        <div class="row-actions">
          <button class="btn btn-ghost" id="refreshBtn">刷新</button>
          <button class="btn btn-ghost" id="logoutBtn">退出</button>
        </div>
      </div>
      <div id="banner"></div>
      <div class="stat-row" style="margin-bottom:16px">
        <div class="stat"><div class="n">${esc(
          (state.overview && state.overview.profileCount) || profiles.length || 0
        )}</div><div class="l">系统作息模板</div></div>
        <div class="stat"><div class="n">${esc(
          modeLabelText(s.defaultTimeMode)
        )}</div><div class="l">默认 timeMode</div></div>
        <div class="stat"><div class="n"><span class="tag ${modeClass}">${esc(
          modeLabel
        )}</span></div><div class="l">通知模式</div></div>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <h2 style="margin:0 0 8px;font-size:16px">平台默认设置</h2>
          <p class="muted">影响小程序新建任务时的默认时段模式与作息模板。</p>
          <div class="field">
            <label>默认 timeMode</label>
            <select id="timeMode">${modeOptions}</select>
          </div>
          <div class="field">
            <label>默认 schedule profile</label>
            <select id="profileId">${profileOptions}</select>
          </div>
          <div class="row-actions">
            <button class="btn" id="saveBtn">${state.loading ? '保存中…' : '保存设置'}</button>
          </div>
          <p class="muted" style="margin-top:12px">当前：<code>${esc(
            s.defaultTimeMode || '—'
          )}</code> / <code>${esc(s.defaultProfileId || '—')}</code></p>
        </div>
        <div class="card">
          <h2 style="margin:0 0 8px;font-size:16px">运维提示</h2>
          <ul class="muted" style="margin:0;padding-left:18px;line-height:1.7">
            ${tipsHtml}
            <li>截止 worker：<code>cd backend &amp;&amp; npm run worker:deadline</code></li>
            <li>API 代理：Vite <code>/api</code> → <code>127.0.0.1:3000</code></li>
          </ul>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2 style="margin:0 0 12px;font-size:16px">系统作息模板</h2>
        <div style="overflow:auto">
          <table>
            <thead><tr><th>ID</th><th>名称</th><th>scope</th><th>时段数</th><th>预览</th></tr></thead>
            <tbody>${
              rows || '<tr><td colspan="5" class="muted">暂无模板，请先 db:seed</td></tr>'
            }</tbody>
          </table>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2 style="margin:0 0 12px;font-size:16px">订阅消息模板</h2>
        <p class="muted">只读展示后端 meta/notify-templates。改 ID 请编辑 backend/.env 与小程序 config。</p>
        <div style="overflow:auto">
          <table>
            <thead><tr><th>逻辑键</th><th>说明</th><th>状态</th><th>模板 ID</th></tr></thead>
            <tbody>${
              tmplRows || '<tr><td colspan="4" class="muted">无数据</td></tr>'
            }</tbody>
          </table>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2 style="margin:0 0 12px;font-size:16px">审计日志（只读）</h2>
        <p class="muted">关键写操作：建组/建任务/发布/改默认设置。失败不阻断主业务。</p>
        <div style="overflow:auto">
          <table>
            <thead><tr><th>时间</th><th>动作</th><th>目标</th><th>操作者</th></tr></thead>
            <tbody>${
              (state.audits || [])
                .map((a) => {
                  const t = a.createdAt ? String(a.createdAt).slice(0, 19).replace('T', ' ') : '—';
                  return `<tr>
                    <td>${esc(t)}</td>
                    <td><code>${esc(a.action || '—')}</code></td>
                    <td>${esc(a.targetType || '')}:${esc(a.targetId || '')}</td>
                    <td>${esc(a.operatorId != null ? a.operatorId : '—')}</td>
                  </tr>`;
                })
                .join('') || '<tr><td colspan="4" class="muted">暂无审计记录（执行 smoke 或业务写操作后出现）</td></tr>'
            }</tbody>
          </table>
        </div>
      </div>
    </div>
  `);
  app.appendChild(root);
  if (state.loading) {
    const saveBtn = root.querySelector('#saveBtn');
    if (saveBtn) saveBtn.disabled = true;
  }
  const banner = root.querySelector('#banner');
  if (state.error) {
    banner.appendChild(el(`<div class="error" style="margin-bottom:12px">${esc(state.error)}</div>`));
  }
  if (state.message) {
    banner.appendChild(el(`<div class="ok" style="margin-bottom:12px">${esc(state.message)}</div>`));
  }

  root.querySelector('#logoutBtn').onclick = logout;
  root.querySelector('#refreshBtn').onclick = () => loadDashboard();
  root.querySelector('#timeMode').onchange = (e) => {
    state.form.defaultTimeMode = e.target.value;
  };
  root.querySelector('#profileId').onchange = (e) => {
    state.form.defaultProfileId = e.target.value;
  };
  root.querySelector('#saveBtn').onclick = () => saveSettings();
}

function render() {
  if (!state.token) renderLogin();
  else renderDashboard();
}

if (state.token) {
  loadDashboard();
} else {
  render();
}
