import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

window.addEventListener('error', (e) => {
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#DC2626;color:#fff;padding:12px;font-size:12px;white-space:pre-wrap;';
  el.textContent = 'JS错误: ' + e.message + '\n' + (e.error?.stack || '');
  document.body.appendChild(el);
});
window.addEventListener('unhandledrejection', (e) => {
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#D97706;color:#fff;padding:12px;font-size:12px;white-space:pre-wrap;';
  el.textContent = 'Promise错误: ' + (e.reason?.stack || e.reason);
  document.body.appendChild(el);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
