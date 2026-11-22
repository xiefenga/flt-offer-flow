const { randomUUID } = require("node:crypto");
const {
  templateError,
  templateFields,
  referencedKeys,
} = require("../shared/validation.mjs");
const { renderRichText } = require("./rich-notice.cjs");
const { defaultMail, defaultNotice, validateNotice } = require("./offer.cjs");

function templateStore(db) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS templates(kind TEXT NOT NULL,id TEXT NOT NULL,name TEXT NOT NULL,content TEXT NOT NULL,variable_keys TEXT NOT NULL DEFAULT '[]',PRIMARY KEY(kind,id),UNIQUE(kind,name))",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS custom_variables(key TEXT PRIMARY KEY,label TEXT NOT NULL UNIQUE)",
  );
  const variables = () =>
    db.prepare("SELECT key,label FROM custom_variables ORDER BY rowid").all();
  function updateVariable(key, label) {
    if (key !== null && !variables().some((v) => v.key === key)) {
      throw Error("自定义变量不存在");
    }
    if (label === null) {
      if (
        db
          .prepare(
            "SELECT 1 FROM templates,json_each(variable_keys) WHERE json_each.value=? LIMIT 1",
          )
          .get(key)
      ) {
        throw Error("已有模板引用此变量，请先移除模板中的引用");
      }
      db.prepare("DELETE FROM custom_variables WHERE key=?").run(key);
    } else {
      if (
        typeof label !== "string" ||
        !label.trim() ||
        label.trim().length > 40
      ) {
        throw Error("变量名称须为 1 至 40 个字符");
      }
      label = label.trim();
      if (
        templateFields.some(([, name]) => name === label) ||
        variables().some((v) => v.label === label && v.key !== key)
      ) {
        throw Error("变量名称已存在");
      }
      if (key === null) {
        db.prepare("INSERT INTO custom_variables VALUES (?,?)").run(
          "custom_" + randomUUID().replaceAll("-", ""),
          label,
        );
      } else {
        db.prepare("UPDATE custom_variables SET label=? WHERE key=?").run(
          label,
          key,
        );
      }
    }
    return variables();
  }
  const seed = db.prepare(
    "INSERT OR IGNORE INTO templates(kind,id,name,content) VALUES (?,'default',?,?)",
  );
  seed.run("mail", "默认邮件模板", JSON.stringify(defaultMail));
  seed.run("notice", "默认附件模板", JSON.stringify(defaultNotice));
  const options = (kind) =>
    db
      .prepare(
        "SELECT id AS value,name AS label,variable_keys FROM templates WHERE kind=? ORDER BY rowid",
      )
      .all(kind)
      .map(({ value, label, variable_keys }) => ({
        value,
        label,
        variableKeys: JSON.parse(variable_keys),
      }));
  function read(kind, id = "default") {
    const row = db
      .prepare("SELECT content FROM templates WHERE kind=? AND id=?")
      .get(kind, id);
    if (!row) {
      throw Error("所选模板不存在");
    }
    return JSON.parse(row.content);
  }
  function checkedName(kind, id, name) {
    if (typeof name !== "string" || !name.trim() || name.trim().length > 60) {
      throw Error("模板名称须为 1 至 60 个字符");
    }
    name = name.trim();
    const existing = db
      .prepare("SELECT id FROM templates WHERE kind=? AND name=?")
      .get(kind, name);
    if (existing && existing.id !== id) {
      throw Error("同类模板名称已存在");
    }
    return name;
  }
  function rename(kind, id, name) {
    const result = db
      .prepare("UPDATE templates SET name=? WHERE kind=? AND id=?")
      .run(checkedName(kind, id, name), kind, id);
    if (!result.changes) {
      throw Error("所选模板不存在");
    }
    return id;
  }
  /** @param {string | null} [id] @param {string} [name] */
  function save(kind, input, id = "default", name) {
    const custom = variables();
    let content;
    if (kind === "mail") {
      const error = templateError(input.subject, true, false, custom);
      if (error) {
        throw Error(error);
      }
      content = {
        subject: input.subject,
        richText: renderRichText(input.richText, undefined, "邮件正文", custom),
      };
    } else {
      validateNotice(input);
      content = {
        ...input,
        richText: renderRichText(input.richText, undefined, "附件内容", custom),
      };
    }
    const refs = JSON.stringify(
      referencedKeys(content.subject, content.richText).filter((key) =>
        custom.some((v) => v.key === key),
      ),
    );
    if (name !== undefined || id === null) {
      name = checkedName(kind, id, name);
    }
    if (id === null) {
      id = randomUUID();
      db.prepare(
        "INSERT INTO templates(kind,id,name,content,variable_keys) VALUES (?,?,?,?,?)",
      ).run(kind, id, name, JSON.stringify(content), refs);
    } else if (
      !db
        .prepare(
          "UPDATE templates SET content=?,variable_keys=?,name=COALESCE(?,name) WHERE kind=? AND id=?",
        )
        .run(JSON.stringify(content), refs, name ?? null, kind, id).changes
    ) {
      throw Error("所选模板不存在");
    }
    return id;
  }
  return { read, save, rename, options, variables, updateVariable };
}
module.exports = { templateStore };
