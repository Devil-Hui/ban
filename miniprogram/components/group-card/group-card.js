// components/group-card/group-card.js
Component({
  properties: {
    group: { type: Object, value: {} },
  },
  data: {
    _roleText: '',
    _roleCls: 'muted',
    _initial: '',
  },
  observers: {
    group(g) {
      if (!g) return;
      const map = {
        publisher: { text: '发布者', cls: 'warning' },
        owner: { text: '创建者', cls: 'warning' },
        member: { text: '成员', cls: 'muted' },
      };
      // 兼容后端 roleInGroup / myRole / role
      const roleKey = g.role || g.roleInGroup || g.myRole || '';
      const r = map[roleKey] || (g.roleLabel ? { text: g.roleLabel, cls: 'muted' } : { text: '', cls: 'muted' });
      this.setData({
        _roleText: r.text,
        _roleCls: r.cls,
        _initial: (g.name || '?').replace(/^[\s﻿]+/, '').charAt(0) || '?',
      });
    },
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { id: this.data.group.id });
    },
  },
});
