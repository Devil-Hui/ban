const clean = (value, max) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

function dateTime(value) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(value));
}

function templateId(env, key) {
  const value = String(env[key] ?? '').trim();
  if (!value) throw new Error(`${key} is required for WeChat notifications`);
  return value;
}

export function resolveNotificationTemplate(eventType, payload, env = process.env) {
  if (eventType === 'schedule.collection.started') {
    return {
      templateId: templateId(env, 'WX_TEMPLATE_JOIN_SUCCESS_ID'),
      page: `pages/task-detail/task-detail?id=${encodeURIComponent(payload.taskId)}&manage=0`,
      data: {
        thing1: { value: clean(payload.title, 20) },
        thing2: { value: clean(payload.description || '请进入排班任务提交可用时间', 20) },
        name3: { value: clean(payload.creatorName || '排班管理员', 10) },
      },
    };
  }
  if (eventType === 'schedule.availability.missing') {
    return {
      templateId: templateId(env, 'WX_TEMPLATE_MISSING_AVAILABILITY_ID'),
      page: `pages/availability/availability?taskId=${encodeURIComponent(payload.taskId)}`,
      data: {
        phrase1: { value: '可用时间' },
        date2: { value: dateTime(payload.deadline) },
        name3: { value: clean(payload.publisherName || '排班管理员', 10) },
        thing6: { value: clean(payload.taskTitle, 20) },
        thing5: { value: clean(payload.groupName, 20) },
      },
    };
  }
  return null;
}
