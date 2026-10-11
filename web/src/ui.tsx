import type React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...values: Parameters<typeof clsx>) =>
  twMerge(clsx(...values));

export const button =
  "inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-semibold text-white bg-[#f77f00] hover:bg-[#d96e00] shadow-sm transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed";

export const secondary =
  "inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-medium text-[#0b1c30] bg-[#e5eeff] hover:bg-[#dce9ff] transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed";

export const outlineBtn =
  "inline-flex items-center justify-center gap-2 rounded border border-[#d9cdba] bg-white px-4 py-2 text-sm font-medium text-[#0b1c30] hover:bg-[#f8f9ff] shadow-sm transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed";

export function ErrorText({ message }: { message: string }) {
  return message ? (
    <div role="alert" className="flex items-center gap-2 rounded bg-error-container p-3 text-sm text-on-error-container border border-error/20">
      <span className="material-symbols-outlined text-[18px] text-error shrink-0">error</span>
      <span>{message}</span>
    </div>
  ) : null;
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5 text-xs font-semibold uppercase tracking-wider text-[#434655]", className)}>
      <span>{label}</span>
      <div className="font-normal normal-case tracking-normal">{children}</div>
    </label>
  );
}

export function StatusBadge({ state }: { state: string }) {
  switch (state) {
    case "SUBMITTED":
      return (
        <span className="inline-flex items-center gap-1 rounded px-2.5 py-0.5 text-xs font-semibold bg-[#e5eeff] text-[#0037b0]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0037b0]"></span>
          Submitted
        </span>
      );
    case "VALIDATED":
      return (
        <span className="inline-flex items-center gap-1 rounded px-2.5 py-0.5 text-xs font-semibold bg-[#dce9ff] text-[#0037b0]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0037b0] animate-pulse"></span>
          Validated / Ready
        </span>
      );
    case "ASSIGNED":
      return (
        <span className="inline-flex items-center gap-1 rounded px-2.5 py-0.5 text-xs font-semibold bg-[#ffdcc6] text-[#954a00]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#f77f00]"></span>
          Assigned
        </span>
      );
    case "IN_PROGRESS":
      return (
        <span className="inline-flex items-center gap-1 rounded px-2.5 py-0.5 text-xs font-semibold bg-[#dae2fd] text-[#1d4ed8]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1d4ed8] animate-pulse"></span>
          In Progress
        </span>
      );
    case "RESOLUTION_SUBMITTED":
    case "CITIZEN_VERIFICATION":
      return (
        <span className="inline-flex items-center gap-1 rounded px-2.5 py-0.5 text-xs font-semibold bg-[#ffdad6] text-[#ba1a1a]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#ba1a1a] animate-ping"></span>
          Pending Verification
        </span>
      );
    case "DISPUTED":
    case "SUPERVISOR_REVIEW":
      return (
        <span className="inline-flex items-center gap-1 rounded px-2.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
          Supervisor Review
        </span>
      );
    case "CLOSED":
      return (
        <span className="inline-flex items-center gap-1 rounded px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
          Resolved & Closed
        </span>
      );
    case "REJECTED":
      return (
        <span className="inline-flex items-center gap-1 rounded px-2.5 py-0.5 text-xs font-semibold bg-slate-200 text-slate-700">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
          Rejected
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded px-2.5 py-0.5 text-xs font-medium bg-[#eff4ff] text-[#434655]">
          {state}
        </span>
      );
  }
}
