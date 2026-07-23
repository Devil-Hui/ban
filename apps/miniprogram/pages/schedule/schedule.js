const api = require('../../utils/api');
const { formatHm, localTodayYmd } = require('../../utils/time-format');

/**
 * 格式化日期为 "MM-DD 周X" 标签
 * @param {string} value - ISO date string YYYY-MM-DD
 * @returns {string}
 */
function dateLabel(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return `${value.slice(5)} 周${['日', '一', '二', '三', '四', '五', '六'][date.getUTCDay()]}`;
}

/**
 * 获取今天的日期字符串 YYYY-MM-DD
 */
function todayStr() {
  return localTodayYmd();
}

/**
 * 生成月历网格数据
 * @param {number} year - 年份
 * @param {number} month - 月份 (0-11)
 * @param {Array} assignments - 排班数据
 * @param {string} today - 今天的日期 YYYY-MM-DD
 * @returns {{ monthLabel: string, days: Array }}
 */
function buildCalendar(year, month, assignments, today) {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = first.getUTCDay(); // 当月1号是周几（0=周日）
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const days = [];

  // 生成 6x7 = 42 格月历
  for (let index = 0; index < 42; index += 1) {
    const dayNum = index - offset + 1;
    const value = new Date(Date.UTC(year, month, dayNum));
    const date = value.toISOString().slice(0, 10);
    const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
    const shiftItems = (assignments || []).filter((item) => item.slotDate === date);

    days.push({
      date,
      day: value.getUTCDate(),
      inMonth,
      isToday: date === today,
      items: shiftItems,
      hasShift: shiftItems.length > 0,
    });
  }

  return {
    monthLabel: `${year}年${String(month + 1).padStart(2, '0')}月`,
    days,
  };
}

Page({
  data: {
    assignments: [],
    grouped: [],
    calendarDays: [],
    monthLabel: '',
    todayMonthLabel: '',
    currentYear: 0,
    currentMonth: 0,
    today: '',
    selectedDate: '',
    selectedItems: [],
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    loading: true,
    mode: 'calendar', // 默认日历视图
  },

  onShow() {
    this.load();
  },

  load() {
    const today = todayStr();
    const now = new Date();
    const todayMonthLabel = `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, '0')}月`;

    this.setData({
      loading: true,
      today,
      todayMonthLabel,
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth(),
    });

    // 先生成空白日历（不依赖排班数据）
    const emptyCal = buildCalendar(now.getFullYear(), now.getMonth(), [], today);
    this.setData({
      calendarDays: emptyCal.days,
      monthLabel: emptyCal.monthLabel,
    });

    // 异步加载排班数据
    api.request('/users/me/schedule')
      .then((assignments) => {
        const data = assignments || [];

        // 列表数据分组
        const byDate = new Map();
        data.forEach((item) => {
          item.startTime = formatHm(item.startsAt);
          item.endTime = formatHm(item.endsAt);
          const key = item.slotDate;
          const group = byDate.get(key) || { date: key, label: dateLabel(key), items: [] };
          group.items.push(item);
          byDate.set(key, group);
        });

        // 重建日历（带上排班数据）
        const cal = buildCalendar(
          this.data.currentYear,
          this.data.currentMonth,
          data,
          today,
        );

        // 默认选中今天，如果没有排班则选第一个有排班的日期
        const hasTodayShift = data.some((item) => item.slotDate === today);
        const selectedDate = hasTodayShift
          ? today
          : (data[0]?.slotDate || today);
        const selectedItems = data.filter((item) => item.slotDate === selectedDate);

        this.setData({
          assignments: data,
          grouped: [...byDate.values()],
          calendarDays: cal.days,
          monthLabel: cal.monthLabel,
          selectedDate,
          selectedItems,
          loading: false,
        });
      })
      .catch(() => {
        this.setData({
          assignments: [],
          grouped: [],
          loading: false,
        });
      });
  },

  /** 刷新当前月份的日历 */
  refreshCalendar() {
    const cal = buildCalendar(
      this.data.currentYear,
      this.data.currentMonth,
      this.data.assignments,
      this.data.today,
    );
    this.setData({
      calendarDays: cal.days,
      monthLabel: cal.monthLabel,
    });
  },

  /** 切换视图模式 */
  setMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ mode });
  },

  /** 上一个月 */
  goToPrevMonth() {
    let { currentYear, currentMonth } = this.data;
    currentMonth -= 1;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear -= 1;
    }
    this.setData({ currentYear, currentMonth });
    this.refreshCalendar();
  },

  /** 下一个月 */
  goToNextMonth() {
    let { currentYear, currentMonth } = this.data;
    currentMonth += 1;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear += 1;
    }
    this.setData({ currentYear, currentMonth });
    this.refreshCalendar();
  },

  /** 回到今天 */
  goToToday() {
    const today = this.data.today;
    const d = new Date(`${today}T00:00:00`);
    const year = d.getFullYear();
    const month = d.getMonth();

    if (year === this.data.currentYear && month === this.data.currentMonth) {
      // 同一个月，只选中今天
      this.selectDateByValue(today);
      return;
    }

    this.setData({ currentYear: year, currentMonth: month });
    this.refreshCalendar();
    this.selectDateByValue(today);
  },

  /** 通过日期值选中 */
  selectDateByValue(date) {
    const items = this.data.assignments.filter((item) => item.slotDate === date);
    this.setData({ selectedDate: date, selectedItems: items });
  },

  /** 点击日历日期格子 */
  selectDate(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    this.selectDateByValue(date);
  },

  /** 跳转到排班详情 */
  openTask(e) {
    const taskId = e.currentTarget.dataset.taskId;
    if (taskId) wx.navigateTo({ url: `/pages/result/result?taskId=${taskId}&manage=0` });
  },
});
