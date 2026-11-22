const { parseCc } = require("../shared/validation.mjs");
function historyStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS history(id TEXT PRIMARY KEY,created TEXT,recipient TEXT,subject TEXT,sender TEXT,status TEXT NOT NULL,detail TEXT,template_hash TEXT NOT NULL,attempt_cc TEXT);
    CREATE TABLE IF NOT EXISTS offer_snapshot(id TEXT PRIMARY KEY REFERENCES history(id), name TEXT NOT NULL, role TEXT NOT NULL, body TEXT NOT NULL, html TEXT NOT NULL, filename TEXT NOT NULL, pdf BLOB NOT NULL,form_data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS history_event(id INTEGER PRIMARY KEY, offer_id TEXT NOT NULL REFERENCES history(id), time TEXT NOT NULL, status TEXT NOT NULL, detail TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS history_event_offer ON history_event(offer_id,id);
  `);
  const event = db.prepare(
    "INSERT INTO history_event(offer_id,time,status,detail) VALUES (?,?,?,?)",
  );
  function atomic(work) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  function transition(id, previous, status, detail, sender = null, cc = null) {
    atomic(() => {
      const changed = db
        .prepare(
          "UPDATE history SET status=?,detail=?,sender=COALESCE(?,sender),attempt_cc=COALESCE(?,attempt_cc) WHERE id=? AND status=?",
        )
        .run(status, detail, sender, cc, id, previous);
      if (!changed.changes) {
        throw Error("记录状态已变更，请刷新后重试");
      }
      event.run(id, new Date().toISOString(), status, detail);
    });
  }
  for (const { id } of db
    .prepare("SELECT id FROM history WHERE status='发送中'")
    .all()) {
    transition(
      id,
      "发送中",
      "待核实",
      "应用退出时未取得发送结果，请核实邮箱服务商记录",
    );
  }
  function get(id) {
    const row = db
      .prepare(
        "SELECT h.*,h.attempt_cc AS cc,s.name,s.role,s.filename,s.body,s.html FROM history h JOIN offer_snapshot s USING(id) WHERE h.id=?",
      )
      .get(id);
    if (!row) {
      throw Error("发送记录不存在");
    }
    return row;
  }
  function payload(id) {
    const snapshot = db
      .prepare("SELECT html,pdf FROM offer_snapshot WHERE id=?")
      .get(id);
    if (!snapshot || !snapshot.html || !snapshot.pdf?.length) {
      throw Error("该记录缺少完整邮件或 PDF 快照");
    }
    return { html: snapshot.html, pdf: Buffer.from(snapshot.pdf) };
  }
  return {
    list: () =>
      db
        .prepare(
          "SELECT h.*,h.attempt_cc AS cc,s.filename,s.name,s.role,json_extract(s.form_data,'$.company') AS company,json_extract(s.form_data,'$.department') AS department,json_extract(s.form_data,'$.arrival') AS arrival FROM history h JOIN offer_snapshot s USING(id) ORDER BY h.rowid DESC",
        )
        .all(),
    detail: (id) => ({
      ...get(id),
      events: db
        .prepare(
          "SELECT time,status,detail FROM history_event WHERE offer_id=? ORDER BY id",
        )
        .all(id),
    }),
    create(id, offer, role, filename, pdf, values) {
      atomic(() => {
        const time = new Date().toISOString();
        db.prepare(
          "INSERT INTO history(id,created,recipient,subject,sender,status,detail,template_hash) VALUES (?,?,?,?,?,?,?,?)",
        ).run(
          id,
          time,
          offer.email,
          offer.subject,
          "",
          "待发送",
          "",
          offer.templateHash,
        );
        db.prepare(
          "INSERT INTO offer_snapshot(id,name,role,body,html,filename,pdf,form_data) VALUES (?,?,?,?,?,?,?,?)",
        ).run(
          id,
          offer.name,
          role,
          offer.body,
          offer.html,
          filename,
          pdf,
          JSON.stringify(values),
        );
        event.run(id, time, "待发送", "已保存邮件和 PDF 附件");
      });
    },
    draft(id) {
      const snapshot = db
        .prepare("SELECT form_data FROM offer_snapshot WHERE id=?")
        .get(id);
      if (!snapshot) {
        throw Error("发送记录不存在");
      }
      return { values: JSON.parse(snapshot.form_data) };
    },
    edit(id, offer, values, filename, pdf, refresh = false) {
      atomic(() => {
        const row = get(id);
        if (!refresh && row.status !== "待发送") {
          throw Error("仅待发送记录可以编辑");
        }
        if (refresh && row.template_hash === offer.templateHash) {
          return;
        }
        db.prepare(
          "UPDATE history SET recipient=?,subject=?,template_hash=? WHERE id=?",
        ).run(offer.email, offer.subject, offer.templateHash, id);
        db.prepare(
          "INSERT OR REPLACE INTO offer_snapshot(id,name,role,body,html,filename,pdf,form_data) VALUES (?,?,?,?,?,?,?,?)",
        ).run(
          id,
          offer.name,
          values.role,
          offer.body,
          offer.html,
          filename,
          pdf,
          JSON.stringify(values),
        );
        event.run(
          id,
          new Date().toISOString(),
          row.status,
          refresh
            ? "已按当前模板更新邮件和 PDF"
            : "已编辑并重新生成邮件和 PDF 附件",
        );
      });
    },
    remove(id) {
      atomic(() => {
        if (get(id).status !== "待发送") {
          throw Error("仅待发送记录可以删除");
        }
        db.prepare("DELETE FROM history_event WHERE offer_id=?").run(id);
        db.prepare("DELETE FROM offer_snapshot WHERE id=?").run(id);
        db.prepare("DELETE FROM history WHERE id=? AND status='待发送'").run(
          id,
        );
      });
    },
    attachment(id) {
      const snapshot = db
        .prepare("SELECT filename,pdf FROM offer_snapshot WHERE id=?")
        .get(id);
      if (!snapshot) {
        throw Error("该记录未保存附件");
      }
      return { ...snapshot, pdf: Buffer.from(snapshot.pdf) };
    },
    claim(id, sender, resend = false, configuredCc = "") {
      const row = get(id);
      const allowed = resend ? ["已发送"] : ["待发送", "失败"];
      if (!allowed.includes(row.status)) {
        throw Error("当前状态不允许发送");
      }
      const parsed = parseCc(configuredCc, row.recipient);
      if (parsed.error) {
        throw Error(parsed.error);
      }
      const cc = parsed.addresses.join(", ");
      const item = { ...row, ...payload(id), cc };
      transition(
        id,
        row.status,
        "发送中",
        (resend ? "再次发送，发件账号：" : "发件账号：") +
          sender +
          "，抄送：" +
          (cc || "无"),
        sender,
        cc,
      );
      return item;
    },
    finish(id, status, detail = "") {
      if (!["已发送", "失败", "待核实"].includes(status)) {
        throw Error("无效的发送结果");
      }
      transition(id, "发送中", status, detail);
    },
    reconcile(id, accepted) {
      if (typeof accepted !== "boolean") {
        throw Error("请选择核实结果");
      }
      transition(
        id,
        "待核实",
        accepted ? "已发送" : "失败",
        accepted ? "人工核实：已发送" : "人工核实：服务器未接收",
      );
    },
  };
}
module.exports = { historyStore };
