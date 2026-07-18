// components/schedule-view/schedule-view.js
// 通用排班表：按「节次/时间段」动态列
// rows = [{ date, weekday, cells: { [periodId]: [{id,name,avatar}] } }]
// periods = [{ id, name, start, end, label }] 优先；兼容旧 slots + slotLabels
Component({
  properties: {
    periods: { type: Array, value: [] },
    slots: { type: Array, value: [] }, // 兼容：period id 数组
    slotLabels: { type: Object, value: {} },
    rows: { type: Array, value: [] },
  },
  data: {
    columns: [], // [{id, title, sub}]
  },
  observers: {
    'periods, slots, slotLabels': function (periods, slots, slotLabels) {
      this.rebuildColumns(periods, slots, slotLabels);
    },
  },
  lifetimes: {
    attached() {
      this.rebuildColumns(this.data.periods, this.data.slots, this.data.slotLabels);
    },
  },
  methods: {
    rebuildColumns(periods, slots, slotLabels) {
      let columns = [];
      if (Array.isArray(periods) && periods.length) {
        columns = periods.map((p) => {
          const id = p.id || p.slot || p.periodId;
          const name = p.name || p.label || id;
          const sub = p.start && p.end ? `${p.start}-${p.end}` : '';
          return { id, title: name, sub };
        });
      } else if (Array.isArray(slots) && slots.length) {
        const labels = slotLabels || {};
        columns = slots.map((id) => ({
          id,
          title: labels[id] || labels[id + '_short'] || id,
          sub: '',
        }));
      }
      this.setData({ columns });
    },
  },
});
