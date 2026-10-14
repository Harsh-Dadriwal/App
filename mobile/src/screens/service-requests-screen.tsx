import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Text, View } from "react-native";
import { useMutationAction } from "@/components/app-state";
import { AppButton, Card, Chip, Field, Notice, QueryState, ScreenShell, SectionTitle } from "@/components/ui";
import { palette } from "@/lib/theme";
import { useAuth } from "@/providers/auth-provider";
import {
  chooseServiceRequestElectrician,
  createServiceRequest,
  listServiceRequests,
  offerToTakeServiceRequest,
  updateServiceRequestStatus
} from "@/lib/backend/service-requests-gateway";
import {
  SERVICE_REQUEST_STATUS_LABELS,
  SERVICE_REQUEST_TYPE_LABELS,
  type ServiceRequest,
  type ServiceRequestStatus,
  type ServiceRequestType
} from "@mahalaxmi/core/gateway/service-requests-gateway";

const EMPTY_FORM = { request_type: "complaint" as ServiceRequestType, title: "", description: "", address: "", city: "", contact_phone: "" };

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-IN") : null;
}

function formatAmount(value: number | null) {
  return value === null ? null : `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function RequestHeader({ request, meta }: { request: ServiceRequest; meta: string }) {
  return (
    <>
      <Text style={{ fontSize: 17, fontWeight: "800" }}>{request.title}</Text>
      <Text style={{ marginTop: 2, color: palette.brandDeep, fontWeight: "700" }}>
        {[SERVICE_REQUEST_TYPE_LABELS[request.request_type], meta].join(" · ")}
      </Text>
      <Text style={{ marginTop: 8, lineHeight: 21 }}>{request.description}</Text>
      <Text style={{ marginTop: 6, color: palette.muted }}>
        {[`Raised ${formatDate(request.created_at)}`, request.city, request.customer_name].filter(Boolean).join(" · ")}
      </Text>
    </>
  );
}

export function ServiceRequestsScreen() {
  const { profile } = useAuth();
  const role = profile?.role;
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [offering, setOffering] = useState<{ id: string; message: string; amount: string } | null>(null);
  const mutation = useMutationAction();

  const load = useCallback(async () => {
    const result = await listServiceRequests();
    if (result.data) setRequests(result.data.requests);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: () => Promise<{ error: string | null }>, successMessage: string) {
    const ok = await mutation.run(async () => {
      const result = await action();
      return result.error ? { error: result.error } : undefined;
    }, successMessage);
    if (ok) await load();
    return ok;
  }

  async function submitRequest() {
    const ok = await act(
      () => createServiceRequest({
        ...form,
        city: form.city.trim() || undefined,
        contact_phone: form.contact_phone.trim() || undefined
      }),
      "Request sent. Electricians have been notified."
    );
    if (ok) setForm(EMPTY_FORM);
  }

  function changeStatus(request: ServiceRequest, status: ServiceRequestStatus, successMessage: string) {
    void act(() => updateServiceRequestStatus(request.id, status), successMessage);
  }

  function confirmCancel(request: ServiceRequest) {
    Alert.alert("Cancel this request?", request.title, [
      { text: "Keep it", style: "cancel" },
      { text: "Cancel request", style: "destructive", onPress: () => changeStatus(request, "cancelled", "Request cancelled.") }
    ]);
  }

  const status = (
    <>
      {mutation.error ? <Notice message={mutation.error} tone="error" /> : null}
      {mutation.success ? <Notice message={mutation.success} tone="success" /> : null}
    </>
  );

  if (role === "customer") {
    return (
      <ScreenShell
        title="Complaints & installation"
        subtitle="All electricians are notified, and you choose who does the work."
        currentScreen="service-requests"
        showBack
      >
        <Card tone="brand">
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            {(["complaint", "installation"] as const).map((type) => (
              <Chip
                key={type}
                label={SERVICE_REQUEST_TYPE_LABELS[type]}
                active={form.request_type === type}
                onPress={() => setForm((current) => ({ ...current, request_type: type }))}
              />
            ))}
          </View>
          <Field label="Title" value={form.title} onChangeText={(title) => setForm((current) => ({ ...current, title }))} placeholder="e.g. Bedroom fan not working" />
          <Field
            label="Details"
            value={form.description}
            onChangeText={(description) => setForm((current) => ({ ...current, description }))}
            placeholder="What is the problem, or what needs to be installed?"
            multiline
          />
          <Field label="Address" value={form.address} onChangeText={(address) => setForm((current) => ({ ...current, address }))} placeholder="House, street, area" />
          <Field label="City" value={form.city} onChangeText={(city) => setForm((current) => ({ ...current, city }))} />
          <Field
            label="Contact number"
            value={form.contact_phone}
            onChangeText={(contact_phone) => setForm((current) => ({ ...current, contact_phone }))}
            placeholder="Uses your profile number if empty"
          />
          <Text style={{ color: palette.muted, marginBottom: 12 }}>Only the electrician you choose sees your address and phone number.</Text>
          <AppButton
            label={mutation.loading ? "Sending..." : "Send request"}
            icon="send"
            disabled={mutation.loading || !form.title.trim() || !form.description.trim() || !form.address.trim()}
            onPress={() => void submitRequest()}
          />
        </Card>
        {status}

        <SectionTitle title="My requests" description="Choose an electrician from the offers to get the work started." />
        <QueryState loading={loading} error={error} hasData={requests.length > 0} empty="No requests yet.">
          {requests.map((request) => (
            <Card key={request.id}>
              <RequestHeader request={request} meta={SERVICE_REQUEST_STATUS_LABELS[request.status]} />
              {request.assigned_electrician ? (
                <Text style={{ marginTop: 8, fontWeight: "700" }}>
                  {request.assigned_electrician.full_name}
                  {request.assigned_electrician.verified ? " (verified)" : ""}
                  {request.assigned_electrician.phone ? ` · ${request.assigned_electrician.phone}` : ""}
                </Text>
              ) : null}
              {request.status === "open" ? (
                request.responses.length ? (
                  request.responses.map((response) => (
                    <Card key={response.id} tone="soft">
                      <Text style={{ fontWeight: "800" }}>
                        {response.electrician_name}
                        {response.verified ? "  ✓ Verified" : ""}
                      </Text>
                      <Text style={{ marginTop: 2, color: palette.muted }}>
                        {[response.electrician_city, formatAmount(response.quoted_amount) ? `Quote ${formatAmount(response.quoted_amount)}` : null]
                          .filter(Boolean)
                          .join(" · ") || "No quote given"}
                      </Text>
                      {response.message ? <Text style={{ marginTop: 6 }}>{response.message}</Text> : null}
                      <View style={{ marginTop: 10 }}>
                        <AppButton
                          label="Choose"
                          icon="check"
                          disabled={mutation.loading}
                          onPress={() =>
                            void act(
                              () => chooseServiceRequestElectrician(request.id, response.id),
                              `${response.electrician_name} has been chosen and notified.`
                            )
                          }
                        />
                      </View>
                    </Card>
                  ))
                ) : (
                  <Text style={{ marginTop: 8, color: palette.muted }}>Waiting for electricians to respond.</Text>
                )
              ) : null}
              <View style={{ gap: 8, marginTop: 10 }}>
                {["assigned", "in_progress"].includes(request.status) ? (
                  <AppButton label="Mark completed" icon="check-circle" disabled={mutation.loading} onPress={() => changeStatus(request, "completed", "Marked as completed.")} />
                ) : null}
                {["open", "assigned"].includes(request.status) ? (
                  <AppButton label="Cancel request" kind="secondary" icon="x" disabled={mutation.loading} onPress={() => confirmCancel(request)} />
                ) : null}
              </View>
            </Card>
          ))}
        </QueryState>
      </ScreenShell>
    );
  }

  if (role !== "electrician" && role !== "admin") {
    return (
      <ScreenShell title="Service requests" subtitle="Available to customers and electricians." currentScreen="service-requests" showBack />
    );
  }

  const openRequests = requests.filter((request) => request.status === "open");
  const otherRequests = requests.filter((request) => request.status !== "open");

  return (
    <ScreenShell
      title="Service requests"
      subtitle="Complaints and installations customers need help with."
      currentScreen="service-requests"
      showBack
    >
      {status}
      <SectionTitle title="Open requests" description={role === "electrician" ? "Offer to take one; the customer chooses who does the work." : undefined} />
      <QueryState loading={loading} error={error} hasData={openRequests.length > 0} empty="No open requests right now.">
        {openRequests.map((request) => {
          const myOffer = role === "electrician" ? request.responses[0] : undefined;
          return (
            <Card key={request.id}>
              <RequestHeader request={request} meta={myOffer ? "Offer sent" : `${request.responses.length} offer${request.responses.length === 1 ? "" : "s"}`} />
              {role === "admin" ? null : myOffer ? (
                <Text style={{ marginTop: 8, color: palette.muted }}>You offered. The address is shared if the customer chooses you.</Text>
              ) : offering?.id === request.id ? (
                <View style={{ marginTop: 10 }}>
                  <Field label="Message (optional)" value={offering.message} onChangeText={(message) => setOffering({ ...offering, message })} multiline />
                  <Field label="Your quote in ₹ (optional)" value={offering.amount} onChangeText={(amount) => setOffering({ ...offering, amount: amount.replace(/[^0-9]/g, "") })} />
                  <View style={{ gap: 8 }}>
                    <AppButton
                      label={mutation.loading ? "Sending..." : "Send offer"}
                      icon="send"
                      disabled={mutation.loading}
                      onPress={() =>
                        void act(
                          () => offerToTakeServiceRequest(request.id, {
                            message: offering.message.trim() || undefined,
                            quoted_amount: offering.amount ? Number(offering.amount) : null
                          }),
                          "Offer sent. The customer has been notified."
                        ).then((ok) => ok && setOffering(null))
                      }
                    />
                    <AppButton label="Close" kind="secondary" onPress={() => setOffering(null)} />
                  </View>
                </View>
              ) : (
                <View style={{ marginTop: 10 }}>
                  <AppButton label="I can do this" icon="thumbs-up" onPress={() => setOffering({ id: request.id, message: "", amount: "" })} />
                </View>
              )}
            </Card>
          );
        })}
      </QueryState>

      <SectionTitle title={role === "electrician" ? "My jobs" : "Assigned and closed"} />
      <QueryState loading={loading} error={error} hasData={otherRequests.length > 0} empty="Nothing here yet.">
        {otherRequests.map((request) => (
          <Card key={request.id}>
            <RequestHeader request={request} meta={SERVICE_REQUEST_STATUS_LABELS[request.status]} />
            {request.address ? <Text style={{ marginTop: 8 }}>Address: {request.address}{request.city ? `, ${request.city}` : ""}</Text> : null}
            {request.contact_phone ? (
              <Text style={{ marginTop: 4, color: palette.teal, fontWeight: "700" }} onPress={() => void Linking.openURL(`tel:${request.contact_phone}`)}>
                Call {request.contact_phone}
              </Text>
            ) : null}
            {role === "electrician" && ["assigned", "in_progress"].includes(request.status) ? (
              <View style={{ gap: 8, marginTop: 10 }}>
                {request.status === "assigned" ? (
                  <AppButton label="Start work" kind="secondary" icon="play" disabled={mutation.loading} onPress={() => changeStatus(request, "in_progress", "Marked as started.")} />
                ) : null}
                <AppButton label="Mark completed" icon="check-circle" disabled={mutation.loading} onPress={() => changeStatus(request, "completed", "Marked as completed.")} />
              </View>
            ) : null}
          </Card>
        ))}
      </QueryState>
    </ScreenShell>
  );
}
