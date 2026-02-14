// src/content/injected.js
// Script injected into page main world
//
// Uses XMLHttpRequest instead of fetch to send requests.
// XHR in same-origin pages handles Sec-Fetch headers differently from fetch,
// which may bypass Twitter's special detection of fetch requests.

(function () {
  'use strict';

  window.addEventListener('tweetsift-request', (e) => {
    const { id, url, method, headers, body } = e.detail;

    const xhr = new XMLHttpRequest();
    xhr.open(method || 'GET', url, true);
    xhr.withCredentials = true;

    // Set headers
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
        detail: { id, status: 0, statusText: 'NetworkError', body: 'XHR network error' },
      }));
    };

    xhr.ontimeout = () => {
      window.dispatchEvent(new CustomEvent('tweetsift-response', {
        detail: { id, status: 0, statusText: 'Timeout', body: 'Request timeout' },
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
