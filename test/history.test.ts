import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import repository from "../desktop/history.cjs";

test("pending offers survive restart and ambiguous sends require reconciliation", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const store = repository.historyStore(db);
    const offer = {
      email: "candidate@example.test",
      name: "候选人",
      templateHash: "template",
      subject: "录用通知",
      body: "正文",
      html: "<p>正文</p>",
    };
    store.create("id", offer, "工程师", "notice.pdf", Buffer.from("pdf"), {
      role: "工程师",
    });
    assert.equal(store.detail("id").status, "待发送");
    assert.equal(store.draft("id").values.role, "工程师");
    assert.throws(() => store.reconcile("id", true));
    store.claim("id", "hr@example.test");
    assert.throws(() => store.claim("id", "hr@example.test"));
    assert.throws(() => store.remove("id"));
    assert.throws(() =>
      store.edit(
        "id",
        offer,
        { role: "经理" },
        "other.pdf",
        Buffer.from("other"),
      ),
    );
    assert.equal(store.attachment("id").pdf.toString(), "pdf");
    const recovered = repository.historyStore(db);
    assert.equal(recovered.detail("id").status, "待核实");
    assert.throws(() => recovered.claim("id", "hr@example.test"));
    recovered.reconcile("id", false);
    assert.equal(recovered.claim("id", "hr@example.test").body, offer.body);
    recovered.finish("id", "失败", "SMTP 550");
    recovered.claim("id", "hr@example.test");
    recovered.finish("id", "已发送");
    assert.throws(() => recovered.claim("id", "hr@example.test"));
    assert.equal(recovered.list().length, 1);
    assert.equal(recovered.detail("id").events.length, 8);
    const original = recovered.detail("id");
    const attempt = recovered.claim("id", "other@example.test", true);
    assert.equal(attempt.html, offer.html);
    assert.deepEqual(attempt.pdf, Buffer.from("pdf"));
    assert.equal(recovered.detail("id").status, "发送中");
    assert.throws(() => recovered.claim("id", "hr@example.test", true));
    recovered.finish("id", "待核实");
    assert.throws(() => recovered.claim("id", "hr@example.test", true));
    recovered.reconcile("id", true);
    const updated = recovered.detail("id");
    assert.deepEqual(
      updated.events.slice(0, original.events.length),
      original.events,
    );
    assert.match(updated.events.at(-3).detail, /再次发送.*other@example.test/);
    assert.equal(updated.created, original.created);
    assert.equal(updated.status, "已发送");
    assert.equal(recovered.list().length, 1);
  } finally {
    db.close();
  }
});

test("refreshing a template preserves delivery state and in-flight content", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const store = repository.historyStore(db);
    const offer = {
      email: "a@example.test",
      name: "甲",
      subject: "通知",
      body: "正文",
      html: "<p>正文</p>",
      templateHash: "initial",
    };
    const values = { role: "工程师" };
    store.create(
      "id",
      offer,
      values.role,
      "notice.pdf",
      Buffer.from("initial"),
      values,
    );
    const refresh = (status: string) => {
      store.edit(
        "id",
        { ...offer, templateHash: status },
        values,
        "notice.pdf",
        Buffer.from(status),
        true,
      );
      assert.equal(store.detail("id").status, status);
      assert.equal(store.detail("id").events.at(-1).status, status);
      assert.equal(store.attachment("id").pdf.toString(), status);
    };
    refresh("待发送");
    const claimed = store.claim("id", "hr@example.test");
    refresh("发送中");
    assert.equal(claimed.pdf.toString(), "待发送");
    store.finish("id", "待核实");
    refresh("待核实");
    store.reconcile("id", false);
    refresh("失败");
    store.claim("id", "hr@example.test");
    store.finish("id", "已发送");
    refresh("已发送");
  } finally {
    db.close();
  }
});
