const { contextBridge, ipcRenderer } = require("electron");
const methods = [
  "state",
  "updateVariable",
  "templateOptions",
  "updateCatalog",
  "renderPreview",
  "saveSettings",
  "verify",
  "previewMail",
  "renameTemplate",
  "readTemplate",
  "saveTemplate",
  "createOffer",
  "draft",
  "editOffer",
  "refreshOffer",
  "deleteOffer",
  "saveNotice",
  "previewNotice",
  "record",
  "reconcile",
  "openPdf",
  "exportPdf",
  "send",
  "resend",
];
contextBridge.exposeInMainWorld("offerFlow", {
  platform: process.platform,
  ...Object.fromEntries(
    methods.map((method) => [
      method,
      (...args) => ipcRenderer.invoke("offer:" + method, ...args),
    ]),
  ),
});
