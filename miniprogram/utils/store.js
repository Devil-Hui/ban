// utils/store.js — 轻量全局状态 + 事件订阅（避免引入额外框架）
const { getStoredUser } = require('./auth');

const state = {
  user: getStoredUser(), // { id, nickname, avatar, role }
  unread: 0,             // 消息中心未读数
};

const listeners = {}; // event -> [fn]

function setUser(user) {
  state.user = user;
  emit('user', user);
}

function getUser() {
  return state.user;
}

function setUnread(n) {
  state.unread = n || 0;
  emit('unread', state.unread);
}

function getUnread() {
  return state.unread;
}

function on(event, fn) {
  (listeners[event] = listeners[event] || []).push(fn);
  return () => off(event, fn);
}

function off(event, fn) {
  const arr = listeners[event];
  if (!arr) return;
  const i = arr.indexOf(fn);
  if (i >= 0) arr.splice(i, 1);
}

function emit(event, payload) {
  (listeners[event] || []).forEach((fn) => {
    try {
      fn(payload);
    } catch (e) {
      console.error('[store] listener error', e);
    }
  });
}

module.exports = { state, setUser, getUser, setUnread, getUnread, on, off, emit };
