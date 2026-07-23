const { applyPaint } = require('../../domain/slot-selection');
const {
  slotKey,
  toggleKey,
  applyRowRange,
  isCellInteractive,
  indexFromOffset,
  formatDateHeader,
} = require('./logic');

// Rectangular multi-row drag is deferred; only contiguous cells on a single row.

Component({
  properties: {
    periods: { type: Array, value: [] },
    dates: { type: Array, value: [] },
    timeMode: { type: String, value: 'section_range' },
    mode: { type: String, value: 'readonly' }, // readonly | select | paint | staff
    selectedKeys: { type: Array, value: [] },
    peopleByKey: { type: Object, value: {} },
    activeTool: { type: null, value: null }, // number | 'erase' | null
    lunchBlocked: { type: Boolean, value: true },
    dinnerBlocked: { type: Boolean, value: true },
  },

  data: {
    dateHeaders: [],
    rows: [],
  },

  observers: {
    'periods, dates, selectedKeys, peopleByKey, mode, timeMode, lunchBlocked, dinnerBlocked': function () {
      this.rebuildGrid();
    },
  },

  lifetimes: {
    attached() {
      this.rebuildGrid();
    },
  },

  methods: {
    rebuildGrid() {
      const periods = this.properties.periods || [];
      const dates = this.properties.dates || [];
      const selectedKeys = this.properties.selectedKeys || [];
      const peopleByKey = this.properties.peopleByKey || {};
      const mode = this.properties.mode || 'readonly';
      const timeMode = this.properties.timeMode || 'section_range';

      const selectedSet = {};
      selectedKeys.forEach((k) => {
        selectedSet[k] = true;
      });

      const dateHeaders = dates.map((d) => formatDateHeader(d));

      const rows = periods.map((period, rowIndex) => {
        const code = period.code || period.id || period.periodCode || `p${rowIndex + 1}`;
        const rowLabel = period.label || this.periodFallbackLabel(period, code, timeMode);
        const isRest = !!(period.rest || (period.minPeople != null && period.minPeople === 0 && period.maxPeople === 0));
        // 休息行根据 blocked 状态决定是否可交互
        const restBlocked = isRest && this._isRestBlocked(rowLabel);
        const cells = dates.map((date, dateIndex) => {
          const key = slotKey(date, code);
          const selected = !!selectedSet[key];
          const people = peopleByKey[key];
          const hasPeople = people != null && people !== '';
          const disabled = (mode === 'paint' || mode === 'staff') && !selected;
          return {
            key,
            date,
            dateIndex,
            selected,
            disabled,
            interactive: restBlocked ? false : isCellInteractive(mode, key, selectedKeys),
            people: hasPeople ? people : null,
            showPeople: hasPeople,
          };
        });
        return {
          code,
          label: rowLabel,
          rowIndex,
          cells,
          rest: restBlocked,
        };
      });

      this.setData({ dateHeaders, rows });
    },

    _isRestBlocked(label) {
      if (!label) return false;
      if (label.indexOf('午休') !== -1) return this.properties.lunchBlocked;
      if (label.indexOf('晚饭') !== -1) return this.properties.dinnerBlocked;
      return false;
    },

    periodFallbackLabel(period, code, timeMode) {
      const start = period.start || period.startTime;
      const end = period.end || period.endTime;
      const range =
        start && end
          ? `${start}-${end}`
          : period.startMinute != null && period.endMinute != null
            ? this.minutesToRange(period.startMinute, period.endMinute)
            : '';
      if (timeMode === 'range') return range || code;
      if (timeMode === 'section') return period.name || `第${code.replace(/\D/g, '') || '?'}节`;
      // section_range / default
      if (period.name && range) return `${period.name} ${range}`;
      return range || period.name || code;
    },

    minutesToRange(startMinute, endMinute) {
      const fmt = (m) => {
        const n = ((Number(m) % 1440) + 1440) % 1440;
        const h = Math.floor(n / 60);
        const min = n % 60;
        return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      };
      return `${fmt(startMinute)}-${fmt(endMinute)}`;
    },

    onCellTap(e) {
      const mode = this.properties.mode;
      if (mode === 'readonly') return;

      // If a drag just finished, ignore the synthetic tap
      if (this._suppressTap) {
        this._suppressTap = false;
        return;
      }

      const key = e.currentTarget.dataset.key;
      if (!key) return;

      if (mode === 'staff') {
        // Staffing: only selected (schedulable) cells open the picker sheet.
        if (!isCellInteractive('paint', key, this.properties.selectedKeys)) return;
        this.triggerEvent('celltap', {
          key,
          date: e.currentTarget.dataset.date,
          periodCode: e.currentTarget.dataset.period,
        });
        return;
      }

      if (mode === 'select') {
        const keys = toggleKey(this.properties.selectedKeys, key);
        this.triggerEvent('selectchange', { keys });
        return;
      }

      if (mode === 'paint') {
        if (!isCellInteractive('paint', key, this.properties.selectedKeys)) return;
        const next = applyPaint(this.properties.peopleByKey, key, this.properties.activeTool);
        this.triggerEvent('paint', { key, peopleByKey: next });
      }
    },

    // --- Minimal row-contiguous drag (select mode only) ---

    onRowTouchStart(e) {
      if (this.properties.mode !== 'select') return;
      const period = e.currentTarget.dataset.period;
      if (!period) return;
      const touch = e.touches && e.touches[0];
      if (!touch) return;

      this._dragMoved = false;
      this._drag = null;

      const query = this.createSelectorQuery();
      query.select(`#sg-row-${period}`).boundingClientRect();
      query.select(`#sg-label-${period}`).boundingClientRect();
      query.exec((res) => {
        const rowRect = res && res[0];
        const labelRect = res && res[1];
        if (!rowRect) return;
        const labelWidth = labelRect ? labelRect.width : 0;
        const idx = indexFromOffset(
          touch.clientX - rowRect.left,
          rowRect.width,
          (this.properties.dates || []).length,
          labelWidth
        );
        if (idx < 0) return;
        const date = (this.properties.dates || [])[idx];
        const key = slotKey(date, period);
        const baseline = Array.isArray(this.properties.selectedKeys)
          ? this.properties.selectedKeys.slice()
          : [];
        const selected = new Set(baseline);
        this._drag = {
          periodCode: period,
          startIndex: idx,
          endIndex: idx,
          adding: !selected.has(key),
          baselineKeys: baseline,
          rowLeft: rowRect.left,
          rowWidth: rowRect.width,
          labelWidth,
        };
        // Do not emit yet — single taps are handled by onCellTap; drag emits on move/end.
      });
    },

    onRowTouchMove(e) {
      if (this.properties.mode !== 'select' || !this._drag) return;
      const touch = e.touches && e.touches[0];
      if (!touch) return;
      const { rowLeft, rowWidth, labelWidth, periodCode, startIndex } = this._drag;
      const idx = indexFromOffset(
        touch.clientX - rowLeft,
        rowWidth,
        (this.properties.dates || []).length,
        labelWidth
      );
      if (idx < 0) return;
      if (idx !== this._drag.endIndex) {
        this._dragMoved = true;
        this._drag.endIndex = idx;
        this._emitDragKeys();
      } else if (idx !== startIndex) {
        this._dragMoved = true;
      }
    },

    onRowTouchEnd() {
      if (this.properties.mode !== 'select') {
        this._drag = null;
        this._dragMoved = false;
        return;
      }
      if (this._drag && this._dragMoved) {
        // Final emit (idempotent with last move) and suppress the following tap.
        this._emitDragKeys();
        this._suppressTap = true;
      }
      this._drag = null;
      this._dragMoved = false;
    },

    _emitDragKeys() {
      if (!this._drag) return;
      const { periodCode, startIndex, endIndex, adding, baselineKeys } = this._drag;
      // Always recompute from pre-drag baseline so shrinking the range undoes preview.
      const keys = applyRowRange(
        baselineKeys,
        this.properties.dates,
        periodCode,
        startIndex,
        endIndex,
        adding
      );
      this.triggerEvent('selectchange', { keys });
    },
  },
});
