import type { BackendRequestOptions } from "./http";
import type { BackendResult } from "../types/contracts";

type WorkflowGatewayDependencies = {
  isBackendApiConfigured: () => boolean;
  backendRequest: <T>(
    path: string,
    options?: BackendRequestOptions
  ) => Promise<BackendResult<T>>;
};

function missingBackendResult() {
  return {
    data: null,
    error: "Backend API is not configured."
  } satisfies BackendResult<Record<string, unknown>>;
}

export function createWorkflowGateway({
  isBackendApiConfigured,
  backendRequest
}: WorkflowGatewayDependencies) {
  async function approveOrderItemByCustomer(args: {
    target_order_item_id: string;
    approve: boolean;
    note_text?: string | null;
  }) {
    if (!isBackendApiConfigured()) {
      return missingBackendResult();
    }

    return backendRequest(`/api/v1/workflows/order-items/${args.target_order_item_id}/customer-decision`, {
      method: "POST",
      body: args
    });
  }

  async function respondToSubstitute(args: { suggestion_id: string; accept_choice: boolean }) {
    if (!isBackendApiConfigured()) {
      return missingBackendResult();
    }

    return backendRequest(`/api/v1/workflows/substitutes/${args.suggestion_id}/respond`, {
      method: "POST",
      body: args
    });
  }

  async function reviewOrderItemByArchitect(args: {
    target_order_item_id: string;
    approve: boolean;
    note_text?: string | null;
  }) {
    if (!isBackendApiConfigured()) {
      return missingBackendResult();
    }

    return backendRequest(`/api/v1/workflows/order-items/${args.target_order_item_id}/architect-review`, {
      method: "POST",
      body: args
    });
  }

  async function transitionSiteOrder(args: {
    target_site_order_id: string;
    target_transition_key: string;
    note_text?: string | null;
    event_payload?: Record<string, unknown> | null;
    target_source_module?: string | null;
  }) {
    if (!isBackendApiConfigured()) {
      return missingBackendResult();
    }

    return backendRequest(`/api/v1/workflows/site-orders/${args.target_site_order_id}/transition`, {
      method: "POST",
      body: args
    });
  }

  async function markOrderItemSupplied(args: {
    target_order_item_id: string;
    supplied_qty: number;
    note_text?: string | null;
  }) {
    if (!isBackendApiConfigured()) {
      return missingBackendResult();
    }

    return backendRequest(`/api/v1/workflows/order-items/${args.target_order_item_id}/mark-supplied`, {
      method: "POST",
      body: args
    });
  }

  async function suggestSubstituteItem(args: {
    original_item_id: string;
    suggested_product: string;
    reason_text?: string | null;
  }) {
    if (!isBackendApiConfigured()) {
      return missingBackendResult();
    }

    return backendRequest(`/api/v1/workflows/order-items/${args.original_item_id}/suggest-substitute`, {
      method: "POST",
      body: args
    });
  }

  async function verifyProfessionalUser(args: {
    target_user_id: string;
    approve: boolean;
    admin_note?: string | null;
  }) {
    if (!isBackendApiConfigured()) {
      return missingBackendResult();
    }

    return backendRequest(`/api/v1/admin/users/${args.target_user_id}/verify`, {
      method: "POST",
      body: args
    });
  }

  return {
    approveOrderItemByCustomer,
    respondToSubstitute,
    reviewOrderItemByArchitect,
    transitionSiteOrder,
    markOrderItemSupplied,
    suggestSubstituteItem,
    verifyProfessionalUser
  };
}
