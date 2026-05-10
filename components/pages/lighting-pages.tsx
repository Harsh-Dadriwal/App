"use client";

import { useMemo, useState } from "react";
import {
  CardGrid,
  DataCard,
  FormCard,
  FormGrid,
  FormNotice,
  FormSectionHeader,
  PageSection,
  QueryState,
  useMutationAction,
  useRows,
} from "@/components/data-view";
import { useAuth } from "@/components/providers/auth-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  type LightingLeadConfig,
  type LightingProduct,
  type LightingScene,
  criVisual,
  formatLightingSpec,
  kelvinOverlay,
  lightingEducation,
  lumensVisual,
  retailBaselineScene,
  roomSceneDataUri,
  sceneFromProduct,
  ugrVisual,
} from "@/lib/lighting-visualizer";

type LeadFormState = {
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  room_type: string;
  notes: string;
};

function TooltipPill({ title, bodyEn, bodyHi }: { title: string; bodyEn: string; bodyHi: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lighting-tooltip">
      <button type="button" className="lighting-tooltip-trigger" onClick={() => setOpen((value) => !value)}>
        {title}
      </button>
      {open ? (
        <div className="lighting-tooltip-card">
          <p><strong>English:</strong> {bodyEn}</p>
          <p><strong>Hindi:</strong> {bodyHi}</p>
        </div>
      ) : null}
    </div>
  );
}

function SceneRoom({
  scene,
  label,
}: {
  scene: LightingScene;
  label: string;
}) {
  const kelvin = kelvinOverlay(scene);
  const cri = criVisual(scene);
  const ugr = ugrVisual(scene);
  const lumens = lumensVisual(scene);

  return (
    <div className="lighting-room-scene">
      <img src={roomSceneDataUri} alt="Interior room visualizer scene" className="lighting-room-image" />
      <div className="lighting-room-layer lighting-room-brightness" style={{ opacity: 1 - lumens.brightness * 0.18 }} />
      <div className="lighting-room-layer lighting-room-warm" style={{ opacity: kelvin.warmOpacity }} />
      <div className="lighting-room-layer lighting-room-cool" style={{ opacity: kelvin.coolOpacity }} />
      <div className="lighting-room-layer lighting-room-dull" style={{ opacity: cri.dullOverlay }} />
      <div className="lighting-room-vignette" style={{ opacity: lumens.vignette }} />
      <div className="lighting-room-glow left" style={{ opacity: ugr.glowOpacity, filter: `blur(${ugr.blur}px)`, transform: `scale(${ugr.glowScale})` }} />
      <div className="lighting-room-glow center" style={{ opacity: ugr.glowOpacity, filter: `blur(${ugr.blur}px)`, transform: `scale(${ugr.glowScale})` }} />
      <div className="lighting-room-glow right" style={{ opacity: ugr.glowOpacity, filter: `blur(${ugr.blur}px)`, transform: `scale(${ugr.glowScale})` }} />
      <div className="lighting-room-caption">
        <strong>{label}</strong>
        <span>{scene.kelvin}K • CRI {scene.cri} • UGR {scene.ugr} • {scene.lumens} lm</span>
      </div>
    </div>
  );
}

function BeforeAfterVisualizer({
  before,
  after,
  comparePosition,
}: {
  before: LightingScene;
  after: LightingScene;
  comparePosition: number;
}) {
  return (
    <div className="lighting-compare-card">
      <div className="lighting-compare-stage">
        <SceneRoom scene={before} label="Standard retail baseline" />
        <div className="lighting-compare-after" style={{ clipPath: `inset(0 ${100 - comparePosition}% 0 0)` }}>
          <SceneRoom scene={after} label="Architectural lighting scene" />
        </div>
        <div className="lighting-compare-divider" style={{ left: `${comparePosition}%` }}>
          <span>Before / After</span>
        </div>
      </div>
      <label className="lighting-range-field">
        <span>Comparison slider</span>
        <input
          type="range"
          min={0}
          max={100}
          value={comparePosition}
          onChange={() => undefined}
          readOnly
          aria-label="Before and after comparison preview"
        />
      </label>
    </div>
  );
}

export function LightingVisualizerPage({ role }: { role: "customer" | "architect" | "admin" }) {
  const { profile, activeTenant } = useAuth();
  const mutation = useMutationAction();
  const tenantId = activeTenant?.id ?? "";
  const [selectedProductId, setSelectedProductId] = useState("");
  const [kelvinValue, setKelvinValue] = useState(3500);
  const [criValue, setCriValue] = useState(90);
  const [comparePosition, setComparePosition] = useState(58);
  const [leadForm, setLeadForm] = useState<LeadFormState>({
    contact_name: profile?.full_name ?? "",
    contact_phone: profile?.phone ?? "",
    contact_email: profile?.email ?? "",
    room_type: "living_room",
    notes: "",
  });

  const products = useRows(
    async (client) => {
      const { data, error } = await client
        .from("lighting_products")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("brand")
        .order("product_name");
      return { data: (data ?? []) as LightingProduct[], error: error?.message ?? null };
    },
    [tenantId],
    { realtimeTable: "lighting_products" },
  );

  const leads = useRows(
    async (client) => {
      if (role !== "admin") return { data: [] as any[], error: null };
      const { data, error } = await client
        .from("leads")
        .select("id, contact_name, contact_phone, contact_email, room_type, configuration, created_at")
        .eq("tenant_id", tenantId)
        .eq("module", "architectural_lighting_visualizer")
        .order("created_at", { ascending: false })
        .limit(10);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [role, tenantId],
    { realtimeTable: "leads" },
  );

  const selectedProduct = useMemo(
    () => products.data.find((product) => product.id === selectedProductId) ?? products.data[0] ?? null,
    [products.data, selectedProductId],
  );

  const baselineScene = retailBaselineScene;
  const adjustedScene = sceneFromProduct(selectedProduct, {
    kelvin: kelvinValue,
    cri: criValue,
    ugr: selectedProduct?.ugr,
    lumens: selectedProduct?.lumens,
  });

  const leadConfig: LightingLeadConfig = {
    productId: selectedProduct?.id ?? null,
    productName: selectedProduct?.product_name ?? null,
    brand: selectedProduct?.brand ?? null,
    kelvin: adjustedScene.kelvin,
    cri: adjustedScene.cri,
    ugr: adjustedScene.ugr,
    lumens: adjustedScene.lumens,
    comparePosition,
    roomType: leadForm.room_type,
  };

  async function submitLead() {
    const client = await getSupabaseBrowserClient();
    if (!client || !tenantId) return;

    const ok = await mutation.run(
      async () =>
        client.from("leads").insert({
          tenant_id: tenantId,
          requester_user_id: profile?.id ?? null,
          product_id: selectedProduct?.id ?? null,
          module: "architectural_lighting_visualizer",
          room_type: leadForm.room_type,
          contact_name: leadForm.contact_name,
          contact_phone: leadForm.contact_phone || null,
          contact_email: leadForm.contact_email || null,
          notes: leadForm.notes || null,
          configuration: leadConfig,
        }),
      "Quote request saved.",
    );

    if (ok) {
      leads.refetch?.();
    }
  }

  return (
    <div className="page-stack">
      <PageSection
        title="Architectural Lighting Visualizer"
        description="Preview premium lighting scenes with Kelvin temperature, CRI richness, and UGR comfort before you request a quote."
      >
        <QueryState
          loading={products.loading}
          error={products.error}
          hasData={products.data.length > 0}
          empty={{
            title: "No lighting products yet",
            description: "Run the lighting visualizer SQL migration or add lighting products in Supabase first.",
          }}
        >
          <div className="lighting-layout">
            <div className="lighting-visual-column">
              <BeforeAfterVisualizer before={baselineScene} after={adjustedScene} comparePosition={comparePosition} />
              <label className="lighting-range-field">
                <span>Move comparison handle</span>
                <input
                  type="range"
                  min={10}
                  max={90}
                  value={comparePosition}
                  onChange={(event) => setComparePosition(Number(event.target.value))}
                />
              </label>
            </div>

            <div className="lighting-panel-column">
              <FormCard title="Lighting scenes" description="Choose a premium product scene, then fine-tune the warmth and color richness manually.">
                <FormSectionHeader
                  title="Technical guidance"
                  lead={
                    <div className="lighting-tooltip-row">
                      <TooltipPill title="What is CRI?" bodyEn={lightingEducation.cri.en} bodyHi={lightingEducation.cri.hi} />
                      <TooltipPill title="What is UGR?" bodyEn={lightingEducation.ugr.en} bodyHi={lightingEducation.ugr.hi} />
                    </div>
                  }
                />
                <CardGrid>
                  {products.data.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      className={`lighting-product-card${selectedProduct?.id === product.id ? " is-active" : ""}`}
                      onClick={() => {
                        setSelectedProductId(product.id);
                        setKelvinValue(product.kelvin);
                        setCriValue(product.cri);
                      }}
                    >
                      <div>
                        <p className="lighting-product-brand">{product.brand}</p>
                        <h3>{product.product_name}</h3>
                        <p className="lighting-product-summary">{product.summary}</p>
                      </div>
                      <div className="lighting-product-meta">
                        <span>{product.hero_badge ?? "Scene"}</span>
                        <small>{formatLightingSpec(product)}</small>
                      </div>
                    </button>
                  ))}
                </CardGrid>
              </FormCard>

              <div className="lighting-bottom-sheet">
                <h3>Manual scene tuning</h3>
                <p>Use Kelvin and CRI sliders to make the room warmer, cooler, richer, or flatter before saving the lead.</p>
                <label className="lighting-range-field">
                  <span>Kelvin temperature: {kelvinValue}K</span>
                  <input type="range" min={2700} max={6500} step={100} value={kelvinValue} onChange={(event) => setKelvinValue(Number(event.target.value))} />
                </label>
                <label className="lighting-range-field">
                  <span>CRI intensity: {criValue}</span>
                  <input type="range" min={60} max={98} step={1} value={criValue} onChange={(event) => setCriValue(Number(event.target.value))} />
                </label>
                <div className="lighting-spec-grid">
                  <div><span>Selected product</span><strong>{selectedProduct?.product_name ?? "—"}</strong></div>
                  <div><span>UGR comfort</span><strong>{adjustedScene.ugr}</strong></div>
                  <div><span>Lumens</span><strong>{adjustedScene.lumens}</strong></div>
                  <div><span>Brand</span><strong>{selectedProduct?.brand ?? "—"}</strong></div>
                </div>
              </div>
            </div>
          </div>
        </QueryState>
      </PageSection>

      {role !== "admin" ? (
        <FormCard title="Request a quote" description="Save this exact scene, your contact details, and the selected product to Supabase so the team can follow up.">
          <FormGrid>
            <label>
              Name
              <input value={leadForm.contact_name} onChange={(event) => setLeadForm((state) => ({ ...state, contact_name: event.target.value }))} placeholder="Your name" />
            </label>
            <label>
              Phone
              <input value={leadForm.contact_phone} onChange={(event) => setLeadForm((state) => ({ ...state, contact_phone: event.target.value }))} placeholder="+91..." />
            </label>
            <label>
              Email
              <input value={leadForm.contact_email} onChange={(event) => setLeadForm((state) => ({ ...state, contact_email: event.target.value }))} placeholder="you@example.com" />
            </label>
            <label>
              Room type
              <select value={leadForm.room_type} onChange={(event) => setLeadForm((state) => ({ ...state, room_type: event.target.value }))}>
                <option value="living_room">Living room</option>
                <option value="bedroom">Bedroom</option>
                <option value="kitchen">Kitchen</option>
                <option value="office">Office</option>
                <option value="lobby">Lobby</option>
              </select>
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Notes
              <textarea rows={4} value={leadForm.notes} onChange={(event) => setLeadForm((state) => ({ ...state, notes: event.target.value }))} placeholder="Tell us what mood, finish, or budget you want." />
            </label>
          </FormGrid>
          <div className="lighting-quote-summary">
            <strong>Scene to be saved</strong>
            <span>{selectedProduct?.brand ?? "Custom"} • {adjustedScene.kelvin}K • CRI {adjustedScene.cri} • UGR {adjustedScene.ugr}</span>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="primary-button"
              disabled={mutation.isSubmitting || !leadForm.contact_name}
              onClick={() => void submitLead()}
            >
              {mutation.isSubmitting ? "Saving..." : "Request a quote"}
            </button>
          </div>
          <FormNotice error={mutation.error} success={mutation.success} />
        </FormCard>
      ) : (
        <PageSection title="Recent visualizer leads" description="Admin can review the most recent room-scene quote requests captured from the visualizer.">
          <QueryState
            loading={leads.loading}
            error={leads.error}
            hasData={leads.data.length > 0}
            empty={{ title: "No leads yet", description: "New visualizer requests will appear here once customers or architects submit them." }}
          >
            <CardGrid>
              {leads.data.map((lead: any) => (
                <DataCard key={lead.id} title={lead.contact_name} subtitle={lead.room_type} meta={new Date(lead.created_at).toLocaleDateString("en-IN")}>
                  <p>{lead.contact_phone || lead.contact_email || "No direct contact shared"}</p>
                  <p>{lead.configuration?.brand ?? "Custom"} • {lead.configuration?.kelvin ?? "-"}K • CRI {lead.configuration?.cri ?? "-"}</p>
                </DataCard>
              ))}
            </CardGrid>
          </QueryState>
        </PageSection>
      )}
    </div>
  );
}
