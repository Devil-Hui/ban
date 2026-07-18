// pages/index/index.js —— 首页：对齐设计板「1.首页」+ 真数据
const app = getApp();
const groupsApi = require('../../services/groups');
const authApi = require('../../services/auth');
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

function periodLabel(a) {
  if (a.periodName) return a.periodName;
  if (a.periodLabel) return a.periodLabel;
  if (a.start && a.end) return a.start + '–' + a.end;
  if (a.periodId) return String(a.periodId);
  return '时段';
}

/** 设计板色块轮换：橙 / 绿 / 蓝 */
const TONES = ['orange', 'green', 'blue', 'amber'];

Page({
  data: {
    statusBarHeight: 20,
    user: { nickname: '用户', initial: '我' },
    loading: true,
    cards: [],
  },

  onLoad() {
    try {
      const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      this.setData({ statusBarHeight: sys.statusBarHeight || 20 });
    } catch (e) {}

    if (app.onLoginReady) {
      app.onLoginReady((user) => {
        this.applyUser(user);
        this.refresh();
      });
    } else {
      this.applyUser(app.globalData && (app.globalData.currentUser || app.globalData.user));
      this.refresh();
    }
  },

  onShow() {
    this.applyUser(app.globalData && (app.globalData.currentUser || app.globalData.user));
    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh().finally(() => wx.stopPullDownRefresh());
  },

  applyUser(user) {
    const u = user || {};
    const nickname = u.nickname || u.nickName || '用户';
    this.setData({
      user: {
        nickname,
        initial: (u.initial || nickname.charAt(0) || '我').slice(0, 1),
      },
    });
  },

  /**
   * 组装设计板风格数据卡：
   * 1) 今日/下一班  2) 各分组  3) 可选待办汇总
   * 右侧用「N 份」呼应原型
   */
  buildCards(groups, duty) {
    const cards = [];
    let toneIdx = 0;
    const nextTone = () => TONES[toneIdx++ % TONES.length];

    // 今日班次 / 下一班 —— 对应设计板「数据日报」类卡片
    if (duty.nextShift) {
      const n = duty.nextShift;
      cards.push({
        id: 'next-' + (n.taskId || 'x'),
        type: 'shift',
        taskId: n.taskId,
        title: n.title || '下一班',
        desc: (n.dateLabel || '') + (n.timeText ? ' · ' + n.timeText : ''),
        iconText: '班',
        tone: nextTone(),
        badge: n.isToday ? '今日' : '即将',
        badgeTone: n.isToday ? 'green' : 'orange',
      });
    } else if (duty.todayShifts && duty.todayShifts.length) {
      cards.push({
        id: 'today-stat',
        type: 'schedule',
        title: '今日班次',
        desc: '共 ' + duty.todayShifts.length + ' 个时段',
        iconText: '日',
        tone: nextTone(),
        count: duty.todayShifts.length,
        unit: '份',
      });
    } else {
      cards.push({
        id: 'today-empty',
        type: 'schedule',
        title: '今日班次',
        desc: '今天暂无排班 · 点此打开日程',
        iconText: '日',
        tone: 'green',
        count: 0,
        unit: '份',
      });
    }

    // 今日明细（最多 2 条，避免首页过长）
    (duty.todayShifts || []).slice(0, 2).forEach((s, i) => {
      cards.push({
        id: 'shift-' + s.id,
        type: 'shift',
        taskId: s.taskId,
        title: s.title,
        desc: s.timeText + (s.groupName ? ' · ' + s.groupName : ''),
        iconText: '时',
        tone: nextTone(),
      });
    });

    // 分组 —— 设计板主列表主体
    (groups || []).forEach((g) => {
      const active = g.activeTaskCount || 0;
      const members = g.memberCount || 0;
      cards.push({
        id: 'group-' + g.id,
        type: 'group',
        groupId: g.id,
        title: g.name,
        desc:
          (g.roleLabel || '') +
          (members ? ' · ' + members + ' 人' : '') +
          (active ? ' · ' + active + ' 进行中' : ''),
        iconText: (g.name && g.name[0]) || '组',
        tone: g.role === 'publisher' ? 'green' : nextTone(),
        count: active > 0 ? active : members || 0,
        unit: active > 0 ? '份' : '人',
      });
    });

    // 无分组且无班次：交给空态（设计板「暂无分组」）
    const hasGroups = (groups || []).length > 0;
    const hasDuty =
      (duty.todayShifts && duty.todayShifts.length > 0) || !!duty.nextShift;
    if (!hasGroups && !hasDuty) return [];
    // 无分组时去掉「今日 0 份」占位，只保留真实班次卡
    if (!hasGroups) {
      return cards.filter((c) => c.id !== 'today-empty');
    }

    return cards;
  },

  mapGroup(g) {
    const role = g.roleInGroup || g.myRole || g.role || 'member';
    const isPub = role === 'publisher' || role === 'owner';
    const active = g.activeTaskCount != null ? g.activeTaskCount : g.activeTasks || 0;
    return {
      id: g.id,
      name: g.name || '未命名分组',
      role: isPub ? 'publisher' : 'member',
      roleLabel: isPub ? '发布者' : '成员',
      memberCount: g.memberCount != null ? g.memberCount : g.membersCount || 0,
      activeTaskCount: active,
      inviteCode: g.inviteCode || '',
    };
  },

  buildDutyFromAssignments(list) {
    const todayStr = ymd(new Date());
    const now = new Date();
    const dow = now.getDay() || 7;
    const mon = new Date(now);
    mon.setDate(now.getDate() - dow + 1);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const monStr = ymd(mon);
    const sunStr = ymd(sun);

    const todayShifts = [];
    let week = 0;
    (list || []).forEach((a) => {
      const date = String(a.date || '').slice(0, 10);
      if (!date) return;
      if (date >= monStr && date <= sunStr) week += 1;
      if (date === todayStr) {
        todayShifts.push({
          id: (a.taskId || '') + '|' + (a.periodId || '') + '|' + date,
          taskId: a.taskId,
          title: a.taskTitle || a.groupName || '排班任务',
          groupName: a.groupName || '',
          timeText: a.start && a.end ? a.start + '–' + a.end : periodLabel(a),
        });
      }
    });

    let nextShift = null;
    const upcoming = (list || [])
      .map((a) => ({
        date: String(a.date || '').slice(0, 10),
        taskId: a.taskId,
        title: a.taskTitle || a.groupName || '排班任务',
        timeText: a.start && a.end ? a.start + '–' + a.end : periodLabel(a),
      }))
      .filter((x) => x.date && x.date >= todayStr)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (upcoming[0]) {
      const n = upcoming[0];
      const isToday = n.date === todayStr;
      let dateLabel = '今天';
      if (!isToday) {
        const p = n.date.split('-');
        dateLabel = Number(p[1]) + '月' + Number(p[2]) + '日';
      }
      nextShift = {
        taskId: n.taskId,
        title: n.title,
        timeText: n.timeText,
        dateLabel,
        isToday,
      };
    }
    return { todayShifts, nextShift, week };
  },

  async refresh() {
    this.setData({ loading: true });
    try {
      await ensureLogin().catch(() => null);
      const now = new Date();
      const month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      const [list, assignments] = await Promise.all([
        groupsApi.listMine().catch(() => []),
        authApi.listMyAssignments({ month }).catch(() => []),
      ]);
      const groups = (list || []).map((g) => this.mapGroup(g));
      const duty = this.buildDutyFromAssignments(assignments || []);
      const cards = this.buildCards(groups, duty);
      this.setData({ loading: false, cards, _groups: groups });
    } catch (_) {
      this.setData({ loading: false, cards: [] });
    }
  },

  /** 设计板：创建分组（不是直接建任务） */
  onCreateGroup() {
    wx.navigateTo({ url: '/pages/join/join?mode=create' });
  },

  goJoin() {
    wx.navigateTo({ url: '/pages/join/join?mode=join' });
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/profile' });
  },

  onCardTap(e) {
    const { type, id, taskId } = e.currentTarget.dataset;
    if (type === 'group') {
      const gid = String(id || '').replace(/^group-/, '');
      if (gid) wx.navigateTo({ url: '/pages/group-detail/group-detail?id=' + gid });
      return;
    }
    if (type === 'shift' && taskId) {
      wx.navigateTo({ url: '/pages/task-detail/task-detail?id=' + taskId });
      return;
    }
    if (type === 'schedule' || type === 'pending') {
      wx.switchTab({ url: '/pages/schedule/schedule' });
    }
  },
});
