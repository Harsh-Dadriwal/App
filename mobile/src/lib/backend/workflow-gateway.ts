import { supabase } from "@/lib/supabase";
import { backendRequest, type BackendResult } from "./http";
import { isBackendApiConfigured } from "./config";

export async function approveOrderItemByCustomer(args: {
  target_order_item_id: string;
  approve: boolean;
  note_text?: string | null;
}) {
  if (!isBackendApiConfigured()) {
    return { data: null, error: "Backend API is not configured." } satisfies BackendResult<Record<string, unknown>>;
  }
  return backendRequest(`/api/v1/workflows/order-items/${args.target_order_item_id}/customer-decision`, {
    method: "POST",
    body: args
  });
}

export async function respondToSubstitute(args: {
  suggestion_id: string;
  accept_choice: boolean;
}) {
  if (!isBackendApiConfigured()) {
    return { data: null, error: "Backend API is not configured." } satisfies BackendResult<Record<string, unknown>>;
  }
  return backendRequest(`/api/v1/workflows/substitutes/${args.suggestion_id}/respond`, {
    method: "POST",
    body: args
  });
}

export async function reviewOrderItemByArchitect(args: {
  target_order_item_id: string;
  approve: boolean;
  note_text?: string | null;
}) {
  if (!isBackendApiConfigured()) {
    return { data: null, error: "Backend API is not configured." } satisfies BackendResult<Record<string, unknown>>;
  }
  return backendRequest(`/api/v1/workflows/order-items/${args.target_order_item_id}/architect-review`, {
    method: "POST",
    body: args
  });
}
