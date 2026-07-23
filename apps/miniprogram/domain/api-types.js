/**
 * 前端 API 接口类型定义（JSDoc 格式，兼容小程序 Babel 编译）
 * 与后端路由一一对应，编译期确保路径正确
 *
 * @see services/api/src 各 controller
 *
 * 使用方式：
 *   const { api } = require('../../utils/api');
 *   /** @type {import('../domain/api-types').GroupListResponse} * / const groups = await api.request('/groups');
 */

/** ── 用户 ── */

/**
 * @typedef {Object} UserInfo
 * @property {string} id
 * @property {string} nickname
 * @property {string|null} avatarUrl
 */

/**
 * POST /auth/wechat/login → { accessToken, refreshToken, user }
 * @typedef {Object} LoginResponse
 * @property {string} accessToken
 * @property {string} refreshToken
 * @property {UserInfo} user
 */

/** POST /auth/wechat/phone-login → 同上
 * @typedef {LoginResponse} PhoneLoginResponse
 */

/** ── 分组 ── */

/**
 * @typedef {Object} GroupSummary
 * @property {string} id
 * @property {string} name
 * @property {string} ownerId
 * @property {string} status
 * @property {string} inviteCode
 * @property {string|null} description
 * @property {string} [role]
 * @property {string} [roleLabel]
 */

/** GET /groups → GroupSummary[]
 * @typedef {GroupSummary[]} GroupListResponse
 */

/** POST /groups → GroupSummary
 * @typedef {Object} CreateGroupPayload
 * @property {string} name
 * @property {string} [description]
 * @property {string} [ownerDisplayName]
 */

/** POST /groups/join
 * @typedef {Object} JoinGroupPayload
 * @property {string} inviteCode
 * @property {string} displayName
 */

/** ── 排班任务 ── */

/**
 * @typedef {Object} Period
 * @property {string} code
 * @property {string} label
 * @property {string} timeRange
 * @property {number} startMinute
 * @property {number} endMinute
 * @property {number} minPeople
 * @property {number} targetPeople
 * @property {number} maxPeople
 * @property {boolean} [rest]
 */

/**
 * @typedef {Object} Task
 * @property {string} id
 * @property {string} title
 * @property {'collecting'|'ready'|'reviewing'|'adjusting'|'published'} status
 * @property {string} dateStart
 * @property {string} dateEnd
 * @property {string} deadline
 * @property {string} timeMode
 * @property {Period[]} periods
 * @property {string} groupId
 * @property {string} groupName
 */

/** POST /groups/:groupId/tasks
 * @typedef {Object} CreateTaskPayload
 * @property {string} title
 * @property {string} dateStart
 * @property {string} dateEnd
 * @property {string} deadline
 * @property {string} timeMode
 * @property {Period[]} periods
 * @property {string[]} selectedKeys
 * @property {Object<string, number>} peopleByKey
 * @property {Object} [rules]
 */

/** GET /groups/:groupId/tasks → Task[]
 * @typedef {Task[]} TaskListResponse
 */

/** GET /users/me/schedule → 个人已发布排班
 * @typedef {Object} PersonalScheduleItem
 * @property {string} id
 * @property {string} slotId
 * @property {string} startsAt
 * @property {string} endsAt
 * @property {string} slotDate
 * @property {string} taskId
 * @property {string} title
 * @property {string} groupId
 * @property {string} groupName
 */

/**
 * @typedef {PersonalScheduleItem[]} PersonalSchedule
 */

/** ── Catalog ── */

/**
 * @typedef {Object} CampusPreset
 * @property {string} code
 * @property {string} label
 * @property {string} firstStart
 * @property {number} durationMin
 * @property {number} morningCount
 * @property {number} afternoonCount
 * @property {number} eveningCount
 * @property {number} breakMin
 * @property {string} [lunchStart]
 * @property {string} [lunchEnd]
 * @property {boolean} [hasLunch]
 * @property {string} [dinnerStart]
 * @property {string} [dinnerEnd]
 * @property {boolean} [hasDinner]
 */

/** GET /catalog/task-create
 * @typedef {Object} TaskCreateCatalog
 * @property {CampusPreset[]} campusPresets
 * @property {Array<{code: string, label: string}>} requiredFields
 * @property {Array<{code: string, label: string}>} participantScopes
 * @property {Array<{label: string, value: number|null}>} remindOptions
 * @property {Array<{index: number, label: string}>} wizardSteps
 */

/** ── 通用错误 ── */

/**
 * @typedef {Object} ApiError
 * @property {Object} error
 * @property {string} error.code
 * @property {string} error.message
 * @property {string} error.requestId
 */

module.exports = {};
