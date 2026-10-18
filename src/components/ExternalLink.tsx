import type { ComponentProps } from "react";

/**
 * A link to another website. It opens in a new tab, so the reader keeps their
 * place in the record, and says so: a small arrow for sighted readers and
 * words for screen readers.
 */
export function ExternalLink({ children, rel, ...props }: Omit<ComponentProps<"a">, "target">) {
  return (
    <a {...props} target="_blank" rel={["noopener", "noreferrer", rel].filter(Boolean).join(" ")}>
      {children}
      <svg className="external-mark" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <path d="M4.5 2.5h5v5M9.5 2.5 2.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}
