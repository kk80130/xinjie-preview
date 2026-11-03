(() => {
  "use strict";
  // 静态展示没有接收服务，避免请求不存在的接口或承诺远程送达。
  window.uiRecords = { getStatus: () => ({ enabled: false, online: false, pending: 0, persisted: true }) };
  document.querySelectorAll("[data-records-status]").forEach((node) => {
    node.textContent = "静态预览版：体验记录和反馈仅保存在当前浏览器，不会发送给设计者。";
  });
})();
