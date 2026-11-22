const defaults = require("../templates/catalog.json");
function validateName(value, label = "名称") {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 200 ||
    /[\r\n]/.test(value)
  ) {
    throw Error("请输入有效的" + label);
  }
  return value.trim();
}
function lines(list, label) {
  if (!Array.isArray(list) || !list.length) {
    throw Error("请填写" + label);
  }
  return [...new Set(list.map((value) => validateName(value)))];
}
function updateCatalog(catalog, kind, original, input) {
  if (!["companies", "departments"].includes(kind)) {
    throw Error("未知配置类型");
  }
  const list = [...catalog[kind]];
  const nameOf = (item) => (kind === "companies" ? item.name : item);
  const index = list.findIndex((item) => nameOf(item) === original);
  if (original !== null && index < 0) {
    throw Error("此配置已不存在");
  }
  if (input === null) {
    if (index < 0) {
      throw Error("请选择配置项");
    }
    list.splice(index, 1);
  } else {
    const name = validateName(kind === "companies" ? input.name : input);
    if (list.some((item, i) => i !== index && nameOf(item) === name)) {
      throw Error("名称已存在");
    }
    let item = name;
    if (kind === "companies") {
      if (
        typeof input.invoiceInfo !== "string" ||
        !input.invoiceInfo.trim() ||
        input.invoiceInfo.length > 10000
      ) {
        throw Error("请填写有效的开票信息");
      }
      item = {
        name,
        address: validateName(input.address, "报到地址"),
        banks: lines(input.banks, "限定银行"),
        invoiceInfo: input.invoiceInfo.trim(),
      };
    }
    if (index < 0) {
      list.push(item);
    } else {
      list[index] = item;
    }
  }
  return { ...catalog, [kind]: list };
}
function resolveOffer(input, catalog, original = {}) {
  const company = catalog.companies.find((c) => c.name === input.company);
  if (!company && (!original.company || input.company !== original.company)) {
    throw Error("请选择已配置的公司");
  }
  if (
    !catalog.departments.includes(input.department) &&
    (!original.department || input.department !== original.department)
  ) {
    throw Error("请选择已配置的部门");
  }
  const address =
    original.company === input.company && original.address
      ? original.address
      : company?.address;
  if (!address || input.address !== address) {
    throw Error("报到地址由公司自动带入，请重新选择公司");
  }
  if (!company && (!original.invoiceInfo || !original.allowedBanks)) {
    throw Error("请在系统设置中补全该公司的开票信息和限定银行，或选择其他公司");
  }
  return {
    ...input,
    invoiceInfo: company?.invoiceInfo ?? original.invoiceInfo ?? "",
    allowedBanks: company
      ? company.banks.join("、")
      : (original.allowedBanks ?? ""),
  };
}
module.exports = {
  defaults,
  updateCatalog,
  resolveOffer,
};
