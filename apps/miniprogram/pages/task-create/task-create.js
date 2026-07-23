const { todayYmd, defaultDeadlineIso } = require('../../domain/date-defaults');
const { buildPeriods, resolveTimeMode } = require('../../domain/period-builder');
const { parseSlotKey } = require('../../domain/slot-selection');
const { parseReservedNames } = require('../../domain/name-parser');
const { messageForCode } = require('../../constants/error-codes');
const api = require('../../utils/api');
const {
  addDaysYmd,
  inclusiveDaySpan,
  MAX_TASK_SPAN_DAYS,
  formatYmd,
  thisWeekRange,
  nextWeekRange,
} = require('../../utils/time-format');

/** Offline emergency only — production UI options come from GET /catalog/task-create (DB). */
const OFFLINE_FALLBACK = {
  campusPresets: [
    { code: 'start0800_45', label: '08:00·45分钟', firstStart: '08:00', durationMin: 45, morningCount: 4, afternoonCount: 4, eveningCount: 0, breakMin: 10 },
    { code: 'start0830_45', label: '08:30·45分钟', firstStart: '08:30', durationMin: 45, morningCount: 4, afternoonCount: 4, eveningCount: 0, breakMin: 10 },
    { code: 'manual', label: '手动', firstStart: '08:00', durationMin: 45, morningCount: 4, afternoonCount: 4, eveningCount: 0, breakMin: 10 },
  ],
  requiredFields: [
    { key: 'name', label: '姓名' },
    { key: 'studentId', label: '学号' },
    { key: 'phone', label: '联系方式' },
  ],
  participantScopes: [
    { key: 'all_members', label: '所有组员' },
    { key: 'share_link', label: '分享链接' },
    { key: 'reserved_list', label: '预留名单' },
  ],
  remindOptions: [
    { label: '15 分钟', value: 15 },
    { label: '30 分钟', value: 30 },
    { label: '60 分钟', value: 60 },
    { label: '120 分钟', value: 120 },
    { label: '关闭', value: null },
  ],
  wizardSteps: [
    { index: 1, label: '任务信息' },
    { index: 2, label: '时段规则' },
    { index: 3, label: '初预览' },
    { index: 4, label: '时间选定' },
    { index: 5, label: '详细规则' },
  ],
};

function presetsFromApi(list) {
  const map = {};
  const chips = [];
  (list || []).forEach((item) => {
    const code = item.code;
    if (!code) return;
    map[code] = {
      firstStart: item.firstStart || '08:00',
      durationMin: Number(item.durationMin) || 45,
      morningCount: Number(item.morningCount) || 4,
      afternoonCount: Number(item.afternoonCount) || 4,
      eveningCount: Number(item.eveningCount) || 0,
      breakMin: Number(item.breakMin) || 10,
      bigBreakMin: Number(item.bigBreakMin) || 0,
      hasBigBreak: Boolean(item.hasBigBreak),
      lunchStart: item.lunchStart || '12:00',
      lunchEnd: item.lunchEnd || '13:30',
      hasLunch: Boolean(item.hasLunch),
      lunchBlocked: item.lunchBlocked == null ? true : Boolean(item.lunchBlocked),
      dinnerStart: item.dinnerStart || '18:00',
      dinnerEnd: item.dinnerEnd || '19:00',
      hasDinner: Boolean(item.hasDinner),
      dinnerBlocked: item.dinnerBlocked == null ? true : Boolean(item.dinnerBlocked),
    };
    chips.push({ code, label: item.label || code });
  });
  return { map, chips };
}

function applyCatalog(catalog) {
  const src = catalog || OFFLINE_FALLBACK;
  const { map, chips } = presetsFromApi(src.campusPresets || OFFLINE_FALLBACK.campusPresets);
  const requiredFields = src.requiredFields || OFFLINE_FALLBACK.requiredFields;
  const participantScopes = src.participantScopes || OFFLINE_FALLBACK.participantScopes;
  const remindOptions = (src.remindOptions || OFFLINE_FALLBACK.remindOptions).map((o) => ({
    label: o.label,
    value: o.value === undefined ? null : o.value,
  }));
  const steps = (src.wizardSteps || OFFLINE_FALLBACK.wizardSteps)
    .slice()
    .sort((a, b) => Number(a.index) - Number(b.index));
  const firstCode = chips[0]?.code || 'start0800_45';
  const requiredFieldMap = {};
  requiredFields.forEach((f) => {
    requiredFieldMap[f.key] = false;
  });
  let remindIndex = remindOptions.findIndex((o) => o.value === 30);
  if (remindIndex < 0) remindIndex = 0;
  return {
    steps,
    presetChips: chips,
    presetTweaks: map,
    preset: firstCode,
    tweaks: { ...(map[firstCode] || { firstStart: '08:00', durationMin: 45, morningCount: 4, afternoonCount: 4, eveningCount: 0, breakMin: 10, bigBreakMin: 0, bigBreakEvery: 0, hasBigBreak: false, lunchStart: '12:00', lunchEnd: '13:30', hasLunch: false, lunchBlocked: true, dinnerStart: '18:00', dinnerEnd: '19:00', hasDinner: false, dinnerBlocked: true }) },
    requiredFieldOptions: requiredFields,
    requiredFieldMap,
    participantScopeOptions: participantScopes,
    remindOptions,
    remindOptionLabels: remindOptions.map((o) => o.label),
    remindIndex,
    remindBeforeMinutes: remindOptions[remindIndex]?.value ?? 30,
  };
}

const BOOT = applyCatalog(null);

/** Build a stable, regex-safe key suffix for a custom required field label. */
function slugify(label) {
  let base = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '');
  if (!base) base = 'field';
  const suffix = Date.now().toString(36).slice(-6);
  let slug = `${base}_${suffix}`;
  if (slug.length > 48) slug = slug.slice(slug.length - 48);
  return slug;
}

function deadlineDateFromIso(iso) {
  const raw = String(iso || '');
  return raw.slice(0, 10) || todayYmd();
}

/** Inclusive YYYY-MM-DD list from dateStart..dateEnd (capped at one week). */
function buildDates(dateStart, dateEnd) {
  const start = formatYmd(dateStart);
  let end = formatYmd(dateEnd) || start;
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return [];
  if (!end || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return [start];
  const maxEnd = addDaysYmd(start, MAX_TASK_SPAN_DAYS - 1);
  if (end > maxEnd) end = maxEnd;
  const out = [];
  const cur = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime())) return [];
  while (cur <= last) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
    if (out.length >= MAX_TASK_SPAN_DAYS) break;
  }
  return out;
}

function buildPaintTools(maxCapacity) {
  const n = Math.max(1, Math.min(100, Math.floor(Number(maxCapacity) || 1)));
  const tools = [];
  for (let i = 1; i <= n; i += 1) {
    tools.push({ key: String(i), value: i, label: String(i) });
  }
  tools.push({ key: 'erase', value: 'erase', label: '擦除' });
  return tools;
}

function clampActiveTool(activeTool, maxCapacity) {
  if (activeTool === 'erase') return 'erase';
  const n = Number(activeTool);
  if (Number.isInteger(n) && n >= 1 && n <= maxCapacity) return n;
  return 1;
}

Page({
  data: {
    step: 1,
    steps: BOOT.steps,
    groupId: '',
    title: '',
    dateStart: '',
    dateEnd: '',
    deadline: '',
    deadlineDate: '',
    modeFlags: { range: false, section: false, custom: false },
    timeMode: 'section_range',
    showCustomChip: true,
    preset: BOOT.preset,
    presetChosen: true,
    presetChips: BOOT.presetChips,
    presetTweaks: BOOT.presetTweaks,
    tweaks: BOOT.tweaks,
    periods: [],
    dates: [],
    selectedKeys: [],
    peopleByKey: {},

    // 午休/晚饭确认弹窗
    breakConfirm: { show: false, key: '', title: '', desc: '' },

    // Step 5 — task-level rules (labels from DB catalog)
    requiredFieldOptions: BOOT.requiredFieldOptions,
    requiredFields: [],
    requiredFieldMap: BOOT.requiredFieldMap,
    customInput: '',
    requiredFieldLabels: {},
    participantScopeOptions: BOOT.participantScopeOptions,
    participantScope: 'all_members',
    reservedText: '',
    reservedNames: [],
    allowEditAfterSubmit: false,
    maxEditCount: 0,
    remindOptions: BOOT.remindOptions,
    remindOptionLabels: BOOT.remindOptionLabels,
    remindIndex: BOOT.remindIndex,
    remindBeforeMinutes: BOOT.remindBeforeMinutes,
    saveAsTemplate: false,
    templateName: '',

    // Step 5 — paint
    maxCapacity: 1,
    paintTools: buildPaintTools(1),
    activeTool: 1,
    submitting: false,
    catalogLoaded: false,
  },

  onLoad(options) {
    const today = todayYmd();
    const deadline = defaultDeadlineIso();
    this.setData({
      groupId: options.groupId || '',
      dateStart: today,
      dateEnd: today,
      deadline,
      deadlineDate: deadlineDateFromIso(deadline),
    });
    // Full catalog from MySQL (presets + option labels)
    api
      .request('/catalog/task-create')
      .then((catalog) => {
        const next = applyCatalog(catalog);
        this.setData({ ...next, catalogLoaded: true });
      })
      .catch(() => {
        this.setData({ catalogLoaded: false });
      });
  },

  input(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    this.setData({ [field]: e.detail.value });
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  onDateChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    if (!field) return;

    if (field === 'deadline') {
      this.setData({
        deadlineDate: value,
        deadline: `${value}T23:59:00.000+08:00`,
      });
      return;
    }

    const patch = { [field]: value };
    if (field === 'dateStart') {
      const end = this.data.dateEnd || value;
      if (end < value) patch.dateEnd = value;
      else if (inclusiveDaySpan(value, end) > MAX_TASK_SPAN_DAYS) {
        patch.dateEnd = addDaysYmd(value, MAX_TASK_SPAN_DAYS - 1);
        wx.showToast({ title: `任务最长 ${MAX_TASK_SPAN_DAYS} 天`, icon: 'none' });
      }
    }
    if (field === 'dateEnd') {
      const start = this.data.dateStart || value;
      if (value < start) patch.dateStart = value;
      else if (inclusiveDaySpan(start, value) > MAX_TASK_SPAN_DAYS) {
        patch.dateEnd = addDaysYmd(start, MAX_TASK_SPAN_DAYS - 1);
        wx.showToast({ title: `任务最长 ${MAX_TASK_SPAN_DAYS} 天`, icon: 'none' });
      }
    }
    this.setData(patch);
  },

  onTweakInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    let value = e.detail.value;
    if (field !== 'firstStart') {
      const n = Number(value);
      value = Number.isFinite(n) ? n : value;
    }
    this.setData({
      [`tweaks.${field}`]: value,
      periods: [],
    });
  },

  onTweakTimeChange(e) {
    this.setData({
      'tweaks.firstStart': e.detail.value,
      periods: [],
    });
  },

  onTweakRangeChange(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    this.setData({
      [`tweaks.${field}`]: e.detail.value,
      periods: [],
    });
  },

  onTweakSwitch(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    const negate = e.currentTarget.dataset.negate;
    const value = negate ? !e.detail.value : e.detail.value;
    this.setData({ [`tweaks.${field}`]: value, periods: [] });
    // 大小课间开启后自动生成骨架
    if (field === 'hasBigBreak' && value) {
      this.generatePeriods();
    }
  },

  /** Step2 午休/晚饭主开关 → 直接切换 */
  onBreakSwitch(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const cap = key === 'lunch' ? 'Lunch' : 'Dinner';
    this.setData({ [`tweaks.has${cap}`]: e.detail.value, periods: [] });
  },

  /** 时间选定页胶囊开关：阻塞 → 弹窗确认；可排 → 直接切回阻塞 */
  onBreakToggle(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const cap = key === 'lunch' ? 'Lunch' : 'Dinner';
    const blocked = this.data.tweaks[`${key}Blocked`];
    if (blocked) {
      // 当前不排 → 弹窗确认改为"全时间段可排"
      this.setData({
        breakConfirm: {
          show: true,
          key,
          title: key === 'lunch' ? '确认开启午休全时段排版' : '确认开启晚饭全时段排版',
          desc: key === 'lunch'
            ? '开启后午休时间将不再锁定，所有人可在午休时段提交可用时间。'
            : '开启后晚饭时间将不再锁定，所有人可在晚饭时段提交可用时间。',
        },
      });
    } else {
      // 当前可排 → 直接切回不排
      this.setData({ [`tweaks.${key}Blocked`]: true });
    }
  },

  closeBreakConfirm() {
    this.setData({ breakConfirm: { show: false, key: '', title: '', desc: '' } });
  },

  confirmBreakToggle() {
    const key = this.data.breakConfirm.key;
    if (!key) return this.closeBreakConfirm();
    this.setData({
      [`tweaks.${key}Blocked`]: false,
      breakConfirm: { show: false, key: '', title: '', desc: '' },
    });
  },

  noop() {},

  showBreakInfo(e) {
    const key = e.currentTarget.dataset.key;
    const msg = key === 'short-break'
      ? '两节连排为一次课，节间短暂休息（如5分钟），用于翻书/换教室。'
      : '两次课之间的常规休息（如20分钟），学生可自由活动。';
    wx.showModal({ title: key === 'short-break' ? '上课间休息' : '普通课间', content: msg, showCancel: false, confirmText: '知道了' });
  },

  toggleMode(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const modeFlags = {
      range: !!this.data.modeFlags.range,
      section: !!this.data.modeFlags.section,
      custom: !!this.data.modeFlags.custom,
    };
    modeFlags[key] = !modeFlags[key];

    // 时间段+节次 → section_range，隐藏自定义
    if (modeFlags.range && modeFlags.section) {
      modeFlags.custom = false;
    }
    // 单点自定义时清掉其它
    if (key === 'custom' && modeFlags.custom) {
      modeFlags.range = false;
      modeFlags.section = false;
    }

    const timeMode = resolveTimeMode(modeFlags);
    const showCustomChip = !(modeFlags.range && modeFlags.section);
    this.setData({
      modeFlags,
      timeMode,
      showCustomChip,
      periods: [],
    });
  },

  selectPreset(e) {
    const preset = e.currentTarget.dataset.preset;
    const table = this.data.presetTweaks || {};
    if (!preset || !table[preset]) return;
    this.setData({
      preset,
      presetChosen: true,
      tweaks: { ...table[preset] },
      periods: [],
    });
  },

  generatePeriods() {
    const periods = buildPeriods({
      preset: this.data.preset,
      tweaks: this.data.tweaks,
    });
    if (!periods.length) {
      wx.showToast({ title: '请至少设置 1 个节次', icon: 'none' });
      return;
    }
    this.setData({
      periods,
      // 骨架变更时清空后续状态
      selectedKeys: [],
      peopleByKey: {},
    });
    wx.showToast({ title: `已生成 ${periods.length} 个时段`, icon: 'success' });
  },

  goStep(step) {
    this.setData({ step });
  },

  nextFromStep1() {
    const title = String(this.data.title || '').trim();
    if (!title) {
      wx.showToast({ title: '请先填写任务名称', icon: 'none' });
      return;
    }
    if (title.length > 160) {
      wx.showToast({ title: '任务名称过长', icon: 'none' });
      return;
    }
    if (!this.data.dateStart || !this.data.dateEnd) {
      wx.showToast({ title: '请选择日期', icon: 'none' });
      return;
    }
    if (this.data.dateEnd < this.data.dateStart) {
      wx.showToast({ title: '结束日期不能早于开始', icon: 'none' });
      return;
    }
    if (inclusiveDaySpan(this.data.dateStart, this.data.dateEnd) > MAX_TASK_SPAN_DAYS) {
      wx.showToast({ title: `任务最长 ${MAX_TASK_SPAN_DAYS} 天（一周）`, icon: 'none' });
      return;
    }
    this.setData({ title, step: 2 });
  },

  nextFromStep2() {
    if (!this.data.periods.length) {
      wx.showToast({ title: '请先生成课表骨架', icon: 'none' });
      return;
    }
    const dates = buildDates(this.data.dateStart, this.data.dateEnd);
    if (!dates.length) {
      wx.showToast({ title: '日期范围无效', icon: 'none' });
      return;
    }
    // 进入初预览；不产生选中状态
    this.setData({ dates, step: 3 });
  },

  nextFromStep3() {
    // 进入时间选定：默认全不选
    this.setData({
      step: 4,
      selectedKeys: [],
    });
  },

  nextFromStep4() {
    const keys = this.data.selectedKeys || [];
    if (!keys.length) {
      wx.showToast({ title: '请先选定可排班时段', icon: 'none' });
      return;
    }
    const maxCapacity = Math.max(1, Number(this.data.maxCapacity) || 1);
    this.setData({
      step: 5,
      maxCapacity,
      paintTools: buildPaintTools(maxCapacity),
      activeTool: clampActiveTool(this.data.activeTool, maxCapacity),
    });
  },

  onSelectChange(e) {
    const keys = (e.detail && e.detail.keys) || [];
    this.setData({ selectedKeys: keys });
  },

  // ---- Step 5: rules form ----

  toggleRequiredField(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const set = new Set(this.data.requiredFields || []);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    const options = this.data.requiredFieldOptions || [];
    const requiredFields = options.map((o) => o.key).filter((k) => set.has(k));
    const requiredFieldMap = { ...(this.data.requiredFieldMap || {}) };
    options.forEach((o) => {
      requiredFieldMap[o.key] = set.has(o.key);
    });
    this.setData({ requiredFields, requiredFieldMap });
  },

  onQuickWeek(e) {
    const which = e.currentTarget.dataset.which;
    const range = which === 'next' ? nextWeekRange() : thisWeekRange();
    if (!range.start || !range.end) return;
    this.setData({ dateStart: range.start, dateEnd: range.end });
  },

  onCustomInput(e) {
    this.setData({ customInput: e.detail.value });
  },

  addCustomField() {
    const label = (this.data.customInput || '').trim();
    if (!label) {
      wx.showToast({ title: '请输入自定义项名称', icon: 'none' });
      return;
    }
    if (label.length > 40) {
      wx.showToast({ title: '名称不能超过 40 字', icon: 'none' });
      return;
    }
    const options = this.data.requiredFieldOptions || [];
    if (options.some((o) => o.label === label)) {
      wx.showToast({ title: '该必填项已存在', icon: 'none' });
      return;
    }
    const existingKeys = new Set(options.map((o) => o.key));
    const base = `custom_${slugify(label)}`;
    let key = base;
    let n = 1;
    while (existingKeys.has(key)) {
      n += 1;
      key = `${base}_${n}`;
    }
    // Server CUSTOM_FIELD_RE = /^custom_[A-Za-z0-9_]{1,48}$/ allows <=55 chars total.
    if (key.length > 55) key = key.slice(0, 55);
    const option = { key, label, custom: true };
    const requiredFieldOptions = options.concat(option);
    const requiredFieldLabels = { ...(this.data.requiredFieldLabels || {}), [key]: label };
    const set = new Set(this.data.requiredFields || []);
    set.add(key);
    const requiredFields = requiredFieldOptions.map((o) => o.key).filter((k) => set.has(k));
    const requiredFieldMap = { ...(this.data.requiredFieldMap || {}) };
    requiredFieldOptions.forEach((o) => {
      requiredFieldMap[o.key] = set.has(o.key);
    });
    this.setData({
      requiredFieldOptions,
      requiredFieldLabels,
      requiredFields,
      requiredFieldMap,
      customInput: '',
    });
  },

  selectParticipantScope(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    this.setData({ participantScope: key });
  },

  onReservedTextInput(e) {
    this.setData({ reservedText: e.detail.value });
  },

  parseReserved() {
    const names = parseReservedNames(this.data.reservedText);
    this.setData({ reservedNames: names });
    if (!names.length) {
      wx.showToast({ title: '未解析到姓名', icon: 'none' });
    }
  },

  removeReservedName(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0) return;
    const reservedNames = (this.data.reservedNames || []).slice();
    reservedNames.splice(index, 1);
    this.setData({
      reservedNames,
      reservedText: reservedNames.join('、'),
    });
  },

  onAllowEditChange(e) {
    const allow = !!(e.detail && (e.detail.value === true || e.detail.value === 'true'));
    this.setData({
      allowEditAfterSubmit: allow,
      maxEditCount: allow ? Math.max(1, Number(this.data.maxEditCount) || 1) : 0,
    });
  },

  onMaxEditCountInput(e) {
    const n = Number(e.detail.value);
    this.setData({
      maxEditCount: Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0,
    });
  },

  onRemindChange(e) {
    const index = Number(e.detail.value);
    const options = this.data.remindOptions || [];
    const opt = options[index] || options[0] || { value: 30 };
    this.setData({
      remindIndex: index,
      remindBeforeMinutes: opt.value,
    });
  },

  onSaveAsTemplateChange(e) {
    const on = !!(e.detail && (e.detail.value === true || e.detail.value === 'true'));
    this.setData({ saveAsTemplate: on });
  },

  onTemplateNameInput(e) {
    this.setData({ templateName: e.detail.value });
  },

  // ---- Step 5: paint ----

  onMaxCapacityInput(e) {
    let n = Number(e.detail.value);
    if (!Number.isFinite(n) || n < 1) n = 1;
    n = Math.min(100, Math.floor(n));
    const activeTool = clampActiveTool(this.data.activeTool, n);
    // Drop painted values above new max
    const peopleByKey = { ...(this.data.peopleByKey || {}) };
    Object.keys(peopleByKey).forEach((key) => {
      if (peopleByKey[key] > n) peopleByKey[key] = n;
    });
    this.setData({
      maxCapacity: n,
      paintTools: buildPaintTools(n),
      activeTool,
      peopleByKey,
    });
  },

  selectPaintTool(e) {
    const raw = e.currentTarget.dataset.tool;
    if (raw === 'erase') {
      this.setData({ activeTool: 'erase' });
      return;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) return;
    this.setData({ activeTool: n });
  },

  onPaint(e) {
    const peopleByKey = (e.detail && e.detail.peopleByKey) || {};
    this.setData({ peopleByKey });
  },

  // ---- Submit ----

  tryRequestSubscribe() {
    // Light-touch: only when a template id is configured in storage; never block submit.
    let tmplId = '';
    try {
      tmplId = wx.getStorageSync('scheduling-tmpl-deadline') || '';
    } catch (_) {
      tmplId = '';
    }
    if (!tmplId || typeof wx.requestSubscribeMessage !== 'function') {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      wx.requestSubscribeMessage({
        tmplIds: [tmplId],
        complete: () => resolve(),
        fail: () => resolve(),
      });
    });
  },

  ensureReservedNames() {
    if (this.data.participantScope !== 'reserved_list') {
      return this.data.reservedNames || [];
    }
    let names = this.data.reservedNames || [];
    if (!names.length && this.data.reservedText) {
      names = parseReservedNames(this.data.reservedText);
      this.setData({ reservedNames: names });
    }
    return names;
  },

  validateStep5() {
    const keys = this.data.selectedKeys || [];
    if (!keys.length) {
      return { ok: false, message: messageForCode('TASK_SLOT_REQUIRED', '请先选定可排班时段') };
    }
    if (this.data.participantScope === 'reserved_list') {
      const names = this.ensureReservedNames();
      if (!names.length) {
        return { ok: false, message: messageForCode('RESERVED_LIST_REQUIRED', '预留名单不能为空') };
      }
    }
    if (this.data.allowEditAfterSubmit) {
      const maxEdit = Number(this.data.maxEditCount);
      if (!Number.isInteger(maxEdit) || maxEdit < 1) {
        return { ok: false, message: '允许修改时，修改次数至少为 1' };
      }
    }
    if (this.data.saveAsTemplate) {
      const name = String(this.data.templateName || '').trim();
      if (!name) {
        return { ok: false, message: '保存模板时请填写模板名称' };
      }
      if (name.length > 120) {
        return { ok: false, message: '模板名称过长' };
      }
    }
    if (!this.data.groupId) {
      return { ok: false, message: '缺少分组信息，请从分组进入创建' };
    }
    if (!this.data.deadline) {
      return { ok: false, message: '请设置收集截止时间' };
    }
    return { ok: true };
  },

  buildCreatePayload() {
    const selectedKeys = this.data.selectedKeys || [];
    const peopleByKey = this.data.peopleByKey || {};
    const selectedSlots = selectedKeys.map((key) => {
      const { date, periodCode } = parseSlotKey(key);
      return {
        date,
        periodCode,
        maxPeople: peopleByKey[key] || 1,
      };
    });

    const rules = {
      requiredFields: this.data.requiredFields || [],
      requiredFieldLabels: this.data.requiredFieldLabels || {},
      participantScope: this.data.participantScope || 'all_members',
      allowEditAfterSubmit: !!this.data.allowEditAfterSubmit,
      maxEditCount: this.data.allowEditAfterSubmit
        ? Math.max(1, Number(this.data.maxEditCount) || 1)
        : 0,
      remindBeforeMinutes:
        this.data.remindBeforeMinutes === null || this.data.remindBeforeMinutes === undefined
          ? null
          : Number(this.data.remindBeforeMinutes),
    };

    if (rules.participantScope === 'reserved_list') {
      rules.reservedNames = this.ensureReservedNames();
    }
    if (this.data.saveAsTemplate) {
      rules.saveAsTemplate = true;
      rules.templateName = String(this.data.templateName || '').trim();
    }

    return {
      title: String(this.data.title || '').trim(),
      dateStart: this.data.dateStart,
      dateEnd: this.data.dateEnd,
      deadline: this.data.deadline,
      timeMode: this.data.timeMode,
      periods: this.data.periods,
      selectedSlots,
      rules,
    };
  },

  submit() {
    if (this.data.submitting) return;
    const check = this.validateStep5();
    if (!check.ok) {
      wx.showToast({ title: check.message, icon: 'none' });
      return;
    }

    const payload = this.buildCreatePayload();
    this.setData({ submitting: true });

    this.tryRequestSubscribe()
      .then(() =>
        api.request(`/groups/${this.data.groupId}/tasks`, {
          method: 'POST',
          data: payload,
        })
      )
      .then((task) => {
        const id = task && (task.id || task.taskId);
        if (!id) {
          wx.showToast({ title: '创建成功但未返回任务 ID', icon: 'none' });
          this.setData({ submitting: false });
          return;
        }
        wx.redirectTo({
          url: `/pages/task-detail/task-detail?id=${id}&manage=1`,
        });
      })
      .catch((error) => {
        const code = error?.data?.error?.code || error?.code;
        const msg =
          api.errorMessage(error, '') ||
          messageForCode(code, '') ||
          '创建失败，请稍后重试';
        wx.showToast({ title: msg, icon: 'none' });
        this.setData({ submitting: false });
      });
  },

  back() {
    const step = Number(this.data.step) || 1;
    if (step <= 1) return;
    // Step3 back → step2 without clearing periods/selectedKeys
    // (regenerate on step2 is what clears selection)
    this.setData({ step: step - 1 });
  },
});
