'use strict';

/**
 * 截止调度 worker：扫描 countdowns 到期项 → 站内消息 / 微信订阅 / 状态推进。
 * 用法：
 *   node scripts/run-deadline-worker.js
 *   或 require 后 processDueCountdowns(repos)
 */

const { actionForCountdown } = require('../domain/countdown');
const { notifyGroupMembers, notifyUser } = require('../services/notify-dispatch');

/**
 * @param {object} repos getRepos()
 * @param {{ now?: Date|string|number }} [opts]
 * @returns {Promise<{ processed: number, reminders: number, closed: number }>}
 */
async function processDueCountdowns(repos, opts = {}) {
  const nowIso =
    opts.now != null
      ? new Date(opts.now).toISOString()
      : new Date().toISOString();

  if (!repos.countdowns || !repos.countdowns.listDue) {
    return { processed: 0, reminders: 0, closed: 0, skipped: true };
  }

  const due = await repos.countdowns.listDue(nowIso);
  let reminders = 0;
  let closed = 0;

  for (const item of due) {
    const task = await repos.tasks.getById(item.taskId);
    if (!task) {
      await repos.countdowns.markDone(item.id);
      continue;
    }

    if (item.type === 'reminder') {
      await notifyGroupMembers(repos, {
        groupId: task.groupId,
        logicalKey: 'deadline_remind',
        title: '填报即将截止',
        body: `「${task.title || '排班任务'}」即将截止，请尽快提交空闲时间`,
        taskId: task.id,
        taskTitle: task.title,
        extra: { deadline: task.deadline, statusText: '待提交' },
      });
      reminders += 1;
    } else if (item.type === 'deadline') {
      const action = actionForCountdown('deadline', task.status);
      if (action === 'to_reviewing' && repos.tasks.updateWithVersion) {
        try {
          await repos.tasks.updateWithVersion(
            task.id,
            { status: 'reviewing' },
            task.version
          );
        } catch (_) {
          /* 版本冲突：仍标记 countdown done，避免死循环 */
        }
      }
      if (task.publisherId) {
        await notifyUser(repos, {
          userId: task.publisherId,
          logicalKey: 'deadline_closed',
          title: '收集已截止',
          body: `「${task.title || '排班任务'}」收集已截止，可生成排班方案`,
          taskId: task.id,
          groupId: task.groupId,
          taskTitle: task.title,
          extra: { statusText: '已截止' },
        });
      }
      closed += 1;
    }

    await repos.countdowns.markDone(item.id);
  }

  return { processed: due.length, reminders, closed };
}

module.exports = { processDueCountdowns };
