import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import offer from "../desktop/offer.cjs";
import templates from "../desktop/templates.cjs";

test("seeds default templates once and keeps named copies independent", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const store = templates.templateStore(db);
    store.save("mail", { ...offer.defaultMail, subject: "原邮件" });
    const mail = { ...store.read("mail"), subject: "社招邮件" };
    const id = store.save("mail", mail, null, "社招");
    const notice = store.read("notice");
    const noticeId = store.save("notice", notice, null, "社招");
    assert.throws(() => store.save("mail", mail, null, "社招"), /名称已存在/);
    store.rename("mail", id, "社会招聘");
    assert.equal(store.read("mail", id).subject, "社招邮件");
    const reopened = templates.templateStore(db);
    assert.equal(reopened.read("mail").subject, "原邮件");
    assert.equal(reopened.options("mail")[1].label, "社会招聘");
    assert.equal(reopened.options("notice")[1].label, "社招");
    assert.deepEqual(
      reopened.read("notice", noticeId),
      store.read("notice", noticeId),
    );
  } finally {
    db.close();
  }
});

test("custom variables retain their identity across rename and referenced definitions cannot be deleted", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const store = templates.templateStore(db);
    assert.throws(() => store.updateVariable(null, "候选人姓名"));
    const [variable] = store.updateVariable(null, "直属上级");
    const key = String(variable.key),
      placeholder = "{{" + key + "}}";
    store.save("mail", {
      subject: placeholder,
      richText: "<p>" + placeholder + "</p>",
    });
    assert.deepEqual(store.options("mail")[0].variableKeys, [key]);
    store.updateVariable(key, "部门主管");
    assert.throws(() => store.updateVariable(key, null), /模板引用/);
    store.save("mail", { subject: "通知", richText: "<p>正文</p>" });
    assert.deepEqual(store.updateVariable(key, null), []);
    assert.throws(
      () =>
        store.save("mail", { subject: placeholder, richText: "<p>正文</p>" }),
      /未知模板变量/,
    );
  } finally {
    db.close();
  }
});
