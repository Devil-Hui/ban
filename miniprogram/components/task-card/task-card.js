// components/task-card/task-card.js
Component({
  properties: {
    task: { type: Object, value: {} },
  },
  data: {
    _statusText: '',
    _statusCls: 'muted',
  },
  observers: {
    task(t) {
      if (!t) return;
      const map = {
        collecting: { text: '收集中', cls: 'warning' },
        generating: { text: '生成中', cls: 'warning' },
        published: { text: '已发布', cls: 'success' },
        closed: { text: '已截止', cls: 'muted' },
        cancelled: { text: '已取消', cls: 'muted' },
      };
      const s = map[t.status] || { text: t.status || '', cls: 'muted' };
      const total = Number(t.memberCount) || 0;
      const done = Number(t.responseCount) || 0;
      const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
      this.setData({ _statusText: s.text, _statusCls: s.cls, progressPercent: percent });
    },
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { id: this.data.task.id });
    },
  },
});
