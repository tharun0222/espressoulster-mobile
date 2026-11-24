"use client";

import { useRef } from "react";
import { Search, X } from "lucide-react";

export default function SearchField({ label, placeholder, value, onChange }: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="search-field" role="search">
      <Search size={18} aria-hidden="true" />
      <input ref={input} aria-label={label} inputMode="search" enterKeyHint="search"
        placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => {
          onChange("");
          input.current?.focus();
        }}>
          <X size={17} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
