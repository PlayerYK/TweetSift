// src/content/injected.js
// 注入到页面 main world 的脚本
//
// 使用 XMLHttpRequest 代替 fetch 发送请求。
// XHR 在同源页面中发送时，浏览器的 Sec-Fetch 头处理与 fetch 不同，
// 可能绕过 Twitter 对 fetch 的特殊检测。

(function () {
  'use strict';

  window.addEventListener('tweetsift-request', (e) => {
    const { id, url, method, headers, body } = e.detail;

    const xhr = new XMLHttpRequest();
    xhr.open(method || 'GET', url, true);
    xhr.withCredentials = true;

    // 设置 headers
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        try {
          xhr.setRequestHeader(key, value);
        } catch {
        }
      }
    }

    xhr.onload = () => {
      window.dispatchEvent(new CustomEvent('tweetsift-response', {
        detail: {
          id,
          status: xhr.status,
          statusText: xhr.statusText,
          body: xhr.responseText,
        },
      }));
    };

    xhr.onerror = () => {
      window.dispatchEvent(new CustomEvent('tweetsift-response', {
        detail: { id, status: 0, statusText: 'NetworkError', body: 'XHR 网络错误' },
      }));
    };

    xhr.ontimeout = () => {
      window.dispatchEvent(new CustomEvent('tweetsift-response', {
        detail: { id, status: 0, statusText: 'Timeout', body: '请求超时' },
      }));
    };

    xhr.timeout = 30000;

    if (body && (method === 'POST' || method === 'PUT')) {
      xhr.send(body);
    } else {
      xhr.send();
    }
  });
})();
