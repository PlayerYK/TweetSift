// src/content/toast.js
// Toast 通知组件

let toastEl = null;
let hideTimer = null;

function ensureToastElement() {
  if (toastEl && document.body.contains(toastEl)) return toastEl;

  toastEl = document.createElement('div');
  toastEl.className = 'tweetsift-toast';
  document.body.appendChild(toastEl);
  return toastEl;
}

/**
 * 显示 Toast 通知
 * @param {string} message - 显示内容
 * @param {'success'|'error'|'undo'} type - 通知类型
 * @param {number} duration - 显示时长（ms），默认 1500
 */
export function showToast(message, type = 'success', duration = 1500) {
  const el = ensureToastElement();

  // 清除上一个
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  // 重置类名
  el.className = 'tweetsift-toast';
  if (type === 'error') {
    el.classList.add('tweetsift-toast-error');
  } else if (type === 'undo') {
    el.classList.add('tweetsift-toast-undo');
  } else {
    el.classList.add('tweetsift-toast-success');
  }

  el.textContent = message;

  // 强制重绘后显示
  void el.offsetHeight;
  el.classList.add('tweetsift-toast-show');

  hideTimer = setTimeout(() => {
    el.classList.remove('tweetsift-toast-show');
    hideTimer = null;
  }, duration);
}
