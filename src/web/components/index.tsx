import React from "react";
import { Select } from "@base-ui/react/select";
import { Tooltip } from "@base-ui/react/tooltip";
import { Check, ChevronDown } from "lucide-react";
export function CompactTime({ at }: { at: number }) {
  const date = new Date(at);
  return (
    <time dateTime={date.toISOString()} title={date.toLocaleString()}>
      {date.toDateString() === new Date().toDateString()
        ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : date.toLocaleDateString([], {
            month: "short",
            day: "numeric",
            ...(date.getFullYear() !== new Date().getFullYear()
              ? { year: "numeric" }
              : {}),
          })}
    </time>
  );
}
export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select.Root
      value={value}
      onValueChange={(v) => {
        if (v !== null) onChange(v);
      }}
      items={options}
    >
      <Select.Trigger className="control" aria-label={label}>
        <Select.Value />
        <Select.Icon>
          <ChevronDown size={13} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={4} className="popup-positioner">
          <Select.Popup className="select-popup">
            <Select.List>
              {options.map((o) => (
                <Select.Item
                  className="select-item"
                  value={o.value}
                  key={o.value}
                >
                  <Select.ItemText>{o.label}</Select.ItemText>
                  <Select.ItemIndicator>
                    <Check size={13} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
export function IconButton({
  label,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <button
            {...props}
            className={"icon-button " + (props.className ?? "")}
            aria-label={label}
          />
        }
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={5}>
          <Tooltip.Popup className="tooltip">{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
export function NavigationRow({
  href,
  title,
  detail,
  meta,
  icon,
}: {
  href: string;
  title: string;
  detail?: string;
  meta?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <a className="navigation-row" href={href}>
      {icon && <span className="navigation-row-icon">{icon}</span>}
      <span className="navigation-row-body">
        <strong>{title}</strong>
        {detail && <span>{detail}</span>}
      </span>
      <span className="navigation-row-meta">{meta}</span>
    </a>
  );
}
