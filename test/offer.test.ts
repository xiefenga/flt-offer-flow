import test from "node:test";
import assert from "node:assert/strict";

import offerService from "../desktop/offer.cjs";

const { fields, defaultMail, buildOffer } = offerService;
function data() {
  const values = Object.fromEntries(
    fields.map(([key, , , value]) => [key, value || "100"]),
  );
  return {
    ...values,
    name: "测试甲",
    email: "candidate@example.test",
    issued: "2026-11-01",
    arrival: "2026-11-10T09:00",
  };
}
test("same candidate is rendered safely in both mail bodies and notice", () => {
  const offer = buildOffer({ ...data(), name: "<测试甲>" }, defaultMail);
  assert.match(offer.document, /&lt;测试甲&gt;/);
  assert.match(offer.html, /&lt;测试甲&gt;/);
  assert.match(offer.subject, /<测试甲>/);
  assert.doesNotMatch(offer.document, /张佳慧|{{/);
});
test("rejects unknown placeholders, multiple recipients and missing required pay", () => {
  assert.throws(() =>
    buildOffer(data(), { subject: "{{wrong}}", richText: "<p>ok</p>" }),
  );
  assert.throws(() =>
    buildOffer({ ...data(), email: "a@test.test,b@test.test" }, defaultMail),
  );
  assert.throws(() => buildOffer({ ...data(), base: "" }, defaultMail));
  assert.throws(
    () => buildOffer({ ...data(), trialSkill: "" }, defaultMail),
    /请填写试用期技能工资/,
  );
  assert.throws(
    () => buildOffer({ ...data(), skill: "" }, defaultMail),
    /请填写转正技能工资/,
  );
  assert.doesNotThrow(() =>
    buildOffer({ ...data(), trialSkill: "0", skill: "0" }, defaultMail),
  );
});

test("PDF HTML preserves supported formatting, substitutes escaped variables and removes external content", () => {
  const layout = {
    ...offerService.defaultNotice,
    richText:
      '<p style="text-align:right"><strong>{{name}}</strong></p><ol><li><p><span style="font-size:16pt;color:#285b48">报到</span></p></li></ol><img src="https://example.test/sample.png">',
  };
  const result = buildOffer({ ...data(), name: "甲<乙>" }, defaultMail, layout);
  assert.match(result.document, /<strong>甲&lt;乙&gt;<\/strong>/);
  assert.match(result.document, /<ol><li>/);
  assert.match(result.document, /font-size:16pt;color:#285b48/);
  assert.doesNotMatch(result.document, /<img|example.test\/sample/);
  assert.throws(() =>
    buildOffer(data(), defaultMail, {
      ...layout,
      richText: "<p>{{unknown}}</p>",
    }),
  );
});

test("rich mail preserves formatting and multiline substitutions in HTML and plain text", () => {
  const { html, body } = buildOffer(
    { ...data(), name: "<候选人>", invoiceInfo: "第一行\n第二行" },
    {
      subject: "{{name}}",
      richText:
        '<h2 style="text-align:center"><span style="font-size:16pt;color:#24589c">{{name}}</span></h2><ol><li><p><u>{{invoiceInfo}}</u></p></li></ol><img src="invalid">',
    },
  );
  assert.match(html, /text-align:center/);
  assert.match(html, /font-size:16pt;color:#24589c/);
  assert.match(html, /&lt;候选人&gt;/);
  assert.match(html, /<u>第一行<br>第二行<\/u>/);
  assert.doesNotMatch(html, /<img/);
  assert.match(body, /<候选人>/);
  assert.match(body, /第一行\n\s*第二行/);
});

test("mail keeps web links and removes remote images and unsupported links", () => {
  const { html } = buildOffer(data(), {
    subject: "录用通知",
    richText:
      '<p><a href="https://example.test">官网</a><a href="file:///tmp/example">本地文件</a></p><img src="https://example.test/signature.png"><img src="data:image/svg+xml;base64,PHN2Zz4=">',
  });
  assert.match(html, /<a href="https:\/\/example.test">官网<\/a>/);
  assert.match(html, /本地文件/);
  assert.doesNotMatch(html, /file:|<img/);
});

test("only referenced custom fields are required and their values render safely in both templates", () => {
  const custom = [
    { key: "custom_manager", label: "主管" },
    { key: "custom_unused", label: "其他" },
  ];
  const mail = {
    subject: "发给 {{custom_manager}}",
    richText: "<p>{{custom_manager}}</p>",
  };
  const notice = {
    ...offerService.defaultNotice,
    richText: "<p>{{custom_manager}}</p>",
  };
  assert.throws(() => buildOffer(data(), mail, notice, custom), /请填写主管/);
  const offer = buildOffer(
    { ...data(), custom_manager: "王<经理>" },
    mail,
    notice,
    custom,
  );
  assert.equal(offer.subject, "发给 王<经理>");
  assert.match(offer.html, /王&lt;经理&gt;/);
  assert.match(offer.document, /王&lt;经理&gt;/);
});
