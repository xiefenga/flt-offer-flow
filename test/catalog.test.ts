import test from "node:test";
import assert from "node:assert/strict";

import store from "../desktop/catalog.cjs";

test("company options are isolated and an archived offer keeps its saved details", () => {
  const company = {
    name: "甲公司",
    address: "甲地址",
    invoiceInfo: "甲发票",
    banks: ["甲银行"],
  };
  const catalog = { companies: [company], departments: ["部门"] };
  const input = {
    company: company.name,
    department: "部门",
    address: "甲地址",
    invoiceInfo: "错误信息",
  };
  const snapshot = store.resolveOffer(input, catalog);
  assert.equal(snapshot.invoiceInfo, "甲发票");
  assert.equal(snapshot.allowedBanks, "甲银行");
  const former = { ...snapshot, address: "第二地址" };
  assert.throws(() => store.resolveOffer(former, catalog));
  assert.equal(store.resolveOffer(former, catalog, former).address, "第二地址");
  assert.throws(() => store.resolveOffer(input, catalog, former));
  assert.throws(() =>
    store.resolveOffer({ ...input, address: "乙地址" }, catalog),
  );
  assert.throws(() => store.updateCatalog(catalog, "companies", null, company));
  const removed = store.updateCatalog(catalog, "companies", company.name, null);
  assert.throws(() => store.resolveOffer(input, removed));
  assert.deepEqual(store.resolveOffer(input, removed, snapshot), snapshot);
});
