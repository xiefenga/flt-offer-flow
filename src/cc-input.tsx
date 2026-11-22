import Select from "@lobehub/ui/es/Select/index";
import { useState, useRef, useLayoutEffect } from "react";

type Props = {
  id?: string;
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

const separators = [",", "，", ";", "；"];
export const CcInput = ({
  id,
  value = "",
  onChange,
  onBlur,
  "aria-invalid": invalid,
  "aria-describedby": description,
}: Props) => {
  const [inputKey, setInputKey] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  // Select's id belongs to its trigger. Associate the field label with the editable input.
  useLayoutEffect(() => {
    const input = container.current?.querySelector("input:not([type=hidden])");
    if (!input) {
      return;
    }
    input.id = id ?? "";
    input.setAttribute("aria-invalid", String(Boolean(invalid)));
    if (description) {
      input.setAttribute("aria-describedby", description);
    } else {
      input.removeAttribute("aria-describedby");
    }
  }, [id, invalid, description, inputKey]);
  const addresses = value
    .split(/[,，;；]/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const commit = (items: string[]) => {
    const seen = new Set<string>();
    const unique = items
      .map((s) => s.trim())
      .filter((address) => {
        const key = address.toLowerCase();
        if (!key || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
    onChange?.(unique.join(", "));
  };
  return (
    <div
      ref={container}
      onBlur={(event) => {
        if (
          event.target instanceof HTMLInputElement &&
          event.target.value.trim()
        ) {
          commit([...addresses, event.target.value]);
          setInputKey((key) => key + 1);
        }
        onBlur?.();
      }}
    >
      <Select
        key={inputKey}
        mode="tags"
        open={false}
        suffixIcon={null}
        value={addresses}
        placeholder="输入邮箱，按回车添加"
        tokenSeparators={separators}
        onChange={(next) => commit(Array.isArray(next) ? next.map(String) : [])}
      />
    </div>
  );
};
