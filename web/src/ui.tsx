import type React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...values: Parameters<typeof clsx>) =>
  twMerge(clsx(...values));
export const button =
  "rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800";
export const secondary =
  "rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100";
export function ErrorText({ message }: { message: string }) {
  return message ? (
    <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
      {message}
    </p>
  ) : null;
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1">
      {label}
      {children}
    </label>
  );
}
