import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMemo, useState } from "react";
import { AppButton, Card, Chip, Field, Notice, QueryState, ScreenShell, SectionTitle } from "@/components/ui";
import { useMutationAction, useRows } from "@/components/app-state";
import { useAuth } from "@/providers/auth-provider";
import { palette } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import {
  type LightingProduct,
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

const kelvinSteps = [2700, 3000, 3500, 4000, 5000, 6000, 6500];
const criSteps = [60, 70, 80, 90, 95, 98];

function StepSlider({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: number[];
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.sliderWrap}>
      <Text style={styles.sliderLabel}>{label}</Text>
      <View style={styles.sliderRow}>
        {values.map((step) => {
          const active = value === step;
          return (
            <Pressable
              key={step}
              style={[styles.sliderStep, active && styles.sliderStepActive]}
              onPress={() => onChange(step)}
            >
              <Text style={[styles.sliderStepText, active && styles.sliderStepTextActive]}>{step}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TooltipCard({ title, en, hi }: { title: string; en: string; hi: string }) {
  return (
    <Card tone="soft">
      <Text style={styles.tooltipTitle}>{title}</Text>
      <Text style={styles.tooltipBody}><Text style={styles.tooltipStrong}>English:</Text> {en}</Text>
      <Text style={styles.tooltipBody}><Text style={styles.tooltipStrong}>Hindi:</Text> {hi}</Text>
    </Card>
  );
}

function RoomPreview({
  label,
  kelvin,
  cri,
  ugr,
  lumens,
}: {
  label: string;
  kelvin: number;
  cri: number;
  ugr: number;
  lumens: number;
}) {
  const scene = { kelvin, cri, ugr, lumens };
  const kelvinFx = kelvinOverlay(scene);
  const criFx = criVisual(scene);
  const ugrFx = ugrVisual(scene);
  const lumensFx = lumensVisual(scene);

  return (
    <View style={styles.previewCard}>
      <ImageBackground source={{ uri: roomSceneDataUri }} style={styles.previewImage} imageStyle={styles.previewImageInner}>
        <View style={[styles.previewLayer, { backgroundColor: "rgba(10,14,22,0.18)", opacity: 1 - lumensFx.brightness * 0.18 }]} />
        <View style={[styles.previewLayer, { backgroundColor: `rgba(255,167,79,${kelvinFx.warmOpacity})` }]} />
        <View style={[styles.previewLayer, { backgroundColor: `rgba(166,211,255,${kelvinFx.coolOpacity})` }]} />
        <View style={[styles.previewLayer, { backgroundColor: `rgba(97,104,116,${criFx.dullOverlay})` }]} />
        <View style={[styles.previewGlow, styles.previewGlowLeft, { opacity: ugrFx.glowOpacity, transform: [{ scale: ugrFx.glowScale }] }]} />
        <View style={[styles.previewGlow, styles.previewGlowCenter, { opacity: ugrFx.glowOpacity, transform: [{ scale: ugrFx.glowScale }] }]} />
        <View style={[styles.previewGlow, styles.previewGlowRight, { opacity: ugrFx.glowOpacity, transform: [{ scale: ugrFx.glowScale }] }]} />
        <View style={[styles.previewLayer, { backgroundColor: `rgba(15,23,42,${lumensFx.vignette})` }]} />
        <View style={styles.previewCaption}>
          <Text style={styles.previewCaptionTitle}>{label}</Text>
          <Text style={styles.previewCaptionText}>{kelvin}K • CRI {cri} • UGR {ugr} • {lumens} lm</Text>
        </View>
      </ImageBackground>
    </View>
  );
}

export function LightingScreen() {
  const { profile, activeTenant } = useAuth();
  const mutation = useMutationAction();
  const tenantId = activeTenant?.id ?? "";
  const role = profile?.role ?? "customer";
  const [selectedProductId, setSelectedProductId] = useState("");
  const [kelvinValue, setKelvinValue] = useState(3500);
  const [criValue, setCriValue] = useState(90);
  const [compareMode, setCompareMode] = useState<"before" | "after">("after");
  const [leadForm, setLeadForm] = useState({
    contact_name: profile?.full_name ?? "",
    contact_phone: profile?.phone ?? "",
    contact_email: profile?.email ?? "",
    room_type: "living_room",
    notes: "",
  });

  const products = useRows(async (client) => {
    const { data, error } = await client
      .from("lighting_products")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("brand")
      .order("product_name");
    return { data: (data ?? []) as LightingProduct[], error: error?.message ?? null };
  }, [tenantId], { realtimeTable: "lighting_products" });

  const leads = useRows(async (client) => {
    if (role !== "admin") return { data: [] as any[], error: null };
    const { data, error } = await client
      .from("leads")
      .select("id, contact_name, contact_phone, contact_email, room_type, configuration, created_at")
      .eq("tenant_id", tenantId)
      .eq("module", "architectural_lighting_visualizer")
      .order("created_at", { ascending: false })
      .limit(10);
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, [tenantId, role], { realtimeTable: "leads" });

  const selectedProduct = useMemo(
    () => products.data.find((product) => product.id === selectedProductId) ?? products.data[0] ?? null,
    [products.data, selectedProductId],
  );

  const scene = sceneFromProduct(selectedProduct, {
    kelvin: kelvinValue,
    cri: criValue,
    ugr: selectedProduct?.ugr,
    lumens: selectedProduct?.lumens,
  });

  async function submitLead() {
    const client = supabase;
    if (!client || !tenantId) return;

    await mutation.run(
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
          configuration: {
            productId: selectedProduct?.id ?? null,
            productName: selectedProduct?.product_name ?? null,
            brand: selectedProduct?.brand ?? null,
            kelvin: scene.kelvin,
            cri: scene.cri,
            ugr: scene.ugr,
            lumens: scene.lumens,
            compareMode,
            roomType: leadForm.room_type,
          },
        }),
      "Quote request saved.",
    );

    leads.refetch();
  }

  return (
    <ScreenShell
      title="Lighting Visualizer"
      subtitle="Preview warm luxury, cool clarity, and high-CRI scenes using live product specs from Supabase."
      currentScreen="lighting"
      showBack
    >
      <SectionTitle title="Compare the room mood" description="Switch between standard retail light and the selected architectural scene." />
      <QueryState
        loading={products.loading}
        error={products.error}
        hasData={products.data.length > 0}
        empty="No lighting products found yet. Run the lighting visualizer SQL file first."
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.compareToggleRow}>
            <Chip label="Before" active={compareMode === "before"} onPress={() => setCompareMode("before")} />
            <Chip label="After" active={compareMode === "after"} onPress={() => setCompareMode("after")} />
          </View>
        </ScrollView>

        <RoomPreview
          label={compareMode === "before" ? "Standard retail baseline" : "Architectural lighting scene"}
          kelvin={compareMode === "before" ? retailBaselineScene.kelvin : scene.kelvin}
          cri={compareMode === "before" ? retailBaselineScene.cri : scene.cri}
          ugr={compareMode === "before" ? retailBaselineScene.ugr : scene.ugr}
          lumens={compareMode === "before" ? retailBaselineScene.lumens : scene.lumens}
        />

        <SectionTitle title="Choose a product scene" description="Tap a product to apply its technical spec profile." />
        {products.data.map((product) => {
          const active = selectedProduct?.id === product.id;
          return (
            <Pressable
              key={product.id}
              style={[styles.productCard, active && styles.productCardActive]}
              onPress={() => {
                setSelectedProductId(product.id);
                setKelvinValue(product.kelvin);
                setCriValue(product.cri);
              }}
            >
              <Text style={styles.productBrand}>{product.brand}</Text>
              <Text style={styles.productTitle}>{product.product_name}</Text>
              <Text style={styles.productSummary}>{product.summary ?? "Architectural scene profile."}</Text>
              <Text style={styles.productMeta}>{formatLightingSpec(product)}</Text>
            </Pressable>
          );
        })}

        <Card tone="brand">
          <Text style={styles.sheetTitle}>Manual scene tuning</Text>
          <Text style={styles.sheetBody}>Use quick tap sliders for Kelvin and CRI, then save the exact look as a quote request.</Text>
          <StepSlider label={`Kelvin: ${kelvinValue}K`} values={kelvinSteps} value={kelvinValue} onChange={setKelvinValue} />
          <StepSlider label={`CRI: ${criValue}`} values={criSteps} value={criValue} onChange={setCriValue} />
          <View style={styles.specWrap}>
            <Text style={styles.specLine}>UGR comfort: <Text style={styles.specStrong}>{scene.ugr}</Text></Text>
            <Text style={styles.specLine}>Lumens: <Text style={styles.specStrong}>{scene.lumens}</Text></Text>
          </View>
        </Card>

        <TooltipCard title="What is CRI?" en={lightingEducation.cri.en} hi={lightingEducation.cri.hi} />
        <TooltipCard title="What is UGR?" en={lightingEducation.ugr.en} hi={lightingEducation.ugr.hi} />
      </QueryState>

      {role !== "admin" ? (
        <>
          <SectionTitle title="Request a quote" description="Save this scene and your contact details to the shared leads table." />
          <Card>
            <Field label="Name" value={leadForm.contact_name} onChangeText={(value) => setLeadForm((state) => ({ ...state, contact_name: value }))} placeholder="Your name" />
            <Field label="Phone" value={leadForm.contact_phone} onChangeText={(value) => setLeadForm((state) => ({ ...state, contact_phone: value }))} placeholder="+91..." />
            <Field label="Email" value={leadForm.contact_email} onChangeText={(value) => setLeadForm((state) => ({ ...state, contact_email: value }))} placeholder="you@example.com" />
            <Field label="Room type" value={leadForm.room_type} onChangeText={(value) => setLeadForm((state) => ({ ...state, room_type: value }))} placeholder="living_room" />
            <Field label="Notes" value={leadForm.notes} onChangeText={(value) => setLeadForm((state) => ({ ...state, notes: value }))} placeholder="Warm premium look, no harsh glare..." multiline />
            <View style={{ marginTop: 14 }}>
              <AppButton label={mutation.loading ? "Saving..." : "Request a Quote"} icon="send" onPress={() => void submitLead()} disabled={mutation.loading || !leadForm.contact_name} />
            </View>
          </Card>
        </>
      ) : (
        <>
          <SectionTitle title="Recent lighting leads" description="Admin can quickly monitor recent quote requests from web and mobile." />
          <QueryState
            loading={leads.loading}
            error={leads.error}
            hasData={leads.data.length > 0}
            empty="No lighting leads captured yet."
          >
            {leads.data.map((lead: any) => (
              <Card key={lead.id}>
                <Text style={styles.leadTitle}>{lead.contact_name}</Text>
                <Text style={styles.leadMeta}>{lead.contact_phone || lead.contact_email || "No contact info"}</Text>
                <Text style={styles.leadMeta}>
                  {lead.configuration?.brand ?? "Custom"} • {lead.configuration?.kelvin ?? "-"}K • CRI {lead.configuration?.cri ?? "-"}
                </Text>
              </Card>
            ))}
          </QueryState>
        </>
      )}

      {mutation.error ? <Notice message={mutation.error} tone="error" /> : null}
      {mutation.success ? <Notice message={mutation.success} tone="success" /> : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  compareToggleRow: {
    flexDirection: "row",
    gap: 10,
  },
  previewCard: {
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#151822",
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  previewImage: {
    minHeight: 290,
    justifyContent: "flex-end",
  },
  previewImageInner: {
    resizeMode: "cover",
  },
  previewLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  previewGlow: {
    position: "absolute",
    top: 16,
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(255,225,179,0.75)",
  },
  previewGlowLeft: { left: 22 },
  previewGlowCenter: { left: "42%" },
  previewGlowRight: { right: 22 },
  previewCaption: {
    margin: 14,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(15,23,42,0.62)",
  },
  previewCaptionTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  previewCaptionText: {
    color: "rgba(255,255,255,0.8)",
    marginTop: 4,
    fontSize: 13,
  },
  productCard: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 22,
    backgroundColor: palette.surfaceRaised,
    padding: 16,
    marginBottom: 12,
  },
  productCardActive: {
    borderColor: palette.brand,
    backgroundColor: palette.brandSoft,
  },
  productBrand: {
    color: palette.brand,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontSize: 12,
    fontWeight: "800",
  },
  productTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 4,
  },
  productSummary: {
    color: palette.muted,
    marginTop: 6,
    lineHeight: 20,
  },
  productMeta: {
    color: palette.ink,
    marginTop: 10,
    fontWeight: "700",
    fontSize: 13,
  },
  sheetTitle: {
    color: palette.ink,
    fontSize: 20,
    fontWeight: "900",
  },
  sheetBody: {
    color: palette.muted,
    marginTop: 4,
    lineHeight: 21,
  },
  sliderWrap: {
    marginTop: 14,
    gap: 10,
  },
  sliderLabel: {
    color: palette.ink,
    fontWeight: "700",
  },
  sliderRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sliderStep: {
    borderWidth: 1,
    borderColor: palette.lineStrong,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: palette.surface,
  },
  sliderStepActive: {
    borderColor: palette.brand,
    backgroundColor: palette.brand,
  },
  sliderStepText: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 12,
  },
  sliderStepTextActive: {
    color: "#fffaf4",
  },
  specWrap: {
    marginTop: 14,
    gap: 4,
  },
  specLine: {
    color: palette.ink,
    fontSize: 14,
  },
  specStrong: {
    fontWeight: "800",
  },
  tooltipTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
  },
  tooltipBody: {
    color: palette.muted,
    lineHeight: 21,
    marginBottom: 6,
  },
  tooltipStrong: {
    color: palette.ink,
    fontWeight: "700",
  },
  leadTitle: {
    color: palette.ink,
    fontSize: 17,
    fontWeight: "800",
  },
  leadMeta: {
    color: palette.muted,
    marginTop: 6,
    lineHeight: 20,
  },
});
