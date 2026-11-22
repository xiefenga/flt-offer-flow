const { formatDateTime } = require("../shared/date-time.mjs");
const { parseCc } = require("../shared/validation.mjs");
const { templateStore } = require("./templates.cjs");

const {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  dialog,
  shell,
} = require("electron");
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const nodemailer = require("nodemailer");
const {
  fields,
  defaultMail,
  buildOffer,
  renderMail,
  emailOK,
} = require("./offer.cjs");

const { historyStore } = require("./history.cjs");
let db, win, history, tempDir, templates;
const blankSettings = {
  host: "",
  port: 465,
  mode: "tls",
  user: "",
  from: "",
  sender: "",
  cc: "",
};
const get = (key, fallback) => {
  const row = db.prepare("SELECT value FROM config WHERE key=?").get(key);
  return row ? JSON.parse(row.value) : fallback;
};
const put = (key, value) =>
  db
    .prepare("INSERT OR REPLACE INTO config VALUES (?,?)")
    .run(key, JSON.stringify(value));
function settingsView() {
  const { secret, ...settings } = get("smtp", blankSettings);
  return { ...settings, hasPassword: Boolean(secret) };
}
function smtp() {
  const config = get("smtp", null);
  if (!config) {
    throw Error("请先到「邮箱设置」保存发件邮箱。");
  }
  let password;
  try {
    password = safeStorage.decryptString(Buffer.from(config.secret, "base64"));
  } catch {
    throw Error("请到「邮箱设置」重新填写并保存授权码。");
  }
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.mode === "tls",
    requireTLS: true,
    auth: { user: config.user, pass: password },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 45000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    transport,
    from: { name: config.sender, address: config.from },
    cc: config.cc ?? "",
  };
}
async function makePdf(html) {
  const page = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, javascript: false },
  });
  try {
    await page.loadURL(
      "data:text/html;charset=utf-8," + encodeURIComponent(html),
    );
    return await page.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    page.destroy();
  }
}
const { defaults, updateCatalog, resolveOffer } = require("./catalog.cjs");
const catalog = () => get("catalog", defaults);
function offerTemplates(values) {
  const mail = templates.read("mail", values.mailTemplateId);
  const notice = templates.read("notice", values.noticeTemplateId);
  const layout = Object.keys(require("../templates/pdf-layout.json")).map(
    (key) => notice[key],
  );
  const hash = createHash("sha256")
    .update(
      JSON.stringify([mail.subject, mail.richText, notice.richText, layout]),
    )
    .digest("hex");
  return { mail, notice, hash };
}
async function generateOffer(input, original, refresh = false) {
  if (!refresh) {
    input = resolveOffer(input, catalog(), original);
  }
  input.mailTemplateId ??= original?.mailTemplateId ?? "default";
  input.noticeTemplateId ??= original?.noticeTemplateId ?? "default";
  const { mail, notice, hash } = offerTemplates(input);
  const offer = buildOffer(input, mail, notice, templates.variables());
  offer.templateHash = hash;
  const pdf = await makePdf(offer.document);
  const filename =
    offer.name.replace(/[^\p{L}\p{N}_-]/gu, "_") + "-录用通知书.pdf";
  return { offer, pdf, filename, values: input };
}
function sampleValues() {
  const sample = Object.fromEntries(
    fields.map(([key, , , value]) => [key, value || "1000"]),
  );
  Object.assign(sample, {
    name: "示例候选人",
    department: "研发部",
    role: "工程师",
    email: "sample@example.test",
    issued: "2026-01-05",
    arrival: "2026-02-02T09:00",
  });
  const configured = catalog(),
    company = configured.companies[0] ?? defaults.companies[0];
  Object.assign(sample, {
    company: company.name,
    address: company.address,
    department: configured.departments[0] ?? "示例部门",
    invoiceInfo: company.invoiceInfo,
    allowedBanks: company.banks.join("、"),
  });
  for (const { key, label } of templates.variables()) {
    sample[key] = "示例" + label;
  }
  return sample;
}
async function samplePdf(layout) {
  const { document } = buildOffer(
    sampleValues(),
    defaultMail,
    layout,
    templates.variables(),
  );
  return makePdf(document);
}
function mailboxError(error) {
  if (error.code === "EAUTH") {
    return "无法登录发件邮箱，请到「邮箱设置」检查登录账号和授权码。";
  }
  if (["EDNS", "ECONNECTION", "ETLS", "ETIMEDOUT"].includes(error.code)) {
    return "无法连接发件邮箱，请检查网络和邮箱设置后重试。";
  }
  if (error.rejected?.length) {
    return "以下地址未能发送，请核对：" + error.rejected.join("、");
  }
  return "发件邮箱拒绝了请求，请检查邮箱设置或联系邮箱管理员。";
}
async function deliver(id, resend = false) {
  const { transport, from, cc } = smtp();
  let item;
  try {
    item = history.claim(id, from.address, resend, cc);
  } catch (error) {
    transport.close();
    throw error;
  }
  let result;
  try {
    result = await transport.sendMail({
      from,
      to: { address: item.recipient, name: item.name },
      cc: item.cc
        ? item.cc.split(", ").map((address) => ({ address }))
        : undefined,
      subject: item.subject,
      text: item.body,
      html: item.html,
      attachDataUrls: true,
      attachments: [
        {
          filename: item.filename,
          content: item.pdf,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (error) {
    const uncertain =
      !error.responseCode &&
      !["EAUTH", "EDNS", "ECONNECTION", "ETLS"].includes(error.code);
    const status = uncertain ? "待核实" : "失败";
    const detail = uncertain
      ? "连接中断，请向邮箱服务商核实后再重发"
      : "SMTP 拒绝发送或连接失败：" + (error.responseCode || error.code || "");
    history.finish(id, status, detail);
    throw Error(
      uncertain
        ? "暂时无法确认邮件是否发出。请先核实发送记录，避免重复发送。"
        : mailboxError(error),
    );
  } finally {
    transport.close();
  }
  if (result.rejected?.length) {
    const detail =
      "部分地址已接收。以下地址被拒收：" + result.rejected.join("、");
    history.finish(id, "待核实", detail);
    throw Error(
      "以下地址未能发送：" +
        result.rejected.join("、") +
        "。请先核实其他收件人的收件情况，再决定是否重发。",
    );
  }
  history.finish(id, "已发送");
}
const handlers = {
  state: () => ({
    customVariables: templates.variables(),
    catalog: catalog(),
    settings: settingsView(),
    template: templates.read("mail"),
    templateOptions: {
      mail: templates.options("mail"),
      notice: templates.options("notice"),
    },
    history: history.list(),
    notice: templates.read("notice"),
  }),
  updateCatalog: (kind, original, input) => {
    const result = updateCatalog(catalog(), kind, original, input);
    put("catalog", result);
    return result;
  },
  saveSettings: (input) => {
    const { host, user, from, sender, mode, password } = input;
    const port = Number(input.port);
    if (
      ![host, user, from, sender, password].every(
        (x) => typeof x === "string",
      ) ||
      !host.trim() ||
      /[\s/]/.test(host) ||
      !user.trim() ||
      !emailOK(from) ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      !["tls", "starttls"].includes(mode)
    ) {
      throw Error("请检查 SMTP 配置");
    }
    const old = get("smtp", {});
    let secret = old.secret;
    if (password) {
      if (
        !safeStorage.isEncryptionAvailable() ||
        (process.platform === "linux" &&
          safeStorage.getSelectedStorageBackend() === "basic_text")
      ) {
        throw Error("系统凭据加密不可用");
      }
      secret = safeStorage.encryptString(password).toString("base64");
    } else if (
      !secret ||
      old.host !== host ||
      old.user !== user ||
      old.port !== port ||
      old.mode !== mode
    ) {
      throw Error("首次配置或变更服务器时，请重新填写授权码");
    }
    const cc = parseCc(input.cc);
    if (cc.error) {
      throw Error(cc.error);
    }
    put("smtp", {
      host,
      port,
      mode,
      user,
      from,
      sender,
      cc: cc.addresses.join(", "),
      secret,
    });
    return settingsView();
  },
  verify: async () => {
    const { transport } = smtp();
    try {
      await transport.verify();
    } catch (error) {
      throw Error(mailboxError(error));
    } finally {
      transport.close();
    }
  },
  previewMail: (template) => {
    const sample = sampleValues();
    sample.arrival = formatDateTime(sample.arrival, "minute");
    return renderMail(template, sample, templates.variables());
  },
  updateVariable: (key, label) => templates.updateVariable(key, label),
  templateOptions: () => ({
    mail: templates.options("mail"),
    notice: templates.options("notice"),
  }),
  renameTemplate: (kind, id, name) => templates.rename(kind, id, name),
  readTemplate: (kind, id) => templates.read(kind, id),
  saveTemplate: (input, id, name) => templates.save("mail", input, id, name),
  createOffer: async (input) => {
    const { offer, pdf, filename, values } = await generateOffer(input);
    const id = randomUUID();
    history.create(id, offer, input.role, filename, pdf, values);
    return id;
  },
  draft: (id) => history.draft(id),
  editOffer: async (id, input) => {
    const original = history.draft(id).values;
    const { offer, pdf, filename, values } = await generateOffer(
      input,
      original,
    );
    history.edit(id, offer, values, filename, pdf);
  },
  refreshOffer: async (id, extra = {}) => {
    const { values: original } = history.draft(id);
    const values = { ...original };
    for (const { key } of templates.variables()) {
      if (!values[key]?.trim() && extra[key]) {
        values[key] = extra[key];
      }
    }
    const {
      offer,
      pdf,
      filename,
      values: resolved,
    } = await generateOffer(values, original, true);
    if (
      offerTemplates(values).hash !== offer.templateHash ||
      JSON.stringify(original) !== JSON.stringify(history.draft(id).values)
    ) {
      throw Error("模板或记录已变更，请重新打开详情后更新");
    }
    history.edit(id, offer, resolved, filename, pdf, true);
  },
  deleteOffer: (id) => history.remove(id),
  saveNotice: (input, id, name) => templates.save("notice", input, id, name),
  renderPreview: (layout) => samplePdf(layout),
  previewNotice: async (layout) => {
    const file = path.join(tempDir, "排版预览-" + randomUUID() + ".pdf");
    fs.writeFileSync(file, await samplePdf(layout), { mode: 0o600 });
    const error = await shell.openPath(file);
    if (error) {
      throw Error(error);
    }
  },
  record: (id) => {
    const record = history.detail(id);
    const { mail, hash } = offerTemplates(history.draft(id).values);
    record.templatesChanged = record.template_hash !== hash;
    if (record.templatesChanged) {
      const current = mail.richText;
      const images = (html) =>
        new Set(
          Array.from(
            html.matchAll(/<img\b[^>]*?\ssrc="(data:image\/[^"]+)"/gi),
            (match) => match[1],
          ),
        );
      const snapshotImages = images(record.html || "");
      record.hasNewTemplateImages = [...images(current)].some(
        (src) => !snapshotImages.has(src),
      );
    }
    return record;
  },
  reconcile: (id, accepted) => history.reconcile(id, accepted),
  openPdf: async (id) => {
    const item = history.attachment(id);
    const file = path.join(tempDir, id + ".pdf");
    fs.writeFileSync(file, item.pdf, { mode: 0o600 });
    const error = await shell.openPath(file);
    if (error) {
      throw Error(error);
    }
  },
  exportPdf: async (id) => {
    const item = history.attachment(id);
    const { filePath, canceled } = await dialog.showSaveDialog(win, {
      defaultPath: item.filename,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!canceled && filePath) {
      fs.writeFileSync(filePath, item.pdf);
    }
  },
  send: (id) => deliver(id),
  resend: (id) => deliver(id, true),
};

const backgroundTest =
  !app.isPackaged && app.commandLine.hasSwitch("offer-flow-background-test");
if (backgroundTest && process.platform === "darwin") {
  app.setActivationPolicy("prohibited");
}

const devUrl = !app.isPackaged && process.env.OFFER_FLOW_DEV_URL;
if (devUrl) {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/$/.test(devUrl)) {
    throw Error("开发服务地址须为本机回环地址");
  }
  if (!app.commandLine.hasSwitch("user-data-dir")) {
    const profile = path.join(app.getPath("appData"), "offer-flow-dev");
    fs.mkdirSync(profile, { recursive: true });
    app.setPath("userData", profile);
  }
}
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    db = new DatabaseSync(path.join(app.getPath("userData"), "offers.sqlite"));
    db.exec(
      "CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY,value TEXT NOT NULL)",
    );
    templates = templateStore(db);
    history = historyStore(db);
    tempDir = fs.mkdtempSync(path.join(app.getPath("temp"), "offer-flow-"));
    win = new BrowserWindow({
      show: !backgroundTest,
      focusable: !backgroundTest,
      skipTaskbar: backgroundTest,
      width: 1160,
      height: 850,
      minWidth: 820,
      minHeight: 600,
      title: "Offer Flow",
      backgroundColor: "#f8faf8",
      autoHideMenuBar: true,
      ...(process.platform === "darwin"
        ? { titleBarStyle: "hiddenInset" }
        : {
            titleBarStyle: "hidden",
            titleBarOverlay: {
              color: "#e9efeb",
              symbolColor: "#24382c",
              height: 46,
            },
          }),
      webPreferences: {
        backgroundThrottling: !backgroundTest,
        preload: path.join(__dirname, "preload.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    for (const [name, handler] of Object.entries(handlers)) {
      ipcMain.handle("offer:" + name, (event, ...args) => {
        if (event.senderFrame !== win.webContents.mainFrame) {
          throw Error("非法请求");
        }
        return handler(...args);
      });
    }
    if (devUrl) {
      await win.loadURL(devUrl);
    } else {
      await win.loadFile(path.join(__dirname, "../dist/index.html"));
    }
  });
}
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
