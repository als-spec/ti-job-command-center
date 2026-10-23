"use client";
import { useRef, useState } from "react";

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      ref.current?.select();
    }
  }
  return (
    <div className="flex gap-2">
      <label htmlFor="sign-link" className="sr-only">Signing link</label>
      <input id="sign-link" ref={ref} readOnly value={url} className="input min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" onClick={copy} className="btn-secondary">{copied ? "Copied" : "Copy link"}</button>
    </div>
  );
}
