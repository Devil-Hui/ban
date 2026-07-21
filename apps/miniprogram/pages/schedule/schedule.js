const api = require('../../utils/api');
const { formatHm } = require('../../utils/time-format');

function dateLabel(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return `${value.slice(5)} 周${['日', '一', '二', '三', '四', '五', '六'][date.getUTCDay()]}`;
}

function calendar(assignments) {
  const anchor = assignments[0]?.slotDate ? new Date(`${assignments[0].slotDate}T00:00:00Z`) : new Date();
  const year = anchor.getUTCFullYear(); const month = anchor.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1)); const offset = first.getUTCDay(); const days = [];
  for (let index = 0; index < 42; index += 1) {
    const value = new Date(Date.UTC(year, month, index - offset + 1)); const date = value.toISOString().slice(0, 10);
    days.push({ date, day: value.getUTCDate(), inMonth: value.getUTCMonth() === month, items: assignments.filter((item) => item.slotDate === date) });
  }
  return { monthLabel: `${year}年${String(month + 1).padStart(2, '0')}月`, days };
}

Page({
  data: { assignments: [], grouped: [], calendarDays: [], monthLabel: '', selectedDate: '', selectedItems: [], weekdays: ['日', '一', '二', '三', '四', '五', '六'], loading: true, mode: 'list' },
  onShow() { this.load(); },
  load() {
    this.setData({ loading: true });
    api.request('/users/me/schedule').then((assignments) => {
      const byDate = new Map();
      (assignments || []).forEach((item) => {
        item.startTime = formatHm(item.startsAt);
        item.endTime = formatHm(item.endsAt);
        const key = item.slotDate;
        const group = byDate.get(key) || { date: key, label: dateLabel(key), items: [] };
        group.items.push(item);
        byDate.set(key, group);
      });
      const month = calendar(assignments || []); const selectedDate = assignments[0]?.slotDate || '';
      this.setData({ assignments: assignments || [], grouped: [...byDate.values()], calendarDays: month.days, monthLabel: month.monthLabel, selectedDate, selectedItems: (assignments || []).filter((item) => item.slotDate === selectedDate), loading: false });
    }).catch(() => this.setData({ assignments: [], grouped: [], loading: false }));
  },
  setMode(e) { this.setData({ mode: e.currentTarget.dataset.mode }); },
  selectDate(e) { const date = e.currentTarget.dataset.date; this.setData({ selectedDate: date, selectedItems: this.data.assignments.filter((item) => item.slotDate === date) }); },
  openTask(e) {
    const taskId = e.currentTarget.dataset.taskId;
    if (taskId) wx.navigateTo({ url: `/pages/result/result?taskId=${taskId}&manage=0` });
  },
});
