import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import PostalMime from "postal-mime";
import assert from "node:assert/strict";
import { SMTPServer } from "smtp-server";
import { execFileSync } from "node:child_process";
// Uses an isolated Electron profile and a TLS SMTP listener on loopback.
import {
  _electron,
  type ElectronApplication,
  type Locator,
} from "@playwright/test";

import fields from "../templates/fields.json" with { type: "json" };

async function assertPopupFits(popup: Locator) {
  await popup.waitFor();
  const overflow = await popup.evaluate((root) => {
    const bounds = root.getBoundingClientRect();
    if (bounds.left < -1 || bounds.right > innerWidth + 1) {
      return "viewport";
    }
    for (const el of [root, ...root.querySelectorAll<HTMLElement>("*")]) {
      if (
        el.clientWidth &&
        ["auto", "scroll"].includes(getComputedStyle(el).overflowX) &&
        el.scrollWidth > el.clientWidth + 1
      ) {
        return el.className;
      }
    }
    return null;
  });
  assert.equal(overflow, null, "弹层超出窗口或出现横向滚动");
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "offer-flow-test-"));
  let server: SMTPServer | undefined;
  let app: ElectronApplication | undefined;
  let raw = "";
  let rejectManager = false;
  let envelope: string[] = [];
  try {
    const cert = path.join(dir, "cert.pem"),
      key = path.join(dir, "key.pem");
    fs.writeFileSync(
      path.join(dir, "ssl.cnf"),
      "[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=IP:127.0.0.1,DNS:localhost\nbasicConstraints=CA:TRUE\n",
    );
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "1",
        "-config",
        path.join(dir, "ssl.cnf"),
        "-keyout",
        key,
        "-out",
        cert,
      ],
      { stdio: "ignore" },
    );
    server = new SMTPServer({
      name: "localhost",
      secure: true,
      key: fs.readFileSync(key),
      cert: fs.readFileSync(cert),
      onAuth(auth, session, cb) {
        cb(
          auth.username === "user" && auth.password === "test-secret"
            ? null
            : Error("bad credentials"),
          { user: "user" },
        );
      },
      onRcptTo(recipient, _session, cb) {
        cb(
          rejectManager && recipient.address === "manager@example.test"
            ? Object.assign(new Error("Mailbox unavailable"), {
                responseCode: 550,
              })
            : null,
        );
      },
      onData(stream, session, cb) {
        envelope = session.envelope.rcptTo.map((r) => r.address);
        stream.on("data", (chunk) => {
          raw += chunk;
        });
        stream.on("end", cb);
      },
    });
    server.listen(0, "127.0.0.1");
    await once(server.server, "listening");
    const address = server.server.address();
    assert.ok(address && typeof address === "object");
    const launch = async () => {
      const instance = await _electron.launch({
        args: [
          "--offer-flow-background-test",
          "--use-mock-keychain",
          "--user-data-dir=" + dir,
          ".",
        ],
        env: { ...process.env, NODE_EXTRA_CA_CERTS: cert },
        timeout: 20000,
      });
      try {
        await instance.firstWindow();
        assert.equal(
          await instance.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows().some(
              (win) => win.isVisible() || win.isFocused() || win.isFocusable(),
            ),
          ),
          false,
          "测试主窗口应隐藏且不可聚焦",
        );
        return instance;
      } catch (error) {
        await instance.close();
        throw error;
      }
    };
    app = await launch();
    let page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    await page.getByRole("main", { name: "首页" }).waitFor();
    await page.getByRole("table").waitFor();
    await page.getByRole("combobox", { name: "公司", exact: true }).click();
    await page.getByRole("option", { name: "暂无选项" }).waitFor();
    await page.keyboard.press("Escape");
    const header = page.getByRole("banner");
    const createOffer = page.getByRole("button", { name: "新增", exact: true });
    assert.equal(
      await header.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("-webkit-app-region"),
      ),
      "drag",
    );
    assert.equal(
      await createOffer.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("-webkit-app-region"),
      ),
      "no-drag",
    );
    const edges = await page.evaluate(() => {
      const bar = document.querySelector("header")!.getBoundingClientRect();
      const content = document
        .querySelector('[aria-label="页面内容区"]')!
        .getBoundingClientRect();
      return [
        bar.left,
        bar.top,
        innerWidth - bar.right,
        content.left,
        innerWidth - content.right,
        innerHeight - content.bottom,
      ];
    });
    assert.deepEqual(edges, [0, 0, 0, 0, 0, 0]);
    for (const name of [
      "候选人",
      "收件邮箱",
      "部门",
      "公司",
      "岗位",
      "报到时间",
    ]) {
      await page
        .getByRole("columnheader", { name, exact: true })
        .first()
        .waitFor();
    }

    await page.getByRole("button", { name: "新增", exact: true }).click();
    await page.getByLabel("收件邮箱").fill("invalid");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.getByText("请填写候选人姓名", { exact: true }).waitFor();
    await page.getByText("请输入有效的邮箱地址", { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel("收件邮箱").getAttribute("aria-invalid"),
      "true",
    );
    assert.equal(
      (await page.evaluate(() => window.offerFlow.state())).history.length,
      0,
    );
    await page.getByLabel("收件邮箱").fill("valid@example.test");
    await page
      .getByText("请输入有效的邮箱地址", { exact: true })
      .waitFor({ state: "hidden" });
    for (const [key, label, , , hint] of fields) {
      if (["company", "department"].includes(key)) {
        await page.getByRole("combobox", { name: label }).waitFor();
        continue;
      }
      assert.ok(hint?.trim(), label);
      assert.equal(
        await page.getByLabel(label).getAttribute("placeholder"),
        hint,
      );
    }
    const viewport = page.getByRole("region", { name: "页面内容区" });
    const drawer = page.getByRole("dialog", { name: "新增 Offer" });
    await drawer.waitFor();
    const bounds = await drawer.boundingBox();
    assert.ok(bounds && bounds.width > 800);
    const scroll = drawer.locator(".offer-drawer-scroll");
    await scroll.evaluate((el) =>
      el.scrollTo({ top: el.scrollHeight, behavior: "instant" }),
    );
    assert.ok(await scroll.evaluate((el) => el.scrollTop > 0));
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollHeight - innerHeight,
      ),
      0,
    );
    assert.equal(await page.evaluate(() => window.scrollY), 0);
    const arrival = page.getByLabel("报到时间");
    await arrival.click();
    await page.getByRole("button", { name: "确定", exact: true }).waitFor();
    await assertPopupFits(page.locator(".lobe-picker-dropdown:visible"));
    const day = page
      .locator(".lobe-picker-dropdown:visible .lobe-picker-cell-in-view[title]")
      .first();
    const date = await day.getAttribute("title");
    await day.click();
    await page.getByRole("button", { name: "确定", exact: true }).click();
    assert.equal(await arrival.inputValue(), date + " 09:00");

    assert.equal(
      await page
        .locator('header[aria-label="工作区标题栏"]')
        .evaluate((el) => el.hasAttribute("inert")),
      true,
    );
    await drawer.getByRole("button", { name: "取消", exact: true }).click();
    await drawer.waitFor({ state: "hidden" });
    const settingsButton = () =>
      page.getByRole("button", { name: "设置", exact: true });
    async function openSettingsPage(name: string) {
      await settingsButton().click();
      await page.getByRole("menuitem", { name, exact: true }).click();
      await page.getByRole("main", { name, exact: true }).waitFor();
    }
    await settingsButton().click();
    await assertPopupFits(page.getByRole("menu"));
    assert.deepEqual(await page.getByRole("menuitem").allTextContents(), [
      "邮件模板",
      "附件模板",
      "变量管理",
      "公司设置",
      "部门设置",
      "邮箱设置",
    ]);
    assert.equal(
      await page.getByRole("tab", { selected: true }).innerText(),
      "首页",
    );
    await page.keyboard.press("Escape");
    await openSettingsPage("邮箱设置");
    assert.equal(await viewport.evaluate((el) => el.scrollTop), 0);
    await page.getByLabel("SMTP 服务器").fill("127.0.0.1");
    const encryption = page.getByRole("combobox", { name: "连接加密" });
    await encryption.click();
    await page.getByRole("option", { name: "STARTTLS", exact: true }).click();
    assert.equal(await page.getByLabel("端口").inputValue(), "587");
    await encryption.click();
    await page.getByRole("option", { name: "TLS", exact: true }).click();
    assert.equal(await page.getByLabel("端口").inputValue(), "465");
    await page.getByLabel("端口").fill(String(address.port));
    await page.getByLabel("登录账号").fill("user");
    await page.getByLabel("客户端授权码").fill("test-secret");
    await page.getByRole("button", { name: "显示授权码" }).click();
    assert.equal(
      await page.getByLabel("客户端授权码").getAttribute("type"),
      "text",
    );
    await page.getByRole("button", { name: "隐藏授权码" }).click();
    await page.getByLabel("发件邮箱").fill("hr@example.test");
    await page.getByLabel("端口").fill("65536");
    await page.getByRole("button", { name: "保存设置" }).click();
    await page
      .getByText("端口须为 1 至 65535 的整数", { exact: true })
      .waitFor();
    await page.getByLabel("端口").fill(String(address.port));
    const ccInput = page.getByRole("textbox", { name: "抄送邮箱" });
    await ccInput.fill("bad-email");
    await page.getByRole("button", { name: "保存设置", exact: true }).click();
    await page
      .getByText("抄送邮箱格式有误：bad-email", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Remove bad-email" }).click();
    await ccInput.fill(
      "hr@example.test；manager@example.test，HR@example.test;candidate@example.test",
    );
    await page.getByRole("button", { name: "保存设置" }).click();
    await page.getByText("邮箱设置已保存").waitFor();
    const verifyConnection = page.getByRole("button", { name: "测试连接" });
    const beforeToast = await verifyConnection.boundingBox();
    await verifyConnection.click();
    const notification = page
      .locator(".lobe-toast")
      .filter({ hasText: "发件邮箱连接成功" });
    await notification.waitFor();
    assert.equal(
      await notification.evaluate(
        (el) => getComputedStyle(el.closest(".lobe-toast__viewport")!).position,
      ),
      "fixed",
    );
    assert.deepEqual(await verifyConnection.boundingBox(), beforeToast);
    await openSettingsPage("公司设置");
    await page.getByRole("button", { name: "新增公司" }).click();
    await page.getByLabel("公司名称").fill("示例公司");
    await page.getByLabel("报到地址").fill("示例地址");
    await page.getByLabel("开票信息").fill("示例开票资料");
    await page.getByLabel("限定银行").fill("示例银行");
    await page.getByRole("button", { name: "保存公司" }).click();
    await page.getByText("公司已更新").waitFor();
    await openSettingsPage("部门设置");
    await page.getByRole("button", { name: "新增部门" }).click();
    await page
      .getByLabel("部门名称")
      .fill("ProductEngineeringAndInfrastructure研发部");
    await page.getByRole("button", { name: "保存部门" }).click();
    await page.getByText("部门已更新").waitFor();
    await openSettingsPage("邮件模板");
    await openSettingsPage("邮件模板");
    assert.equal(
      await page.getByRole("tab", { name: "邮件模板", exact: true }).count(),
      1,
    );
    await page.getByRole("button", { name: "关闭邮件模板" }).click();
    await page.getByRole("main", { name: "部门设置", exact: true }).waitFor();
    await openSettingsPage("变量管理");
    await page.getByRole("button", { name: "新增变量" }).click();
    const variableModal = page.getByRole("dialog", { name: "新增变量" });
    await variableModal.getByLabel("变量名称").fill("直属上级");
    await variableModal
      .getByRole("button", { name: "保存", exact: true })
      .click();
    await page.getByRole("cell", { name: "直属上级" }).waitFor();
    await openSettingsPage("邮件模板");
    await page.getByRole("textbox", { name: "邮件正文" }).waitFor();
    const handle = page.locator(
      '[role="separator"][aria-orientation="vertical"]',
    );
    const rect = await handle.boundingBox();
    assert.ok(rect);
    await page.mouse.move(rect.x + rect.width / 2, rect.y + 12);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 + 65, rect.y + 12, {
      steps: 12,
    });
    await page.mouse.up();
    await page.waitForFunction(
      (x) =>
        document
          .querySelector('[role="separator"][aria-orientation="vertical"]')!
          .getBoundingClientRect().x >
        x + 35,
      rect.x,
    );
    const mailEditor = page.getByRole("textbox", { name: "邮件正文" });
    const mailPreview = page.getByRole("region", { name: "邮件实时预览" });
    await mailEditor.getByText("候选人姓名", { exact: true }).waitFor();
    await mailEditor.fill("第一段");
    await mailEditor.press("Enter");
    await mailEditor.press("/");
    const searchCommands = page.getByRole("combobox", {
      name: "搜索命令或变量",
    });
    await assertPopupFits(page.getByRole("listbox", { name: "编辑命令" }));
    await searchCommands.fill("标题");
    await searchCommands.press("ArrowDown");
    await searchCommands.press("Enter");
    await mailEditor.pressSequentially("Heading");
    await mailEditor.locator("h2").getByText("Heading").waitFor();
    await page.getByRole("button", { name: "插入内容块" }).click();
    await page.getByRole("option", { name: "上移内容块" }).click();
    assert.equal(
      await mailEditor.locator(":scope > :first-child").innerText(),
      "Heading",
    );
    await mailEditor.fill("您好！");
    await mailEditor.press("ArrowLeft");
    await page.getByRole("button", { name: "插入内容块", exact: true }).click();
    await page.getByRole("option", { name: "候选人姓名", exact: true }).click();
    await mailEditor.getByText("候选人姓名", { exact: true }).waitFor();
    await mailPreview.getByText("您好示例候选人！", { exact: true }).waitFor();
    await mailEditor.fill(
      "{{ arrival }} / {{trialBase}} / {{trialSkill}} 元 / {{invoiceInfo}} / {{allowedBanks}}",
    );
    const inlineToolbar = page.getByRole("toolbar", { name: "选中文本格式" });
    await inlineToolbar.waitFor({ state: "hidden" });
    await mailEditor.press("ControlOrMeta+a");
    await inlineToolbar.getByRole("button", { name: "段落样式" }).click();
    await page.getByRole("menuitem", { name: "二级标题" }).click();
    await mailPreview.locator("h2").filter({ hasText: "2026-02-02" }).waitFor();
    await mailEditor.press("ArrowRight");
    await inlineToolbar.waitFor({ state: "hidden" });
    await mailEditor.press("ControlOrMeta+a");
    await page.getByRole("button", { name: "加粗", exact: true }).click();
    await mailPreview
      .locator("strong")
      .filter({ hasText: "2026-02-02 09:00" })
      .waitFor();
    await mailEditor.press("ArrowRight");
    await mailEditor.press("Enter");
    await mailEditor.press("/");
    await page.getByRole("option", { name: "设置链接", exact: true }).click();
    await page
      .getByPlaceholder("https://www.example.com")
      .fill("https://example.test/company");
    await page.getByRole("button", { name: "应用", exact: true }).click();
    await mailPreview
      .locator('a[href="https://example.test/company"]')
      .waitFor();
    const signature = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jr0kAAAAASUVORK5CYII=",
      "base64",
    );
    const choosing = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "插入内容块" }).click();
    await page.getByRole("option", { name: "插入图片", exact: true }).click();
    await (
      await choosing
    ).setFiles({
      name: "signature.png",
      mimeType: "image/png",
      buffer: signature,
    });
    await mailPreview.getByRole("img", { name: "signature.png" }).waitFor();
    await mailEditor.getByRole("img", { name: "signature.png" }).click();
    await page.getByRole("button", { name: "图片样式" }).click();
    await page.getByLabel("宽度（px）").fill("180");
    await page.getByLabel("圆角（px）").fill("8");
    await page.getByRole("combobox", { name: "图片对齐" }).click();
    await page.getByRole("option", { name: "居中", exact: true }).click();
    await page.getByRole("button", { name: "应用", exact: true }).click();
    await mailPreview
      .locator('img[width="180"][data-align="center"][data-radius="8"]')
      .waitFor();
    await page.getByLabel("邮件主题").fill("致：");
    await page
      .getByRole("button", { name: "插入主题变量", exact: true })
      .click();
    await page.getByRole("option", { name: "直属上级", exact: true }).click();
    await page
      .getByLabel("邮件主题")
      .getByText("直属上级", { exact: true })
      .waitFor();
    await mailPreview.getByText("致：示例直属上级", { exact: true }).waitFor();
    await page.getByLabel("邮件主题").fill("{{missing}}");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page
      .getByText("未知模板变量：missing", { exact: true })
      .first()
      .waitFor();
    await page.getByLabel("邮件主题").fill("{{name}} 的录用通知书");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.getByText("邮件模板已保存").waitFor();
    async function saveCopy(name: string) {
      await page.getByRole("button", { name: "另存为", exact: true }).click();
      const modal = page.getByRole("dialog", { name: "另存为新模板" });
      await modal.getByRole("button", { name: "取消", exact: true }).waitFor();
      await modal.getByPlaceholder("例如：校招录用通知").fill(name);
      await modal.getByRole("button", { name: "保存", exact: true }).click();
      await modal.waitFor({ state: "hidden" });
    }
    await mailEditor.press("ControlOrMeta+End");
    await page.getByRole("button", { name: "插入内容块", exact: true }).click();
    await page.getByRole("option", { name: "直属上级", exact: true }).click();
    await mailPreview
      .getByText("示例直属上级", { exact: false })
      .last()
      .waitFor();
    await saveCopy("社招邮件");

    await page.getByRole("tab", { name: "首页", exact: true }).click();
    await page.getByRole("button", { name: "新增", exact: true }).click();
    assert.equal(await drawer.getByLabel("直属上级").count(), 0);
    for (const [label, v] of [
      ["邮件模板", "社招邮件"],
      ["公司", "示例公司"],
      ["部门", "ProductEngineeringAndInfrastructure研发部"],
    ]) {
      await drawer.getByRole("combobox", { name: label }).click();
      await assertPopupFits(
        page
          .getByRole("listbox")
          .filter({ has: page.getByRole("option", { name: v, exact: true }) }),
      );
      await page.getByRole("option", { name: v, exact: true }).click();
    }
    const offerAddress = drawer.getByRole("textbox", { name: "报到地址" });
    assert.equal(await offerAddress.isEditable(), false);
    assert.equal(await offerAddress.inputValue(), "示例地址");
    await drawer.getByLabel("直属上级").fill("赵经理");
    assert.equal(
      await page
        .getByRole("dialog", { name: "新增 Offer" })
        .getByLabel("抄送邮箱")
        .count(),
      0,
    );
    // Reproduce an Offer created before the account had a CC list.
    const savedCc = await page.evaluate(async () => {
      const { settings } = await window.offerFlow.state();
      await window.offerFlow.saveSettings({
        ...settings,
        cc: "",
        password: "",
      });
      return settings.cc;
    });
    const inputs: Record<string, string> = {
      name: "测试甲",
      email: "candidate@example.test",
      trialBase: "2500.75",
      trialSkill: "0",
      role: "工程师",
      arrival: "2026-12-01 09:00",
    };
    for (const [key, label, type, value] of fields) {
      if (inputs[key] || (!value && type === "money")) {
        await page.getByLabel(label).fill(inputs[key] || "1000");
      }
      if (key === "arrival") {
        await arrival.press("Enter");
      }
    }
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.getByRole("cell", { name: "待发送", exact: true }).waitFor();
    assert.equal(raw, "");
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    await page.getByRole("cell", { name: "待发送", exact: true }).waitFor();
    await openSettingsPage("附件模板");
    await page
      .locator('[aria-label="实时预览"][aria-busy="false"] canvas')
      .waitFor();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(820, 650),
    );
    const previewBounds = await page
      .getByRole("region", { name: "实时预览" })
      .boundingBox();
    const editorBounds = await page
      .getByRole("textbox", { name: "附件内容" })
      .boundingBox();
    assert.ok(
      previewBounds &&
        editorBounds &&
        previewBounds.x >= editorBounds.x + editorBounds.width - 2,
    );
    await page.getByRole("button", { name: "A4 排版", exact: true }).click();
    await assertPopupFits(page.getByRole("dialog", { name: "A4 排版设置" }));
    await page.keyboard.press("Escape");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1160, 850),
    );
    const paper = page.getByLabel("示例通知书 PDF");
    const before = await paper.evaluate((el) =>
      (el as HTMLCanvasElement).toDataURL(),
    );
    await page.getByRole("textbox", { name: "附件内容" }).fill("");
    await page.getByRole("button", { name: "预览 PDF" }).click();
    await page.getByText("请填写附件内容", { exact: true }).first().waitFor();
    await page
      .getByRole("textbox", { name: "附件内容" })
      .fill("岗位录用通知书");
    const editor = page.getByRole("textbox", { name: "附件内容" });
    await editor.press("ControlOrMeta+a");
    await page.getByRole("button", { name: "加粗", exact: true }).click();
    assert.equal(await editor.locator("strong").innerText(), "岗位录用通知书");
    await editor.press("ArrowRight");
    await editor.press("Enter");
    await editor.press("/");
    const commandSearch = page.getByRole("combobox", {
      name: "搜索命令或变量",
    });
    await commandSearch.fill("候选人姓名");
    await commandSearch.press("Enter");
    await editor.getByText("候选人姓名", { exact: true }).waitFor();
    const previewPane = page.getByRole("region", { name: "模板预览区" });
    const paneBeforeSettings = await previewPane.boundingBox();
    assert.ok(paneBeforeSettings);
    const checkPreviewBounds = async () => {
      const bounds = await previewPane.boundingBox();
      assert.ok(bounds);
      for (const key of ["x", "y", "width", "height"] as const) {
        assert.ok(
          Math.abs(bounds[key] - paneBeforeSettings[key]) < 1,
          "排版浮层改变了预览区 " + key,
        );
      }
    };
    await page.getByRole("button", { name: "A4 排版", exact: true }).click();
    await assertPopupFits(page.getByRole("dialog", { name: "A4 排版设置" }));
    await checkPreviewBounds();
    await page.getByLabel("正文字号（pt）").fill("11");
    await page.keyboard.press("Escape");
    await page
      .getByRole("dialog", { name: "A4 排版设置" })
      .waitFor({ state: "hidden" });
    await checkPreviewBounds();
    await page
      .locator('[aria-label="实时预览"][aria-busy="false"] canvas')
      .waitFor();
    assert.notEqual(
      await paper.evaluate((el) => (el as HTMLCanvasElement).toDataURL()),
      before,
    );
    await app.evaluate(({ shell }) => {
      shell.openPath = async (file) => {
        process.env.OFFER_TEST_OPENED = file;
        return "";
      };
    });
    await page.getByRole("button", { name: "预览 PDF" }).click();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.getByText("附件模板已保存", { exact: true }).waitFor();
    await editor.press("ControlOrMeta+End");
    await page.getByRole("button", { name: "插入内容块", exact: true }).click();
    await page.getByRole("option", { name: "直属上级", exact: true }).click();
    await editor.getByText("直属上级", { exact: true }).waitFor();
    await saveCopy("社招通知书");
    const savedNotice = (await page.evaluate(() => window.offerFlow.state()))
      .notice;
    assert.match(savedNotice.richText, /<strong>岗位录用通知书<\/strong>/);
    assert.ok(savedNotice.richText.includes("{{name}}"));
    const sample = await app.evaluate(() => process.env.OFFER_TEST_OPENED);
    assert.ok(
      sample && fs.readFileSync(sample).subarray(0, 4).toString() === "%PDF",
    );
    await page.getByRole("tab", { name: "首页", exact: true }).click();
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    assert.equal(
      await page.getByLabel("试用期基本工资").inputValue(),
      "2500.75",
    );
    assert.ok(
      (
        await page.getByRole("combobox", { name: "邮件模板" }).innerText()
      ).includes("社招邮件"),
    );
    await page.getByRole("combobox", { name: "附件模板" }).click();
    await page.getByRole("option", { name: "社招通知书" }).click();
    assert.equal(await page.getByLabel("直属上级").count(), 1);
    assert.equal(await page.getByLabel("直属上级").inputValue(), "赵经理");
    assert.equal(
      await page
        .getByRole("dialog", { name: "编辑 Offer" })
        .getByLabel("抄送邮箱")
        .count(),
      0,
    );
    await page.getByLabel("候选人姓名").fill("测试乙");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page
      .getByRole("cell", { name: "测试乙 的录用通知书", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "删除", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "取消", exact: true })
      .click();
    await page
      .getByRole("cell", { name: "测试乙 的录用通知书", exact: true })
      .waitFor();
    await page.evaluate(async () => {
      const { templateOptions } = await window.offerFlow.state();
      const id = templateOptions.mail.find(
        (o) => o.label === "社招邮件",
      )!.value;
      const template = await window.offerFlow.readTemplate("mail", id);
      await window.offerFlow.saveTemplate(
        {
          ...template,
          richText:
            template.richText +
            '<p><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" alt="新签名"></p>',
        },
        id,
      );
    });
    await page.getByRole("button", { name: "查看详情" }).click();
    await page.getByRole("heading", { name: "测试乙 的录用通知书" }).waitFor();
    await page
      .getByText(
        "2026-12-01 09:00 / 2500.75 / 0 元 / 示例开票资料 / 示例银行",
        {
          exact: false,
        },
      )
      .waitFor();
    assert.equal(
      await page
        .getByRole("dialog", { name: "记录详情" })
        .locator('img[alt="signature.png"]')
        .count(),
      1,
      "历史详情应显示快照图片",
    );
    await page
      .getByText("模板新增了图片，点击「更新邮件和 PDF」即可使用。")
      .waitFor();
    const detailActions = page.getByRole("group", { name: "详情操作" });
    await detailActions.getByRole("button", { name: "打开 PDF" }).waitFor();
    const titleBottom = await page
      .locator('header[aria-label="工作区标题栏"]')
      .evaluate((el) => el.getBoundingClientRect().bottom);
    const buttonsBelowTitle = await detailActions
      .getByRole("button")
      .evaluateAll(
        (buttons, bottom) =>
          buttons.every(
            (button) => button.getBoundingClientRect().top >= bottom,
          ),
        titleBottom,
      );
    assert.ok(
      titleBottom > 0 && buttonsBelowTitle,
      "详情操作按钮与窗口标题栏重叠",
    );
    await detailActions.getByRole("button", { name: "更新邮件和 PDF" }).click();
    await page.getByRole("img", { name: "新签名" }).waitFor();
    const dest = path.join(dir, "notice.pdf");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ filePath: file, canceled: false });
    }, dest);
    await detailActions.getByRole("button", { name: "导出 PDF" }).click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLButtonElement>(
          'button[role="tab"][aria-selected="true"]',
        )?.disabled === false,
    );
    const pdf = fs.readFileSync(dest);
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    if (process.env.OFFER_QA_PDF) {
      fs.copyFileSync(dest, process.env.OFFER_QA_PDF);
    }
    await page.evaluate(async (cc) => {
      const { settings } = await window.offerFlow.state();
      await window.offerFlow.saveSettings({ ...settings, cc, password: "" });
    }, savedCc);
    await detailActions
      .getByRole("button", { name: "发送", exact: true })
      .click();
    await page.getByText("已发送", { exact: true }).waitFor();
    const delivered = await PostalMime.parse(raw);
    assert.match(delivered.text ?? "", /赵经理/);
    assert.deepEqual([...envelope].sort(), [
      "candidate@example.test",
      "hr@example.test",
      "manager@example.test",
    ]);
    assert.deepEqual(
      delivered.cc?.map((r) => r.address),
      ["hr@example.test", "manager@example.test"],
    );
    assert.match(
      delivered.html ?? "",
      /<strong>2026-12-01 09:00 .*示例银行<\/strong>/,
    );
    assert.match(delivered.html ?? "", /border-radius:8px/);
    assert.match(delivered.html ?? "", /margin:0 auto/);
    const inlineImage = delivered.attachments.find(
      (a) => a.mimeType === "image/png",
    );
    assert.ok(inlineImage?.contentId);
    assert.equal(inlineImage.disposition, "inline");
    assert.deepEqual(
      Buffer.from(inlineImage.content as ArrayBuffer),
      signature,
    );
    assert.ok(
      delivered.html?.includes(
        "cid:" + inlineImage.contentId.replace(/[<>]/g, ""),
      ),
    );
    assert.ok(delivered.html?.includes('href="https://example.test/company"'));
    assert.doesNotMatch(delivered.text ?? "", /data:image/);
    assert.ok(
      delivered.attachments.some(
        (a) =>
          a.mimeType === "image/gif" &&
          a.disposition === "inline" &&
          delivered.html?.includes("cid:" + a.contentId?.replace(/[<>]/g, "")),
      ),
    );
    assert.match(delivered.text ?? "", /2500.75/);
    assert.doesNotMatch(delivered.html ?? "", /{{/);
    assert.match(raw, /Content-Type: application\/pdf/i);
    assert.ok(raw.replace(/\s/g, "").includes(pdf.toString("base64")));
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    await page.getByRole("tab", { name: "首页" }).click();
    await page.getByText("已发送", { exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "删除", exact: true }).count(),
      0,
    );
    await page.evaluate(async () => {
      const sample = Object.fromEntries(
        [
          "trialBase",
          "trialSkill",
          "skill",
          "trialBonus",
          "trialSub",
          "base",
          "bonus",
          "sub",
          "years",
          "months",
        ].map((k) => [k, "1"]),
      );
      await window.offerFlow.createOffer({
        ...sample,
        name: "待删除",
        email: "delete@example.test",
        role: "测试",
        department: "ProductEngineeringAndInfrastructure研发部",
        company: "示例公司",
        address: "示例地址",
        issued: "2026-01-01",
        arrival: "2026-01-02T09:00",
      });
    });
    await page.reload();
    await page.getByLabel("姓名", { exact: true }).fill("DELETE@");
    await page.getByText("没有匹配的发送记录").waitFor();
    await page.getByLabel("姓名", { exact: true }).fill("待删");
    await page.getByRole("cell", { name: "待删除", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("cell", { name: "测试乙", exact: true }).count(),
      0,
    );
    await page.getByLabel("姓名", { exact: true }).fill("测试乙");
    for (const [label, option] of [
      ["公司", "示例公司"],
      ["部门", "ProductEngineeringAndInfrastructure研发部"],
      ["状态", "待发送"],
    ]) {
      await page.getByRole("combobox", { name: label, exact: true }).click();
      await page.getByRole("option", { name: option, exact: true }).click();
    }
    await page.getByText("没有匹配的发送记录").waitFor();
    for (const label of ["状态", "部门", "公司"]) {
      const choice = page.getByRole("combobox", { name: label, exact: true });
      await choice.hover();
      await choice.locator(".lobe-select__clear").click();
      await choice.getByText("请选择" + label).waitFor();
    }
    await page.getByLabel("姓名", { exact: true }).fill("");
    await page.getByRole("cell", { name: "测试乙", exact: true }).waitFor();
    await page.getByRole("button", { name: "删除", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "删除", exact: true })
      .click();
    await page.getByText("待发送 Offer 已删除", { exact: true }).waitFor();
    assert.equal(
      await page.getByRole("cell", { name: "待发送", exact: true }).count(),
      0,
    );
    await page.getByLabel("姓名", { exact: true }).fill("测试乙");
    const actionsCell = page.getByRole("cell").filter({
      has: page.getByRole("button", { name: "重发", exact: true }),
    });
    await page.getByRole("button", { name: "重发", exact: true }).waitFor();
    assert.equal(await actionsCell.getByRole("separator").count(), 1);
    await actionsCell.getByRole("button", { name: "查看详情" }).click();
    const detailsDrawer = page.getByRole("dialog", { name: "记录详情" });
    await detailsDrawer.waitFor();
    assert.equal(
      await detailsDrawer
        .getByRole("button", { name: "更新邮件和 PDF" })
        .count(),
      0,
    );
    await detailsDrawer
      .getByRole("group", { name: "详情操作" })
      .getByRole("button", { name: "重发" })
      .waitFor();
    await page.keyboard.press("Escape");
    await detailsDrawer.waitFor({ state: "hidden" });
    assert.equal(
      await page.getByLabel("姓名", { exact: true }).inputValue(),
      "测试乙",
    );
    const resend = page.getByRole("button", { name: "重发", exact: true });
    assert.equal(await resend.getAttribute("data-type"), "link");
    await resend.click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "取消" })
      .click();
    const beforeResend = await page.evaluate(
      async () => (await window.offerFlow.state()).history[0],
    );
    await openSettingsPage("邮箱设置");
    await page
      .getByRole("button", { name: "Remove hr@example.test", exact: true })
      .click();
    await page.getByRole("button", { name: "保存设置", exact: true }).click();
    await page.getByText("邮箱设置已保存").waitFor();
    await page.getByRole("tab", { name: "首页", exact: true }).click();
    const firstMessage = raw;
    await resend.click();
    await page
      .getByRole("dialog")
      .getByText(/抄送至 manager@example\.test。/)
      .waitFor();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "确认", exact: true })
      .click();
    await page.getByText("Offer 已重发给测试乙", { exact: true }).waitFor();
    const secondMessage = await PostalMime.parse(
      raw.slice(firstMessage.length),
    );
    assert.equal(secondMessage.subject, delivered.subject);
    assert.equal(secondMessage.text, delivered.text);
    assert.deepEqual(secondMessage.to, delivered.to);
    assert.deepEqual(
      secondMessage.cc?.map((item) => item.address),
      ["manager@example.test"],
    );
    assert.deepEqual([...envelope].sort(), [
      "candidate@example.test",
      "manager@example.test",
    ]);
    assert.deepEqual(
      secondMessage.attachments.map((a) => a.content),
      delivered.attachments.map((a) => a.content),
    );
    const attempts = await page.evaluate(
      async () => (await window.offerFlow.state()).history,
    );
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].id, beforeResend.id);
    assert.equal(attempts[0].created, beforeResend.created);
    assert.equal(attempts[0].status, "已发送");
    assert.equal(attempts[0].cc, "manager@example.test");
    await page.evaluate(async (recordId) => {
      const { values } = await window.offerFlow.draft(recordId);
      const id = values.noticeTemplateId;
      const template = await window.offerFlow.readTemplate("notice", id);
      await window.offerFlow.saveNotice(
        { ...template, richText: template.richText + "<p>附件模板已修订</p>" },
        id,
      );
    }, beforeResend.id);
    await actionsCell.getByRole("button", { name: "查看详情" }).click();
    const refresh = detailsDrawer.getByRole("button", {
      name: "更新邮件和 PDF",
    });
    await refresh.click();
    await refresh.waitFor({ state: "hidden" });
    assert.equal(
      (
        await page.evaluate(
          (id) => window.offerFlow.record(id),
          beforeResend.id,
        )
      ).status,
      "已发送",
    );
    const historyPopup = page.getByRole("dialog", {
      name: "状态记录",
      exact: true,
    });
    assert.equal(await historyPopup.count(), 0);
    assert.equal(
      await detailsDrawer.getByRole("button", { name: "返回首页" }).count(),
      0,
    );
    await detailsDrawer.getByRole("button", { name: "状态记录" }).click();
    await assertPopupFits(historyPopup);
    await historyPopup.getByText(/再次发送，发件账号/).waitFor();
    await page.keyboard.press("Escape");
    await historyPopup.waitFor({ state: "hidden" });
    await detailsDrawer.waitFor();
    rejectManager = true;
    await resend.click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "确认", exact: true })
      .click();
    await page
      .locator(".lobe-toast")
      .getByText(
        "以下地址未能发送：manager@example.test。请先核实其他收件人的收件情况，再决定是否重发。",
      )
      .waitFor();
    const partial = await page.evaluate(
      (id) => window.offerFlow.record(id),
      beforeResend.id,
    );
    assert.equal(partial.status, "待核实");
    assert.deepEqual(envelope, ["candidate@example.test"]);
    console.log(
      "Desktop, template persistence, TLS SMTP, PDF export, attachment identity and history verified.",
    );
  } finally {
    if (app) {
      await app.close().catch(() => {});
    }
    if (server) {
      await new Promise<void>(server.close.bind(server));
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
