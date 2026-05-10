export type WorkflowGatewayArgs = {
  approveOrderItemByCustomer: {
    target_order_item_id: string;
    approve: boolean;
    note_text?: string | null;
  };
  respondToSubstitute: {
    suggestion_id: string;
    accept_choice: boolean;
  };
  reviewOrderItemByArchitect: {
    target_order_item_id: string;
    approve: boolean;
    note_text?: string | null;
  };
  transitionSiteOrder: {
    target_site_order_id: string;
    target_transition_key: string;
    note_text?: string | null;
    event_payload?: Record<string, unknown> | null;
    target_source_module?: string | null;
  };
  markOrderItemSupplied: {
    target_order_item_id: string;
    supplied_qty: number;
    note_text?: string | null;
  };
  suggestSubstituteItem: {
    original_item_id: string;
    suggested_product: string;
    reason_text?: string | null;
  };
  verifyProfessionalUser: {
    target_user_id: string;
    approve: boolean;
    admin_note?: string | null;
  };
};
