import type { BackendRequestOptions } from "./http";
import type { BackendResult } from "../types/contracts";

export type ServiceRequestType = "complaint" | "installation";
export type ServiceRequestStatus = "open" | "assigned" | "in_progress" | "completed" | "cancelled";

export type ServiceRequestResponse = {
  id: string;
  electrician_id: string;
  electrician_name: string;
  electrician_phone: string | null;
  electrician_city: string | null;
  verified: boolean;
  message: string | null;
  quoted_amount: number | null;
  status: "offered" | "chosen" | "not_chosen";
  created_at: string;
};

export type ServiceRequest = {
  id: string;
  request_type: ServiceRequestType;
  title: string;
  description: string;
  city: string | null;
  /** Hidden from electricians until the customer chooses them. */
  address: string | null;
  contact_phone: string | null;
  preferred_date: string | null;
  status: ServiceRequestStatus;
  created_at: string;
  assigned_at: string | null;
  completed_at: string | null;
  customer_name: string | null;
  assigned_electrician: { id: string; full_name: string; phone: string | null; verified: boolean } | null;
  /** Customers and admins see every offer; electricians see only their own. */
  responses: ServiceRequestResponse[];
};

export type ServiceRequestList = {
  role: string;
  requests: ServiceRequest[];
};

export type CreateServiceRequestInput = {
  request_type: ServiceRequestType;
  title: string;
  description: string;
  address: string;
  city?: string;
  contact_phone?: string;
  preferred_date?: string;
};

export const SERVICE_REQUEST_TYPE_LABELS: Record<ServiceRequestType, string> = {
  complaint: "Complaint",
  installation: "Installation"
};

export const SERVICE_REQUEST_STATUS_LABELS: Record<ServiceRequestStatus, string> = {
  open: "Waiting for electricians",
  assigned: "Electrician chosen",
  in_progress: "Work in progress",
  completed: "Completed",
  cancelled: "Cancelled"
};

type ServiceRequestsGatewayDependencies = {
  backendRequest: <T>(path: string, options?: BackendRequestOptions) => Promise<BackendResult<T>>;
};

export function createServiceRequestsGateway({ backendRequest }: ServiceRequestsGatewayDependencies) {
  function listServiceRequests() {
    return backendRequest<ServiceRequestList>("/api/v1/service-requests", { timeoutMs: 15_000 });
  }

  function createServiceRequest(input: CreateServiceRequestInput) {
    return backendRequest<{ id: string; status: ServiceRequestStatus; notifiedCount: number }>("/api/v1/service-requests", {
      method: "POST",
      body: input,
      timeoutMs: 15_000
    });
  }

  function offerToTakeServiceRequest(requestId: string, input: { message?: string; quoted_amount?: number | null }) {
    return backendRequest<{ id: string; requestId: string }>(`/api/v1/service-requests/${requestId}/responses`, {
      method: "POST",
      body: input,
      timeoutMs: 15_000
    });
  }

  function chooseServiceRequestElectrician(requestId: string, responseId: string) {
    return backendRequest<{ id: string; status: ServiceRequestStatus }>(`/api/v1/service-requests/${requestId}/choose`, {
      method: "POST",
      body: { response_id: responseId },
      timeoutMs: 15_000
    });
  }

  function updateServiceRequestStatus(requestId: string, status: ServiceRequestStatus) {
    return backendRequest<{ id: string; status: ServiceRequestStatus }>(`/api/v1/service-requests/${requestId}/status`, {
      method: "POST",
      body: { status },
      timeoutMs: 15_000
    });
  }

  return {
    listServiceRequests,
    createServiceRequest,
    offerToTakeServiceRequest,
    chooseServiceRequestElectrician,
    updateServiceRequestStatus
  };
}
