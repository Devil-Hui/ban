const api = require('./api');

// Minimal offline fallback; runtime prefers GET /catalog/task-create taskStatuses from DB.
const FALLBACK_STATUS = {
  draft: '草稿',
  collecting: '收集中',
  ready: '待排班',
  solving: '求解中',
  reviewing: '方案评审',
  published: '已发布',
  adjusting: '调整中',
  failed: '失败',
  cancelled: '已取消',
  completed: '已完成',
};

const FALLBACK_ROLE = {
  owner: '发布者',
  admin: '管理员',
  member: '成员',
};

let cached = null;
let loading = null;

function loadCatalog() {
  if (cached) return Promise.resolve(cached);
  if (loading) return loading;
  loading = api
    .request('/catalog/task-create')
    .then((catalog) => {
      cached = {
        taskStatuses: catalog.taskStatuses || FALLBACK_STATUS,
        groupRoles: catalog.groupRoles || FALLBACK_ROLE,
        groupDefaultDescription: catalog.groupDefaultDescription || '',
      };
      return cached;
    })
    .catch(() => {
      cached = {
        taskStatuses: FALLBACK_STATUS,
        groupRoles: FALLBACK_ROLE,
        groupDefaultDescription: '',
      };
      return cached;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

function statusLabel(status, catalog) {
  const map = (catalog && catalog.taskStatuses) || FALLBACK_STATUS;
  return map[status] || status || '';
}

function roleLabel(role, catalog) {
  const map = (catalog && catalog.groupRoles) || FALLBACK_ROLE;
  return map[role] || role || '';
}

module.exports = {
  loadCatalog,
  statusLabel,
  roleLabel,
  FALLBACK_STATUS,
  FALLBACK_ROLE,
};
