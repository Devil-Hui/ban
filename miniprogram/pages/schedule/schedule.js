// pages/schedule/schedule.js —— 日程页：月历 + 我的班次（接 /users/me/assignments）
const groupsApi = require('../../services/groups');
const authApi = require('../../services/auth');
const { ensureLogin } = require('../../utils/auth');

Page({
  data: {
    statusBarHeight: 20,
    isPublisher: false,
    currentYear: 2026,
    currentMonth: 7,
    calendar: [],
    selectedDay: null,
    monthStat: { total: 0, mine: 0, pending: 0 },
    todayCard: null,
    groupList: [],
    currentGroupId: '',
    // 原始分配（API）
    assignments: [],
    // 由 assignments 聚合的「今日/进行中」展示
    activeTasks: [],
    upcomingTasks: [],
    loading: true,
  },

  onLoad() {
    try {
      const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 });
    } catch (e) {}
    const today = new Date();
    this.setData({
      currentYear: today.getFullYear(),
      currentMonth: today.getMonth() + 1,
    });
  },

  onShow() {
    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh().finally(() => wx.stopPullDownRefresh());
  },

  async refresh() {
    this.setData({ loading: true });
    try {
      await ensureLogin().catch(() => null);
      const month = `${this.data.currentYear}-${String(this.data.currentMonth).padStart(2, '0')}`;
      const [groupListRaw, assignments] = await Promise.all([
        groupsApi.listMine().catch(() => []),
        authApi.listMyAssignments({ month }).catch(() => []),
      ]);
      const groupList = (groupListRaw || []).map((g) => {
        const role = g.roleInGroup || g.myRole || g.role || 'member';
        return {
          id: g.id,
          name: g.name || '未命名分组',
          role: role === 'publisher' || role === 'owner' ? 'publisher' : 'member',
        };
      });
      const currentGroupId =
        this.data.currentGroupId && groupList.some((g) => g.id === this.data.currentGroupId)
          ? this.data.currentGroupId
          : groupList[0]
            ? groupList[0].id
            : '';
      const cur = groupList.find((g) => g.id === currentGroupId);
      this.setData({
        loading: false,
        groupList,
        currentGroupId,
        isPublisher: !!(cur && cur.role === 'publisher'),
        assignments: assignments || [],
      });
      this.buildFromAssignments();
    } catch (_) {
      this.setData({
        loading: false,
        groupList: [],
        assignments: [],
        activeTasks: [],
        upcomingTasks: [],
      });
      this.buildCalendar({});
      this.buildTodayCard();
    }
  },

  /** 将 API assignments 聚合成 dateStr → { count, items } */
  buildScheduleMap() {
    const map = {};
    const gid = this.data.currentGroupId;
    (this.data.assignments || []).forEach((a) => {
      if (gid && a.groupId && String(a.groupId) !== String(gid)) return;
      const dateStr = String(a.date || '').slice(0, 10);
      if (!dateStr) return;
      if (!map[dateStr]) map[dateStr] = { count: 0, state: 'published', items: [] };
      map[dateStr].count += 1;
      map[dateStr].items.push(a);
      if (a.taskStatus === 'adjusting') map[dateStr].state = 'pending';
    });
    return map;
  },

  buildFromAssignments() {
    const map = this.buildScheduleMap();
    this.buildCalendar(map);
    this.buildTodayCard();
    this.buildActiveAndUpcoming(map);
  },

  buildActiveAndUpcoming(map) {
    const today = new Date();
    const todayStr = this.fmtDate(today);
    const dayItems = (map[todayStr] && map[todayStr].items) || [];

    // 按 taskId 聚合今日班次
    const byTask = {};
    dayItems.forEach((a) => {
      const tid = a.taskId;
      if (!byTask[tid]) {
        byTask[tid] = {
          id: tid,
          title: a.taskTitle || '排班任务',
          remark: '',
          groupName: a.groupName || '',
          periods: [],
          currentPeriodIdx: -1,
          currentMember: null,
          nextPeriodIdx: -1,
          nextMember: null,
        };
      }
      byTask[tid].periods.push({
        id: a.periodId,
        label: a.periodId || '时段',
        start: 0,
        end: 0,
        member: { id: a.userId, name: '我', phone: '', initial: '我' },
      });
    });
    const activeTasks = Object.keys(byTask).map((k) => byTask[k]);

    // 未来日期的 upcoming（不含今天）
    const upcoming = [];
    Object.keys(map)
      .filter((d) => d > todayStr)
      .sort()
      .slice(0, 8)
      .forEach((d) => {
        const items = map[d].items || [];
        const seen = {};
        items.forEach((a) => {
          if (seen[a.taskId]) return;
          seen[a.taskId] = true;
          const parts = d.split('-');
          upcoming.push({
            id: a.taskId,
            title: a.taskTitle || '排班任务',
            groupName: a.groupName || '',
            day: String(parseInt(parts[2], 10)),
            monthLabel: `${parseInt(parts[1], 10)}月`,
            periodsCount: items.filter((x) => x.taskId === a.taskId).length,
          });
        });
      });

    this.setData({ activeTasks, upcomingTasks: upcoming });
  },

  switchGroup(e) {
    const id = e.currentTarget.dataset.id;
    if (id === this.data.currentGroupId) return;
    const group = this.data.groupList.find((g) => g.id === id);
    this.setData(
      {
        currentGroupId: id,
        isPublisher: !!(group && group.role === 'publisher'),
      },
      () => this.buildFromAssignments()
    );
    if (group) {
      wx.showToast({ title: group.name, icon: 'none', duration: 600 });
    }
  },

  buildTodayCard() {
    const today = new Date();
    const dateStr = this.fmtDate(today);
    const cell = this.data.calendar.find((c) => c.dateStr === dateStr);
    const count = cell ? cell.count : 0;
    const dateLabel = `${today.getMonth() + 1}月${today.getDate()}日`;
    this.setData({
      todayCard: {
        dateLabel,
        count,
        people: count,
        pending: 0,
      },
    });
  },

  buildCalendar(schedules) {
    const year = this.data.currentYear;
    const month = this.data.currentMonth;
    const firstDay = new Date(year, month - 1, 1);
    let firstDayOfWeek = firstDay.getDay() - 1;
    if (firstDayOfWeek < 0) firstDayOfWeek = 6;
    const daysInMonth = new Date(year, month, 0).getDate();
    const daysInPrev = new Date(year, month - 1, 0).getDate();
    const todayStr = this.fmtDate(new Date());
    const map = schedules || {};

    const cells = [];
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      cells.push(this.makeCell(year, month - 1, daysInPrev - i, false, todayStr, map));
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(this.makeCell(year, month, d, true, todayStr, map));
    }
    let next = 1;
    while (cells.length < 42) {
      cells.push(this.makeCell(year, month + 1, next++, false, todayStr, map));
    }

    let total = 0;
    let pending = 0;
    cells.forEach((c) => {
      if (c.inMonth && c.count > 0) {
        total += c.count;
        if (c.state === 'pending') pending++;
      }
    });

    this.setData({
      calendar: cells,
      monthStat: {
        total,
        mine: total,
        pending,
      },
    });
  },

  makeCell(year, month, day, inMonth, todayStr, schedules) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const info = schedules[dateStr];
    const count = info ? info.count : 0;
    const heatLevel = count === 0 ? 0 : count === 1 ? 1 : count <= 2 ? 2 : 3;
    return {
      key: dateStr,
      dateStr,
      day,
      inMonth,
      isToday: dateStr === todayStr,
      selected: false,
      count,
      heatLevel,
      state: info ? info.state : 'none',
      dotCount: 0,
      periods: [],
    };
  },

  fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  prevMonth() {
    let m = this.data.currentMonth - 1;
    let y = this.data.currentYear;
    if (m < 1) {
      m = 12;
      y--;
    }
    this.setData({ currentMonth: m, currentYear: y }, () => this.refresh());
  },

  nextMonth() {
    let m = this.data.currentMonth + 1;
    let y = this.data.currentYear;
    if (m > 12) {
      m = 1;
      y++;
    }
    this.setData({ currentMonth: m, currentYear: y }, () => this.refresh());
  },

  onTouchStart(e) {
    this._touchStartX = e.touches[0].clientX;
    this._touchStartY = e.touches[0].clientY;
  },
  onTouchEnd(e) {
    if (this._touchStartX == null) return;
    const dx = e.changedTouches[0].clientX - this._touchStartX;
    const dy = e.changedTouches[0].clientY - this._touchStartY;
    this._touchStartX = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx > 0) this.prevMonth();
    else this.nextMonth();
  },

  onDayTap(e) {
    const dateStr = e.currentTarget.dataset.date;
    const map = this.buildScheduleMap();
    const info = map[dateStr];
    const parts = String(dateStr || '').split('-');
    const dateLabel =
      parts.length === 3
        ? `${parseInt(parts[1], 10)}月${parseInt(parts[2], 10)}日`
        : dateStr;

    if (!info || !info.count) {
      this.setData({
        selectedDay: {
          dateLabel,
          summary: '当天暂无排班',
          items: [],
        },
      });
      return;
    }

    const items = (info.items || []).map((a) => ({
      id: a.taskId,
      title: a.taskTitle || '排班任务',
      groupName: a.groupName || '',
      periodLabel: a.periodId || '',
      status: a.taskStatus || 'published',
    }));

    this.setData({
      selectedDay: {
        dateLabel,
        summary: `共 ${info.count} 个班次`,
        items,
      },
    });
  },

  goTaskDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/task-detail/task-detail?id=${id}` });
  },

  closeDayDetail() {
    this.setData({ selectedDay: null });
  },
});
