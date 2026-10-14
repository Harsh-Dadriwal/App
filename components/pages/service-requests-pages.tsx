"use client";

import { useState, type FormEvent } from "react";
import {
  CardGrid,
  DataCard,
  FormCard,
  FormFieldHint,
  FormGrid,
  FormNotice,
  PageSection,
  QueryState,
  useMutationAction,
  useRows
} from "@/components/data-view";
import {
  chooseServiceRequestElectrician,
  createServiceRequest,
  listServiceRequests,
  offerToTakeServiceRequest,
  updateServiceRequestStatus
} from "@/lib/backend/modules/service-requests-gateway";
import {
  SERVICE_REQUEST_STATUS_LABELS,
  SERVICE_REQUEST_TYPE_LABELS,
  type ServiceRequest,
  type ServiceRequestList,
  type ServiceRequestType
} from "@mahalaxmi/core/gateway/service-requests-gateway";

const EMPTY_FORM = {
  request_type: "complaint" as ServiceRequestType,
  title: "",
  description: "",
  address: "",
  city: "",
  contact_phone: "",
  preferred_date: ""
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium" }) : null;
}

function formatAmount(value: number | null) {
  return value === null ? null : `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function useServiceRequests() {
  return useRows<ServiceRequestList>(async () => {
    const result = await listServiceRequests();
    return { data: result.data ? [result.data] : [], error: result.error };
  }, []);
}

function RequestSummary({ request }: { request: ServiceRequest }) {
  return (
    <>
      <p>{request.description}</p>
      <p className="form-field-hint">
        {[
          `Raised ${formatDate(request.created_at)}`,
          request.preferred_date ? `Preferred ${formatDate(request.preferred_date)}` : null,
          request.city
        ].filter(Boolean).join(" · ")}
      </p>
    </>
  );
}

export function CustomerServiceRequestsPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const create = useMutationAction();
  const action = useMutationAction();
  const list = useServiceRequests();
  const requests = list.data[0]?.requests ?? [];

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await create.run(async () => {
      const result = await createServiceRequest({
        ...form,
        city: form.city || undefined,
        contact_phone: form.contact_phone || undefined,
        preferred_date: form.preferred_date || undefined
      });
      return result.error ? { error: result.error } : undefined;
    }, "Request sent. Electricians have been notified and their offers will appear below.");
    if (ok) setForm(EMPTY_FORM);
  }

  return (
    <div className="page-stack">
      <FormCard
        title="Raise a complaint or installation request"
        description="All electricians are notified, and you choose who does the work."
      >
        <form onSubmit={submit} className="auth-form">
          <div className="segmented-control" role="radiogroup" aria-label="Request type">
            {(["complaint", "installation"] as const).map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={form.request_type === type}
                className={form.request_type === type ? "is-active" : ""}
                onClick={() => setForm((current) => ({ ...current, request_type: type }))}
              >
                {SERVICE_REQUEST_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
          <label>
            Title
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder={form.request_type === "complaint" ? "e.g. Bedroom fan not working" : "e.g. Install 2 ceiling fans"}
              maxLength={150}
              required
            />
          </label>
          <label>
            Details
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="What is the problem, or what needs to be installed?"
              maxLength={2000}
              required
            />
          </label>
          <label>
            Address
            <input
              value={form.address}
              onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
              placeholder="House, street, area"
              required
            />
            <FormFieldHint>Only the electrician you choose sees your address and phone number.</FormFieldHint>
          </label>
          <FormGrid>
            <label>
              City
              <input value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} />
            </label>
            <label>
              Contact number
              <input
                type="tel"
                value={form.contact_phone}
                onChange={(event) => setForm((current) => ({ ...current, contact_phone: event.target.value }))}
                placeholder="Uses your profile number if empty"
              />
            </label>
            <label>
              Preferred date
              <input
                type="date"
                value={form.preferred_date}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(event) => setForm((current) => ({ ...current, preferred_date: event.target.value }))}
              />
            </label>
          </FormGrid>
          <FormNotice error={create.error} success={create.success} />
          <button type="submit" className="primary-button" disabled={create.isSubmitting}>
            {create.isSubmitting ? "Sending..." : "Send request"}
          </button>
        </form>
      </FormCard>

      <PageSection title="My requests" description="Offers from electricians appear here. Choose one to share your address and get the work started.">
        <FormNotice error={action.error} success={action.success} />
        <QueryState
          loading={list.loading}
          error={list.error}
          hasData={requests.length > 0}
          empty={{ title: "No requests yet", description: "Raise a complaint or installation request above." }}
        >
          <CardGrid>
            {requests.map((request) => (
              <DataCard
                key={request.id}
                title={request.title}
                subtitle={SERVICE_REQUEST_TYPE_LABELS[request.request_type]}
                meta={SERVICE_REQUEST_STATUS_LABELS[request.status]}
              >
                <RequestSummary request={request} />
                {request.assigned_electrician ? (
                  <p>
                    <strong>{request.assigned_electrician.full_name}</strong>
                    {request.assigned_electrician.verified ? " (verified)" : ""}
                    {request.assigned_electrician.phone ? ` · ${request.assigned_electrician.phone}` : ""}
                  </p>
                ) : null}

                {request.status === "open" ? (
                  request.responses.length ? (
                    <div className="service-offers">
                      <strong>{request.responses.length} electrician{request.responses.length === 1 ? "" : "s"} can do this</strong>
                      {request.responses.map((response) => (
                        <div key={response.id} className="service-offer">
                          <div>
                            <strong>{response.electrician_name}</strong>
                            {response.verified ? <span className="badge">Verified</span> : null}
                            <p className="form-field-hint">
                              {[response.electrician_city, formatAmount(response.quoted_amount) ? `Quote ${formatAmount(response.quoted_amount)}` : null]
                                .filter(Boolean)
                                .join(" · ") || "No quote given"}
                            </p>
                            {response.message ? <p>{response.message}</p> : null}
                          </div>
                          <button
                            type="button"
                            className="primary-button"
                            disabled={action.isSubmitting}
                            onClick={() =>
                              void action.run(async () => {
                                const result = await chooseServiceRequestElectrician(request.id, response.id);
                                return result.error ? { error: result.error } : undefined;
                              }, `${response.electrician_name} has been chosen and notified.`)
                            }
                          >
                            Choose
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="form-field-hint">Waiting for electricians to respond.</p>
                  )
                ) : null}

                <div className="inline-actions">
                  {["assigned", "in_progress"].includes(request.status) ? (
                    <button
                      type="button"
                      className="primary-button"
                      disabled={action.isSubmitting}
                      onClick={() =>
                        void action.run(async () => {
                          const result = await updateServiceRequestStatus(request.id, "completed");
                          return result.error ? { error: result.error } : undefined;
                        }, "Marked as completed.")
                      }
                    >
                      Mark completed
                    </button>
                  ) : null}
                  {["open", "assigned"].includes(request.status) ? (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={action.isSubmitting}
                      onClick={() => {
                        if (!window.confirm("Cancel this request?")) return;
                        void action.run(async () => {
                          const result = await updateServiceRequestStatus(request.id, "cancelled");
                          return result.error ? { error: result.error } : undefined;
                        }, "Request cancelled.");
                      }}
                    >
                      Cancel request
                    </button>
                  ) : null}
                </div>
              </DataCard>
            ))}
          </CardGrid>
        </QueryState>
      </PageSection>
    </div>
  );
}

function OfferForm({ request, onDone }: { request: ServiceRequest; onDone: () => void }) {
  const [message, setMessage] = useState("");
  const [amount, setAmount] = useState("");
  const offer = useMutationAction();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await offer.run(async () => {
      const result = await offerToTakeServiceRequest(request.id, {
        message: message.trim() || undefined,
        quoted_amount: amount ? Number(amount) : null
      });
      return result.error ? { error: result.error } : undefined;
    }, "Offer sent. The customer has been notified.");
    if (ok) onDone();
  }

  return (
    <form onSubmit={submit} className="auth-form" style={{ marginTop: "0.75rem" }}>
      <label>
        Message to the customer (optional)
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="e.g. I can come tomorrow morning" maxLength={1000} />
      </label>
      <label>
        Your quote in ₹ (optional)
        <input type="number" min={0} step="1" value={amount} onChange={(event) => setAmount(event.target.value)} />
      </label>
      <FormNotice error={offer.error} />
      <div className="inline-actions">
        <button type="submit" className="primary-button" disabled={offer.isSubmitting}>
          {offer.isSubmitting ? "Sending..." : "Send offer"}
        </button>
        <button type="button" className="secondary-button" onClick={onDone}>
          Close
        </button>
      </div>
    </form>
  );
}

export function ElectricianServiceRequestsPage() {
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const action = useMutationAction();
  const list = useServiceRequests();
  const requests = list.data[0]?.requests ?? [];
  const openRequests = requests.filter((request) => request.status === "open");
  const myJobs = requests.filter((request) => request.status !== "open");

  return (
    <div className="page-stack">
      <PageSection
        title="Open requests"
        description="Complaints and installations customers need help with. Offer to take one; the customer chooses who does the work."
      >
        <QueryState
          loading={list.loading}
          error={list.error}
          hasData={openRequests.length > 0}
          empty={{ title: "No open requests", description: "You will be notified when a customer raises a new one." }}
        >
          <CardGrid>
            {openRequests.map((request) => {
              const myOffer = request.responses[0];
              return (
                <DataCard
                  key={request.id}
                  title={request.title}
                  subtitle={[SERVICE_REQUEST_TYPE_LABELS[request.request_type], request.customer_name].filter(Boolean).join(" · ")}
                  meta={myOffer ? "Offer sent" : "New"}
                >
                  <RequestSummary request={request} />
                  {myOffer ? (
                    <p className="form-field-hint">
                      You offered{formatAmount(myOffer.quoted_amount) ? ` at ${formatAmount(myOffer.quoted_amount)}` : ""}. The customer&apos;s address is shared if they choose you.
                    </p>
                  ) : offeringId === request.id ? (
                    <OfferForm request={request} onDone={() => setOfferingId(null)} />
                  ) : (
                    <div className="inline-actions">
                      <button type="button" className="primary-button" onClick={() => setOfferingId(request.id)}>
                        I can do this
                      </button>
                    </div>
                  )}
                </DataCard>
              );
            })}
          </CardGrid>
        </QueryState>
      </PageSection>

      <PageSection title="My jobs" description="Requests customers chose you for.">
        <FormNotice error={action.error} success={action.success} />
        <QueryState
          loading={list.loading}
          error={list.error}
          hasData={myJobs.length > 0}
          empty={{ title: "No jobs yet", description: "When a customer chooses you, the job and their contact details appear here." }}
        >
          <CardGrid>
            {myJobs.map((request) => (
              <DataCard
                key={request.id}
                title={request.title}
                subtitle={[SERVICE_REQUEST_TYPE_LABELS[request.request_type], request.customer_name].filter(Boolean).join(" · ")}
                meta={SERVICE_REQUEST_STATUS_LABELS[request.status]}
              >
                <RequestSummary request={request} />
                {request.address ? <p><strong>Address:</strong> {request.address}{request.city ? `, ${request.city}` : ""}</p> : null}
                {request.contact_phone ? (
                  <p><strong>Phone:</strong> <a href={`tel:${request.contact_phone}`}>{request.contact_phone}</a></p>
                ) : null}
                {["assigned", "in_progress"].includes(request.status) ? (
                  <div className="inline-actions">
                    {request.status === "assigned" ? (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={action.isSubmitting}
                        onClick={() =>
                          void action.run(async () => {
                            const result = await updateServiceRequestStatus(request.id, "in_progress");
                            return result.error ? { error: result.error } : undefined;
                          }, "Marked as started. The customer has been notified.")
                        }
                      >
                        Start work
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="primary-button"
                      disabled={action.isSubmitting}
                      onClick={() =>
                        void action.run(async () => {
                          const result = await updateServiceRequestStatus(request.id, "completed");
                          return result.error ? { error: result.error } : undefined;
                        }, "Marked as completed. The customer has been notified.")
                      }
                    >
                      Mark completed
                    </button>
                  </div>
                ) : null}
              </DataCard>
            ))}
          </CardGrid>
        </QueryState>
      </PageSection>
    </div>
  );
}

export function AdminServiceRequestsPage() {
  const action = useMutationAction();
  const list = useServiceRequests();
  const requests = list.data[0]?.requests ?? [];

  return (
    <PageSection title="Service requests" description="Every complaint and installation request in this workspace, with the electricians who offered to help.">
      <FormNotice error={action.error} success={action.success} />
      <QueryState
        loading={list.loading}
        error={list.error}
        hasData={requests.length > 0}
        empty={{ title: "No service requests yet", description: "Requests raised by customers will appear here." }}
      >
        <CardGrid>
          {requests.map((request) => (
            <DataCard
              key={request.id}
              title={request.title}
              subtitle={[SERVICE_REQUEST_TYPE_LABELS[request.request_type], request.customer_name].filter(Boolean).join(" · ")}
              meta={SERVICE_REQUEST_STATUS_LABELS[request.status]}
            >
              <RequestSummary request={request} />
              <p>{request.address}{request.contact_phone ? ` · ${request.contact_phone}` : ""}</p>
              <p className="form-field-hint">
                {request.assigned_electrician
                  ? `Assigned to ${request.assigned_electrician.full_name}`
                  : `${request.responses.length} offer${request.responses.length === 1 ? "" : "s"}: ${request.responses.map((response) => response.electrician_name).join(", ") || "none yet"}`}
              </p>
              {["open", "assigned", "in_progress"].includes(request.status) ? (
                <div className="inline-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={action.isSubmitting}
                    onClick={() => {
                      if (!window.confirm("Cancel this request for the customer?")) return;
                      void action.run(async () => {
                        const result = await updateServiceRequestStatus(request.id, "cancelled");
                        return result.error ? { error: result.error } : undefined;
                      }, "Request cancelled.");
                    }}
                  >
                    Cancel request
                  </button>
                </div>
              ) : null}
            </DataCard>
          ))}
        </CardGrid>
      </QueryState>
    </PageSection>
  );
}
