// src/content/toast.js
// Toast notification component

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
 * Show a toast notification
 * @param {string} message - content to display
 * @param {'success'|'error'|'undo'} type - notification type
 * @param {number} duration - display duration (ms), default 1500
 */
export function showToast(message, type = 'success', duration = 1500) {
  const el = ensureToastElement();

  // Clear previous timer
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  // Reset class name
  el.className = 'tweetsift-toast';
  if (type === 'error') {
    el.classList.add('tweetsift-toast-error');
  } else if (type === 'undo') {
    el.classList.add('tweetsift-toast-undo');
  } else {
    el.classList.add('tweetsift-toast-success');
  }

  el.textContent = message;

  // Force reflow then show
  void el.offsetHeight;
  el.classList.add('tweetsift-toast-show');

  hideTimer = setTimeout(() => {
    el.classList.remove('tweetsift-toast-show');
    hideTimer = null;
  }, duration);
}
