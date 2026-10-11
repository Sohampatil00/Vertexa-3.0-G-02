export type Case = {
  id: string;
  workflow_state: string;
  description: string;
  location: string;
  category: string;
  ward: string;
  department: string;
  owner_id: string | null;
  version: number;
  current_deadline: string;
  original_deadline: string;
  escalation_level: number;
  timezone: string;
  sla_status: string;
  policy_version: string;
  verification_due_at: string | null;
  verification_alerted_at: string | null;
};
export type Resolution = {
  note: string;
  evidence_refs: string[];
  submitted_at: string;
};
export type User = {
  id: string;
  display_name: string;
  roles: { role: string; ward: string | null; department: string | null }[];
};
export type Policy = {
  version: string;
  municipality: string;
  timezone: string;
  wards: string[];
  categories: {
    code: string;
    department: string;
    resolution_evidence: string[];
  }[];
  rejection_reason_codes: string[];
};
export type Evidence = {
  id: string;
  kind: string;
  sha256: string;
  content_type: string;
  size_bytes: number;
};
export type Operations = {
  policy: Policy;
  officers: { id: string; name: string }[];
  owner_name: string | null;
  evidence_max_bytes: number;
  assignments: {
    officer_id: string;
    assigned_by: string;
    reason: string;
    started_at: string;
    ended_at: string | null;
  }[];
};
export type Event = {
  id: string;
  operation: string;
  result: string;
  occurred_at: string;
  actor_role?: string;
  reason_code?: string;
  details?: Record<string, unknown>;
};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch("/v1" + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body && typeof init.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json();
    throw new ApiError(
      response.status,
      body.error?.message ||
        body.message ||
        "Request failed. Please try again.",
    );
  }
  return response.json();
}
export function command(
  token: string,
  item: Case | null,
  operation: string,
  body: unknown,
  key: string,
) {
  return api<{ case: Case }>(
    token,
    item ? `/cases/${item.id}/${operation}` : "/cases",
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Idempotency-Key": key,
        ...(item ? { "If-Match": `"${item.version}"` } : {}),
      },
    },
  );
}
export function human(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replaceAll("-", " ");
}
export function date(value: string, timezone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}
