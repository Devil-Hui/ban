// pages/public-result/public-result.js —— 公示结果页
// 真数据：GET /tasks/{id} → finalSchedule.assignments + periods + 成员
// 演示：无 taskId / T00* 仍用本地 mock
const tasksApi = require('../../services/tasks');
const groupsApi = require('../../services/groups');
const { ensureLogin } = require('../../utils/auth');

function ymd(d) {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

function initialOf(name) {
  const s = String(name || '').trim();
  return s ? s[0] : '?';
}

function isDemoTaskId(taskId) {
  return !taskId || String(taskId).indexOf('T00') === 0;
}

function formatPublishTime(v) {
  if (!v) return '—';
  const s = String(v).replace('T', ' ');
  // 尽量展示 MM月DD日 HH:mm
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T]?(\d{2})?:?(\d{2})?/);
  if (!m) return s.slice(0, 16);
  const mon = Number(m[2]);
  const day = Number(m[3]);
  const hh = m[4] || '00';
  const mm = m[5] || '00';
  return mon + '月' + day + '日 ' + hh + ':' + mm;
}

function styleLabelFromTask(task) {
  const mode = task.timeMode || task.time_mode || '';
  if (mode === 'period' || mode === 'periods') return '节次样式';
  if (mode === 'custom') return '自定义样式';
  if (mode === 'clock' || mode === 'time') return '时间段样式';
  return '排班样式';
}

Page({
  data: {
    taskId: '',
    loading: false,
    isPublisher: true,
    shareToken: '',
    taskTitle: '本周实验室值班',
    publisherName: '发布者',
    publishTime: '—',
    styleLabel: '时间段样式',
    assignedCount: 0,
    weekLabels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    calWeekStart: '',
    calWeekLabel: '',
    weekDays: [],
    rows: [],
    personSummary: [],
    cellDetail: null,
    // 内部渲染用缓存（不进 data 也行，但 setData 方便调试）
    _periods: [],
    _assignments: [],
    _members: [],
  },

  onLoad(opts) {
    const taskId = (opts && (opts.taskId || opts.id)) || '';
    const isPublisher =
      opts && opts.role === 'member' ? false : opts && opts.role === 'joiner' ? false : true;
    this.setData({ taskId, isPublisher });

    const today = new Date();
    const dayOfWeek = today.getDay() || 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayOfWeek + 1);
    this.setData({ calWeekStart: ymd(monday) }, () => {
      this.buildWeekDays();
      this.bootstrap();
    });
  },

  async bootstrap() {
    if (isDemoTaskId(this.data.taskId)) {
      this.applyDemoFallback();
      return;
    }
    await this.loadFromServer();
  },

  formatDate(d) {
    return ymd(d);
  },

  buildWeekDays() {
    const { calWeekStart, weekLabels } = this.data;
    if (!calWeekStart) return;
    const [y, m, d] = calWeekStart.split('-').map(Number);
    const todayStr = ymd(new Date());
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(y, m - 1, d + i);
      const dateStr = ymd(date);
      days.push({
        key: 'd' + i,
        weekday: weekLabels[i],
        dateShort:
          String(date.getMonth() + 1).padStart(2, '0') +
          '/' +
          String(date.getDate()).padStart(2, '0'),
        dateStr,
        isToday: dateStr === todayStr,
      });
    }
    const weekEnd = new Date(y, m - 1, d + 6);
    this.setData({
      weekDays: days,
      calWeekLabel: calWeekStart + ' 至 ' + ymd(weekEnd),
    });
  },

  prevWeek() {
    const [y, m, d] = this.data.calWeekStart.split('-').map(Number);
    const prev = new Date(y, m - 1, d - 7);
    this.setData({ calWeekStart: ymd(prev) }, () => {
      this.buildWeekDays();
      this.renderGridFromCache();
    });
  },

  nextWeek() {
    const [y, m, d] = this.data.calWeekStart.split('-').map(Number);
    const next = new Date(y, m - 1, d + 7);
    this.setData({ calWeekStart: ymd(next) }, () => {
      this.buildWeekDays();
      this.renderGridFromCache();
    });
  },

  /** 演示数据（无真实 taskId） */
  applyDemoFallback() {
    this._useServer = false;
    this.initGridDemo();
    this.initPersonSummaryFromRows();
  },

  initGridDemo() {
    const times = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
    const members = ['红', '刚', '丽', '明'];
    const riskRows = [2, 3];
    const rows = times.map((t, rowIdx) => {
      const cells = [];
      for (let d = 0; d < 7; d++) {
        const locked = d >= 5 && rowIdx >= 5;
        if (locked) {
          cells.push({
            assigned: false,
            locked: true,
            memberName: '',
            memberId: '',
            riskLevel: 'none',
          });
        } else {
          const m = members[(d + rowIdx) % members.length];
          const isRisk = riskRows.indexOf(rowIdx) >= 0;
          cells.push({
            assigned: true,
            locked: false,
            memberName: m,
            memberId: m,
            riskLevel: isRisk ? 'high' : 'normal',
          });
        }
      }
      return { rowIdx, start: t, end: '', cells };
    });
    let count = 0;
    rows.forEach((r) =>
      r.cells.forEach((c) => {
        if (c.assigned) count++;
      })
    );
    this.setData({ rows, assignedCount: count });
  },

  initPersonSummaryFromRows() {
    const map = {};
    (this.data.rows || []).forEach((r) => {
      (r.cells || []).forEach((c) => {
        if (!c.assigned) return;
        const key = c.memberId || c.memberName || '?';
        if (!map[key]) {
          map[key] = {
            id: key,
            name: c.memberName || key,
            initial: initialOf(c.memberName || key),
            count: 0,
          };
        }
        map[key].count += 1;
      });
    });
    const summary = Object.keys(map).map((k) => map[k]);
    const max = Math.max.apply(
      null,
      summary.map((s) => s.count).concat([1])
    );
    summary.forEach((s) => {
      s.percent = Math.round((s.count / max) * 100);
    });
    summary.sort((a, b) => b.count - a.count);
    this.setData({ personSummary: summary });
  },

  async loadFromServer() {
    const taskId = this.data.taskId;
    this.setData({ loading: true });
    try {
      await ensureLogin();
      const task = await tasksApi.getOne(taskId);
      if (!task || !task.id) {
        wx.showToast({ title: '任务不存在', icon: 'none' });
        this.applyDemoFallback();
        return;
      }

      const finalSchedule = task.finalSchedule || task.final_schedule || {};
      const assignments = finalSchedule.assignments || [];
      const periods = (task.periods || []).map((p, i) => ({
        id: p.id || p.periodId || 'p' + i,
        start: p.start || '',
        end: p.end || '',
        name: p.name || p.label || '',
      }));

      let members = [];
      if (task.groupId) {
        try {
          members = await groupsApi.listMembers(task.groupId);
        } catch (_) {
          members = [];
        }
      }
      members = (members || []).map((m) => ({
        id: m.userId || m.id,
        name: m.name || m.nickname || m.displayName || '成员',
        initial: initialOf(m.name || m.nickname || m.displayName),
      }));

      // 周对齐：优先任务开始日，否则第一笔 assignment 日期
      let calWeekStart = this.data.calWeekStart;
      const rangeStart =
        task.dateRangeStart ||
        task.date_start ||
        (assignments[0] && assignments[0].date);
      if (rangeStart) {
        const [y, m, d] = String(rangeStart).slice(0, 10).split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        const dow = dt.getDay() || 7;
        const mon = new Date(dt);
        mon.setDate(dt.getDate() - dow + 1);
        calWeekStart = ymd(mon);
      }

      const role = task.myRole || task.roleInGroup || '';
      const isPublisher =
        role === 'publisher' || role === 'owner' || this.data.isPublisher;

      this._useServer = true;
      this._periods = periods.length
        ? periods
        : [
            { id: 'p1', start: '08:00', end: '10:00', name: '时段1' },
            { id: 'p2', start: '10:00', end: '12:00', name: '时段2' },
          ];
      this._assignments = assignments;
      this._members = members;

      this.setData(
        {
          taskTitle: task.title || '排班任务',
          publisherName: task.publisherName || task.publisher_name || '发布者',
          publishTime: formatPublishTime(task.publishedAt || task.published_at),
          styleLabel: styleLabelFromTask(task),
          shareToken: task.shareToken || task.share_token || '',
          isPublisher,
          calWeekStart,
          _periods: this._periods,
          _assignments: assignments,
          _members: members,
        },
        () => {
          this.buildWeekDays();
          this.renderGridFromCache();
          if (!assignments.length) {
            wx.showToast({ title: '暂无已发布方案', icon: 'none' });
          }
        }
      );
    } catch (_) {
      // request 已 toast；降级演示
      this.applyDemoFallback();
    } finally {
      this.setData({ loading: false });
    }
  },

  /** 用缓存 assignments 填当前周格子 + 个人汇总 */
  renderGridFromCache() {
    if (!this._useServer) {
      // 演示周切换不重建随机表，保持现状
      return;
    }
    const periods = this._periods || this.data._periods || [];
    const assignments = this._assignments || this.data._assignments || [];
    const members = this._members || this.data._members || [];
    const weekDays = this.data.weekDays || [];

    const nameById = {};
    members.forEach((m) => {
      nameById[m.id] = m;
    });

    // date|periodId → { names, ids, risk }
    const map = {};
    assignments.forEach((a) => {
      const date = a.date ? String(a.date).slice(0, 10) : '';
      const pid = String(a.periodId || '');
      const key = date + '|' + pid;
      const uids = a.userIds || [];
      const unames = a.userNames || [];
      const names = uids.map((uid, i) => {
        const m = nameById[uid];
        return (m && m.name) || unames[i] || String(uid);
      });
      map[key] = {
        userIds: uids,
        names,
        // 后端未标 risk 时：单人且时段名含风险/午休则 high，否则 normal
        riskLevel: uids.length <= 1 ? 'high' : 'normal',
      };
    });

    const rows = periods.map((p, rowIdx) => {
      const cells = [];
      for (let d = 0; d < 7; d++) {
        const dateStr = weekDays[d] ? weekDays[d].dateStr : '';
        const key = dateStr + '|' + p.id;
        const hit = map[key];
        if (hit && hit.names && hit.names.length) {
          // 格子展示首个姓名（多人以「名+N」）
          const display =
            hit.names.length === 1
              ? hit.names[0]
              : hit.names[0] + '+' + (hit.names.length - 1);
          cells.push({
            assigned: true,
            locked: false,
            memberName: display,
            memberId: (hit.userIds && hit.userIds[0]) || '',
            memberNames: hit.names,
            memberIds: hit.userIds,
            riskLevel: hit.names.length <= 1 ? 'high' : 'normal',
            dateStr,
            periodId: p.id,
          });
        } else {
          cells.push({
            assigned: false,
            locked: false,
            memberName: '',
            memberId: '',
            memberNames: [],
            memberIds: [],
            riskLevel: 'none',
            dateStr,
            periodId: p.id,
          });
        }
      }
      return {
        rowIdx,
        start: p.start || p.name || p.id,
        end: p.end || '',
        periodId: p.id,
        cells,
      };
    });

    let count = 0;
    rows.forEach((r) =>
      r.cells.forEach((c) => {
        if (c.assigned) count++;
      })
    );

    // 个人汇总：按 userId 计数
    const countByUser = {};
    assignments.forEach((a) => {
      (a.userIds || []).forEach((uid, i) => {
        if (!countByUser[uid]) {
          const m = nameById[uid];
          const name =
            (m && m.name) ||
            (a.userNames && a.userNames[i]) ||
            String(uid);
          countByUser[uid] = {
            id: uid,
            name,
            initial: (m && m.initial) || initialOf(name),
            count: 0,
          };
        }
        countByUser[uid].count += 1;
      });
    });
    // 若 assignment 只有 userNames 无 id
    if (!Object.keys(countByUser).length) {
      assignments.forEach((a) => {
        (a.userNames || []).forEach((name, i) => {
          const key = 'n:' + name;
          if (!countByUser[key]) {
            countByUser[key] = {
              id: key,
              name,
              initial: initialOf(name),
              count: 0,
            };
          }
          countByUser[key].count += 1;
        });
      });
    }
    const personSummary = Object.keys(countByUser).map((k) => countByUser[k]);
    const max = Math.max.apply(
      null,
      personSummary.map((s) => s.count).concat([1])
    );
    personSummary.forEach((s) => {
      s.percent = Math.round((s.count / max) * 100);
    });
    personSummary.sort((a, b) => b.count - a.count);

    this.setData({ rows, assignedCount: count, personSummary });
  },

  onCellTap(e) {
    const r = +e.currentTarget.dataset.row;
    const d = +e.currentTarget.dataset.day;
    const row = this.data.rows[r];
    if (!row) return;
    const cell = row.cells[d];
    if (!cell) return;
    const dayLabel = (this.data.weekDays[d] && this.data.weekDays[d].weekday) || '';
    const end = row.end || this.plus2h(row.start);
    const timeLabel = (row.start || '') + (end ? ' - ' + end : '');

    if (cell.assigned) {
      const names = cell.memberNames && cell.memberNames.length
        ? cell.memberNames.join('、')
        : cell.memberName;
      this.setData({
        cellDetail: {
          timeLabel,
          dayLabel,
          assigned: true,
          memberName: names,
          riskLabel:
            cell.riskLevel === 'high' ? '风险时段（限 1 人）' : '正常时段',
          phone: '—',
        },
      });
    } else {
      this.setData({
        cellDetail: {
          timeLabel,
          dayLabel,
          assigned: false,
        },
      });
    }
  },

  plus2h(time) {
    if (!time || time.indexOf(':') < 0) return '';
    const [h, m] = time.split(':').map(Number);
    return (
      String((h + 2) % 24).padStart(2, '0') +
      ':' +
      String(m || 0).padStart(2, '0')
    );
  },

  closeCellDetail() {
    this.setData({ cellDetail: null });
  },

  onEdit() {
    const taskId = this.data.taskId;
    if (!isDemoTaskId(taskId)) {
      wx.navigateTo({
        url:
          '/pages/scheme-preview/scheme-preview?taskId=' +
          encodeURIComponent(taskId) +
          '&mode=adjust',
      });
      return;
    }
    const taskId = this.data.taskId || (this.data.task && this.data.task.id) || '';
    if (taskId) {
      wx.navigateTo({ url: `/pages/task-detail/task-detail?id=${taskId}` });
    } else {
      wx.showToast({ title: '请从任务详情重新生成', icon: 'none' });
    }
  },

  onShareLink() {
    const taskId = this.data.taskId;
    const token = this.data.shareToken;
    let url = '';
    if (!isDemoTaskId(taskId) && token) {
      // 小程序内分享预览路径（H5 绝对 URL 依赖部署配置，先用小程序 path）
      url =
        '/pages/share-preview/share-preview?taskId=' +
        encodeURIComponent(taskId) +
        '&token=' +
        encodeURIComponent(token);
    } else if (!isDemoTaskId(taskId)) {
      url =
        '/pages/public-result/public-result?taskId=' +
        encodeURIComponent(taskId) +
        '&mode=view';
    } else {
      url = 'https://mp.weixin.qq.com/s/demo-public-result';
    }
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({ title: '链接已复制', icon: 'success' });
      },
    });
  },

  onShareAppMessage() {
    const taskId = this.data.taskId;
    const token = this.data.shareToken;
    let path = '/pages/public-result/public-result?mode=view';
    if (!isDemoTaskId(taskId) && token) {
      path =
        '/pages/share-preview/share-preview?taskId=' +
        encodeURIComponent(taskId) +
        '&token=' +
        encodeURIComponent(token);
    } else if (!isDemoTaskId(taskId)) {
      path =
        '/pages/public-result/public-result?taskId=' +
        encodeURIComponent(taskId) +
        '&mode=view';
    }
    return {
      title: '排班公示结果：' + this.data.taskTitle,
      path,
    };
  },
});
