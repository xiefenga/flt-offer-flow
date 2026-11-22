import LobeSelect from "@lobehub/ui/es/Select/index";

import type { ComponentProps } from "react";

// LobeUI's empty dropdown currently has no locale or render override.
const emptyOptions = [
  { label: "暂无选项", value: "__empty__", disabled: true },
];

const Select = ({ options, ...props }: ComponentProps<typeof LobeSelect>) => {
  return (
    <LobeSelect {...props} options={options?.length ? options : emptyOptions} />
  );
};
export default Select;
