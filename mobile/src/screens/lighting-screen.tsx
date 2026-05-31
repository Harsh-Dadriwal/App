import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View, Modal, TextInput, Animated, Easing } from "react-native";
import { useMemo, useState, useEffect, useRef } from "react";
import { AppButton, Card, Chip, Field, Notice, QueryState, ScreenShell, SectionTitle, BottomActionSheet, SlideToConfirm } from "@/components/ui";
import { useMutationAction, useRows } from "@/components/app-state";
import { useAuth } from "@/providers/auth-provider";
import { palette } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { Feather } from "@expo/vector-icons";
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
} from "@mahalaxmi/core/lighting/visualizer";

const kelvinSteps = [2700, 3000, 3500, 4000, 5000, 6000, 6500];
const criSteps = [60, 70, 80, 90, 95, 98];

function getKelvinColor(kelvin: number) {
  if (kelvin <= 2700) return "#e08b1b"; // Extra Warm Golden
  if (kelvin <= 3500) return "#f1a83a"; // Warm Amber
  if (kelvin <= 4500) return "#f7e2bd"; // Soft Warm White
  if (kelvin <= 5500) return "#e8f8ff"; // Neutral Daylight
  return "#ccebff"; // Cool Ice Blue
}

function getUgrLabel(ugr: number) {
  if (ugr <= 16) return { text: "Glare-free (UGR " + ugr + ")", color: "#0f766e", bg: "rgba(15,118,110,0.12)" };
  if (ugr <= 22) return { text: "Comfort (UGR " + ugr + ")", color: "#b45309", bg: "rgba(180,83,9,0.12)" };
  return { text: "High Glare (UGR " + ugr + ")", color: "#ef4444", bg: "rgba(239,68,68,0.12)" };
}

function getCriBadge(cri: number) {
  if (cri >= 95) return { label: "Elite CRI " + cri, color: "#10b981" };
  if (cri >= 90) return { label: "High CRI " + cri, color: "#0f766e" };
  return { label: "CRI " + cri, color: palette.muted };
}

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
          const isKelvin = step > 1000;
          const bgPillColor = isKelvin ? getKelvinColor(step) : palette.surfaceSoft;
          
          return (
            <Pressable
              key={step}
              style={[
                styles.sliderStep,
                active && styles.sliderStepActive,
                isKelvin && { borderColor: getKelvinColor(step) }
              ]}
              onPress={() => onChange(step)}
            >
              <Text 
                style={[
                  styles.sliderStepText, 
                  active && styles.sliderStepTextActive,
                  isKelvin && !active && { color: palette.ink }
                ]}
              >
                {step}{isKelvin ? "K" : ""}
              </Text>
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
  
  // Visualizer tuner state
  const [selectedProductId, setSelectedProductId] = useState("");
  const [kelvinValue, setKelvinValue] = useState(3500);
  const [criValue, setCriValue] = useState(90);
  const [compareMode, setCompareMode] = useState<"before" | "after">("after");

  // New Lead Wizard State
  const [wizardVisible, setWizardVisible] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [ocrScanning, setOcrScanning] = useState(false);
  const scanAnim = useRef(new Animated.Value(0)).current;

  // Lead status transition states
  const [activeLeadForStatus, setActiveLeadForStatus] = useState<any>(null);
  const [statusSheetVisible, setStatusSheetVisible] = useState(false);
  const [pipelineTab, setPipelineTab] = useState<string>("all");

  const [leadForm, setLeadForm] = useState({
    contact_name: profile?.full_name ?? "",
    contact_phone: profile?.phone ?? "",
    contact_email: profile?.email ?? "",
    room_type: "living_room",
    notes: "",
    dealValue: "12500",
    quantities: "15",
    project_location: "",
    business_type: "Residential",
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
  }, [tenantId], { realtimeTable: "lighting_products", enabled: !!tenantId });

  const leads = useRows(async (client) => {
    if (role !== "admin") return { data: [] as any[], error: null };
    const { data, error } = await client
      .from("leads")
      .select("id, contact_name, contact_phone, contact_email, room_type, configuration, created_at, status")
      .eq("tenant_id", tenantId)
      .eq("module", "architectural_lighting_visualizer")
      .order("created_at", { ascending: false })
      .limit(30);
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, [tenantId, role], { realtimeTable: "leads", enabled: !!tenantId && role === "admin" });

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

  // Animated scanner effect for OCR scanning
  useEffect(() => {
    if (ocrScanning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanAnim, {
            toValue: 1,
            duration: 1000,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(scanAnim, {
            toValue: 0,
            duration: 1000,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      scanAnim.setValue(0);
    }
  }, [ocrScanning]);

  const triggerMockOCR = () => {
    setOcrScanning(true);
    // Simulate Gemini Flash cloud OCR processing delay
    setTimeout(() => {
      setOcrScanning(false);
      setLeadForm((prev) => ({
        ...prev,
        room_type: "office_reception",
        dealValue: "45000",
        quantities: "36",
        notes: "Imported from Philips Precision specifications: CRI 95, UGR 16 glare rating specified for workstations.",
        project_location: "Sector 62, Noida",
      }));
      // Pre-fill visualizer parameters
      setKelvinValue(4000); // 4000K neutral white
      setCriValue(95);      // Elite color quality
      setWizardStep(3);     // Proceed to review step
    }, 2400);
  };

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
          status: "new",
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
            dealValue: parseFloat(leadForm.dealValue) || 12000,
            quantities: parseInt(leadForm.quantities) || 10,
            project_location: leadForm.project_location || "On site",
            business_type: leadForm.business_type || "Residential",
          },
        }),
      "Quote request saved."
    );

    setWizardVisible(false);
    setWizardStep(1);
    leads.refetch();
  }

  async function updateStatus(leadId: string, newStatus: string) {
    const client = supabase;
    if (!client || !leadId) return;
    
    // Quick local state patch will be overwritten by refetch once network operation concludes
    await mutation.run(
      async () =>
        client
          .from("leads")
          .update({ 
            status: newStatus,
            // also update inside configuration jsonb for backwards compatibility
            configuration: {
              ...(activeLeadForStatus?.configuration ?? {}),
              status: newStatus
            }
          })
          .eq("id", leadId),
      "Lead marked as " + newStatus.replace("_", " ")
    );

    setStatusSheetVisible(false);
    leads.refetch();
  }

  // Calculate stats for admin pipeline dashboard
  const stats = useMemo(() => {
    if (role !== "admin" || !leads.data) return { slaBreachedCount: 0, hotLeadsCount: 0 };
    
    let slaBreachedCount = 0;
    let hotLeadsCount = 0;

    leads.data.forEach((lead: any) => {
      const dealValue = lead.configuration?.dealValue ?? 10000;
      const createdAt = new Date(lead.created_at);
      const daysOld = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
      
      const isSla = (lead.status === "quoted" || lead.status === "sample_dispatched") && daysOld >= 3;
      if (isSla) slaBreachedCount++;

      const hotnessScore = dealValue - (daysOld * 150);
      if (hotnessScore > 8000 && lead.status !== "won" && lead.status !== "lost") {
        hotLeadsCount++;
      }
    });

    return { slaBreachedCount, hotLeadsCount };
  }, [leads.data, role]);

  const filteredLeads = useMemo(() => {
    if (!leads.data) return [];
    if (pipelineTab === "all") return leads.data;
    if (pipelineTab === "active") {
      return leads.data.filter((l: any) => l.status !== "won" && l.status !== "lost");
    }
    return leads.data.filter((l: any) => l.status === pipelineTab);
  }, [leads.data, pipelineTab]);

  return (
    <ScreenShell
      title="Lighting Workspace"
      subtitle={role === "admin" ? "Monitor high-value lighting specs, prioritize deals, and manage sales follow-ups." : "Preview warm luxury, cool clarity, and high-CRI scenes using live product specs."}
      currentScreen="lighting"
      showBack
    >
      {role !== "admin" ? (
        // CUSTOMER/DESIGNER VIEW: Live visualizer tuning
        <>
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

          <SectionTitle title="Request project quote" description="Lock down these light specifications to receive bulk pricing." />
          <Card>
            <Text style={{ color: palette.muted, marginBottom: 8, lineHeight: 20 }}>
              Save your current specs (Kelvin: {scene.kelvin}K, CRI: {scene.cri}, UGR: {scene.ugr}) to the shared leads console.
            </Text>
            <AppButton 
              label="Initiate Quote Request" 
              icon="plus-circle" 
              onPress={() => {
                setLeadForm((prev) => ({
                  ...prev,
                  room_type: leadForm.room_type || "living_room"
                }));
                setWizardVisible(true);
              }} 
            />
          </Card>
        </>
      ) : (
        // ADMIN/SALES VIEW: B2B pipeline dashboard
        <>
          {stats.slaBreachedCount > 0 ? (
            <Notice 
              message={`🔔 Action Required: ${stats.slaBreachedCount} leads have breached the 72h SLA period in Quoted status.`} 
              tone="error" 
            />
          ) : null}

          {stats.hotLeadsCount > 0 ? (
            <Notice 
              message={`🔥 Pipeline alert: ${stats.hotLeadsCount} high-value deals are highly active in the field.`} 
              tone="success" 
            />
          ) : null}

          <SectionTitle 
            title="Leads Pipeline" 
            description="Manage site quotes, monitor sample dispatching, and track project status." 
            action={
              <Pressable style={styles.addButton} onPress={() => setWizardVisible(true)}>
                <Feather name="plus" size={16} color="#fff" />
                <Text style={styles.addButtonText}>Add Lead</Text>
              </Pressable>
            }
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
            <View style={styles.tabContainer}>
              <Chip label="All Leads" active={pipelineTab === "all"} onPress={() => setPipelineTab("all")} />
              <Chip label="Active" active={pipelineTab === "active"} onPress={() => setPipelineTab("active")} />
              <Chip label="New" active={pipelineTab === "new"} onPress={() => setPipelineTab("new")} />
              <Chip label="Quoted" active={pipelineTab === "quoted"} onPress={() => setPipelineTab("quoted")} />
              <Chip label="Samples" active={pipelineTab === "sample_dispatched"} onPress={() => setPipelineTab("sample_dispatched")} />
              <Chip label="Won" active={pipelineTab === "won"} onPress={() => setPipelineTab("won")} />
              <Chip label="Lost" active={pipelineTab === "lost"} onPress={() => setPipelineTab("lost")} />
            </View>
          </ScrollView>

          <QueryState
            loading={leads.loading}
            error={leads.error}
            hasData={filteredLeads.length > 0}
            empty="No leads found matching this stage."
          >
            {filteredLeads.map((lead: any) => {
              const dealValue = lead.configuration?.dealValue ?? 10000;
              const quantities = lead.configuration?.quantities ?? 10;
              const location = lead.configuration?.project_location ?? "Not specified";
              const businessType = lead.configuration?.business_type ?? "Residential";
              
              const createdAt = new Date(lead.created_at);
              const daysOld = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
              const isSlaBreached = (lead.status === "quoted" || lead.status === "sample_dispatched") && daysOld >= 3;
              
              const hotnessScore = dealValue - (daysOld * 150);
              const isHot = hotnessScore > 8000 && lead.status !== "won" && lead.status !== "lost";

              const kelvin = lead.configuration?.kelvin ?? 3000;
              const cri = lead.configuration?.cri ?? 90;
              const ugr = lead.configuration?.ugr ?? 19;

              const ugrInfo = getUgrLabel(ugr);
              const criInfo = getCriBadge(cri);

              return (
                <Card key={lead.id} tone={isHot ? "brand" : "default"}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        {isHot ? <Text style={styles.hotBadge}>🔥 HOT</Text> : null}
                        {isSlaBreached ? <Text style={styles.slaBadge}>⚠️ Overdue</Text> : null}
                        <Text style={styles.leadCustomerName}>{lead.contact_name}</Text>
                      </View>
                      <Text style={styles.leadLocation}>{businessType} • {location}</Text>
                    </View>
                    <View style={styles.priceContainer}>
                      <Text style={styles.dealValue}>₹{dealValue.toLocaleString()}</Text>
                      <Text style={styles.qtyLabel}>{quantities} pcs</Text>
                    </View>
                  </View>

                  {/* Spec Profile Grid */}
                  <View style={styles.specProfileGrid}>
                    <View style={[styles.specGridPill, { backgroundColor: getKelvinColor(kelvin) + "22", borderColor: getKelvinColor(kelvin) }]}>
                      <Text style={[styles.specGridLabel, { color: palette.ink }]}>{kelvin}K Temp</Text>
                    </View>
                    <View style={[styles.specGridPill, { backgroundColor: palette.surfaceSoft, borderColor: criInfo.color }]}>
                      <Text style={[styles.specGridLabel, { color: criInfo.color }]}>{criInfo.label}</Text>
                    </View>
                    <View style={[styles.specGridPill, { backgroundColor: ugrInfo.bg, borderColor: ugrInfo.color }]}>
                      <Text style={[styles.specGridLabel, { color: ugrInfo.color }]}>{ugrInfo.text}</Text>
                    </View>
                  </View>

                  {/* Footnotes & Activity logs */}
                  <View style={styles.leadActivityRow}>
                    <Text style={styles.activityTime}>
                      Logged {daysOld === 0 ? "today" : daysOld === 1 ? "yesterday" : `${daysOld} days ago`}
                    </Text>
                    <Pressable 
                      style={[styles.statusPill, (styles as Record<string, any>)[`status_${lead.status}`]]}
                      onPress={() => {
                        setActiveLeadForStatus(lead);
                        setStatusSheetVisible(true);
                      }}
                    >
                      <Text style={styles.statusPillText}>
                        {lead.status.toUpperCase().replace("_", " ")}
                      </Text>
                      <Feather name="chevron-down" size={12} color="#fff" />
                    </Pressable>
                  </View>
                </Card>
              );
            })}
          </QueryState>
        </>
      )}

      {/* NEW LEAD WIZARD MODAL */}
      <Modal
        visible={wizardVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setWizardVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {role === "admin" ? "Register Technical Lead" : "Submit Quote Request"}
              </Text>
              <Pressable style={styles.modalCloseBtn} onPress={() => setWizardVisible(false)}>
                <Feather name="x" size={20} color={palette.ink} />
              </Pressable>
            </View>

            {/* Steps indicator */}
            <View style={styles.wizardStepsHeader}>
              <View style={[styles.stepDot, wizardStep >= 1 && styles.stepDotActive]} />
              <View style={[styles.stepLine, wizardStep >= 2 && styles.stepLineActive]} />
              <View style={[styles.stepDot, wizardStep >= 2 && styles.stepDotActive]} />
              <View style={[styles.stepLine, wizardStep >= 3 && styles.stepLineActive]} />
              <View style={[styles.stepDot, wizardStep >= 3 && styles.stepDotActive]} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, marginVertical: 12 }}>
              {/* STEP 1: Metadata */}
              {wizardStep === 1 ? (
                <View style={styles.stepContainer}>
                  <Text style={styles.stepTitle}>Client & Location Context</Text>
                  <Field 
                    label="Client Name" 
                    value={leadForm.contact_name} 
                    onChangeText={(val) => setLeadForm((p) => ({ ...p, contact_name: val }))} 
                    placeholder="Enter client or project name" 
                  />
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Field 
                        label="Phone Number" 
                        value={leadForm.contact_phone} 
                        onChangeText={(val) => setLeadForm((p) => ({ ...p, contact_phone: val }))} 
                        placeholder="+91..." 
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field 
                        label="Email Address" 
                        value={leadForm.contact_email} 
                        onChangeText={(val) => setLeadForm((p) => ({ ...p, contact_email: val }))} 
                        placeholder="you@domain.com" 
                      />
                    </View>
                  </View>
                  <Field 
                    label="Project Address / Location" 
                    value={leadForm.project_location} 
                    onChangeText={(val) => setLeadForm((p) => ({ ...p, project_location: val }))} 
                    placeholder="e.g. Okhla Phase 3, Delhi" 
                  />
                  <Text style={styles.fieldLabelLocal}>Project Sector</Text>
                  <View style={styles.businessTypeRow}>
                    {["Residential", "Commercial", "Hospitality", "Retail"].map((type) => (
                      <Pressable 
                        key={type} 
                        style={[styles.sectorBtn, leadForm.business_type === type && styles.sectorBtnActive]}
                        onPress={() => setLeadForm((p) => ({ ...p, business_type: type }))}
                      >
                        <Text style={[styles.sectorBtnText, leadForm.business_type === type && styles.sectorBtnTextActive]}>
                          {type}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* STEP 2: Spec Scanner / OCR Ingestion */}
              {wizardStep === 2 ? (
                <View style={styles.stepContainer}>
                  <Text style={styles.stepTitle}>Camera Specs Scanner</Text>
                  <Text style={{ color: palette.muted, marginBottom: 16, lineHeight: 20 }}>
                    Avoid manual data entry. Snapshot a lighting blueprint table, layout design, or datasheet to extract Kelvin, CRI, quantities, and lumens directly using Gemini Cloud OCR.
                  </Text>

                  {ocrScanning ? (
                    <View style={styles.scannerWrapper}>
                      <Feather name="file-text" size={60} color={palette.brand} style={{ opacity: 0.6 }} />
                      <Animated.View style={[
                        styles.scannerBar,
                        {
                          transform: [{
                            translateY: scanAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, 160]
                            })
                          }]
                        }
                      ]} />
                      <Text style={styles.scannerText}>Analyzing document layout with Gemini Flash...</Text>
                    </View>
                  ) : (
                    <View style={styles.scannerPrompt}>
                      <Pressable style={styles.scannerButton} onPress={triggerMockOCR}>
                        <Feather name="camera" size={32} color={palette.brand} />
                        <Text style={styles.scannerBtnText}>Scan Specs Document</Text>
                        <Text style={styles.scannerBtnSub}>Intake image to auto-populate specifications</Text>
                      </Pressable>
                    </View>
                  )}

                  <Notice message="💡 Tip: You can skip this step and tune parameters manually in the next step." tone="default" />
                </View>
              ) : null}

              {/* STEP 3: Manual Tuning & Review */}
              {wizardStep === 3 ? (
                <View style={styles.stepContainer}>
                  <Text style={styles.stepTitle}>Review Technical Specifications</Text>

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Field 
                        label="Project Value (₹)" 
                        value={leadForm.dealValue} 
                        onChangeText={(val) => setLeadForm((p) => ({ ...p, dealValue: val }))} 
                        placeholder="Deal Value" 
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field 
                        label="Fittings Quantity" 
                        value={leadForm.quantities} 
                        onChangeText={(val) => setLeadForm((p) => ({ ...p, quantities: val }))} 
                        placeholder="Quantity" 
                      />
                    </View>
                  </View>

                  <StepSlider label={`Kelvin: ${kelvinValue}K`} values={kelvinSteps} value={kelvinValue} onChange={setKelvinValue} />
                  <StepSlider label={`CRI: ${criValue}`} values={criSteps} value={criValue} onChange={setCriValue} />
                  
                  <View style={styles.previewSpecBadgeRow}>
                    <View style={styles.previewSpecBadge}>
                      <Text style={styles.specBadgeLabel}>UGR Comfort</Text>
                      <Text style={styles.specBadgeVal}>{scene.ugr}</Text>
                    </View>
                    <View style={styles.previewSpecBadge}>
                      <Text style={styles.specBadgeLabel}>Fittings Lumens</Text>
                      <Text style={styles.specBadgeVal}>{scene.lumens} lm</Text>
                    </View>
                  </View>

                  <Field 
                    label="Custom Notes / Brand Preferences" 
                    value={leadForm.notes} 
                    onChangeText={(val) => setLeadForm((p) => ({ ...p, notes: val }))} 
                    placeholder="e.g. Requires dimmable driver fittings..." 
                    multiline 
                  />
                </View>
              ) : null}
            </ScrollView>

            {/* Footer Buttons */}
            <View style={styles.wizardFooter}>
              {wizardStep > 1 ? (
                <View style={{ flex: 1 }}>
                  <AppButton 
                    label="Back" 
                    kind="secondary" 
                    onPress={() => setWizardStep((s) => s - 1)} 
                  />
                </View>
              ) : null}

              <View style={{ flex: 2 }}>
                {wizardStep < 3 ? (
                  <AppButton 
                    label="Continue" 
                    onPress={() => setWizardStep((s) => s + 1)} 
                    disabled={wizardStep === 1 && !leadForm.contact_name}
                  />
                ) : (
                  <AppButton 
                    label={mutation.loading ? "Submitting..." : "Submit Project Lead"} 
                    onPress={() => void submitLead()} 
                    disabled={mutation.loading}
                  />
                )}
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* PIPELINE STATUS TRANSITION BOTTOM SHEET */}
      <BottomActionSheet
        visible={statusSheetVisible && !!activeLeadForStatus}
        onClose={() => setStatusSheetVisible(false)}
        title={`Change Lead Status`}
      >
        {activeLeadForStatus ? (
          <View style={styles.statusSheetBody}>
            <Text style={styles.sheetLeadInfo}>
              Client: {activeLeadForStatus.contact_name} • Value: ₹{(activeLeadForStatus.configuration?.dealValue ?? 10000).toLocaleString()}
            </Text>
            
            <View style={styles.statusOptionsList}>
              {[
                { key: "new", label: "New Lead", icon: "plus-circle" },
                { key: "contacted", label: "Contacted", icon: "phone-call" },
                { key: "quoted", label: "Quote Dispatched", icon: "file-text" },
                { key: "sample_dispatched", label: "Sample Sent", icon: "package" },
              ].map((opt) => {
                const active = activeLeadForStatus.status === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    style={[styles.statusOptionRow, active && styles.statusOptionRowActive]}
                    onPress={() => void updateStatus(activeLeadForStatus.id, opt.key)}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Feather name={opt.icon as any} size={16} color={active ? palette.brand : palette.muted} />
                      <Text style={[styles.statusOptionText, active && styles.statusOptionTextActive]}>
                        {opt.label}
                      </Text>
                    </View>
                    {active ? <Feather name="check" size={16} color={palette.brand} /> : null}
                  </Pressable>
                );
              })}
            </View>

            {/* Won / Lost Satisfying slide transition gestures */}
            <View style={{ marginTop: 14, gap: 12 }}>
              {activeLeadForStatus.status !== "won" ? (
                <SlideToConfirm 
                  label="Slide Right to confirm WON" 
                  color={palette.success}
                  onConfirm={() => void updateStatus(activeLeadForStatus.id, "won")} 
                />
              ) : null}

              {activeLeadForStatus.status !== "lost" ? (
                <SlideToConfirm 
                  label="Slide Right to mark LOST" 
                  color={palette.danger}
                  onConfirm={() => void updateStatus(activeLeadForStatus.id, "lost")} 
                />
              ) : null}
            </View>
          </View>
        ) : null}
      </BottomActionSheet>

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
    fontWeight: "800",
  },
  sliderRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sliderStep: {
    borderWidth: 1.5,
    borderColor: palette.lineStrong,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: palette.surface,
  },
  sliderStepActive: {
    borderColor: palette.brand,
    backgroundColor: palette.brand,
  },
  sliderStepText: {
    color: palette.ink,
    fontWeight: "800",
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
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: palette.brand,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  addButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },
  tabScroll: {
    marginVertical: 4,
  },
  tabContainer: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 4,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  hotBadge: {
    color: "#fff",
    backgroundColor: "#b45309",
    fontWeight: "900",
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
  },
  slaBadge: {
    color: "#fff",
    backgroundColor: palette.danger,
    fontWeight: "900",
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
  },
  leadCustomerName: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "800",
  },
  leadLocation: {
    color: palette.muted,
    fontSize: 13,
    marginTop: 4,
  },
  priceContainer: {
    alignItems: "flex-end",
  },
  dealValue: {
    color: palette.brand,
    fontSize: 17,
    fontWeight: "900",
  },
  qtyLabel: {
    color: palette.muted,
    fontSize: 12,
    marginTop: 2,
    fontWeight: "700",
  },
  specProfileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 10,
  },
  specGridPill: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  specGridLabel: {
    fontSize: 11,
    fontWeight: "800",
  },
  leadActivityRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingTop: 12,
    marginTop: 4,
  },
  activityTime: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statusPillText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  status_new: { backgroundColor: "#6b7280" }, // Gray
  status_contacted: { backgroundColor: "#3b82f6" }, // Blue
  status_quoted: { backgroundColor: "#f59e0b" }, // Orange/Yellow
  status_sample_dispatched: { backgroundColor: "#8b5cf6" }, // Purple
  status_won: { backgroundColor: "#10b981" }, // Green
  status_lost: { backgroundColor: "#ef4444" }, // Red
  
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: palette.bg,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    height: "85%",
    padding: 20,
    borderWidth: 1,
    borderColor: palette.line,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: palette.ink,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.line,
  },
  wizardStepsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 14,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: palette.lineStrong,
  },
  stepDotActive: {
    backgroundColor: palette.brand,
  },
  stepLine: {
    width: 50,
    height: 3,
    backgroundColor: palette.line,
  },
  stepLineActive: {
    backgroundColor: palette.brand,
  },
  stepContainer: {
    gap: 12,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: palette.ink,
    marginBottom: 6,
  },
  fieldLabelLocal: {
    fontWeight: "800",
    color: palette.ink,
    marginTop: 6,
  },
  businessTypeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  sectorBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: palette.lineStrong,
    backgroundColor: palette.surfaceSoft,
  },
  sectorBtnActive: {
    borderColor: palette.brand,
    backgroundColor: palette.brandSoft,
  },
  sectorBtnText: {
    color: palette.ink,
    fontWeight: "800",
    fontSize: 12,
  },
  sectorBtnTextActive: {
    color: palette.brandDeep,
  },
  scannerPrompt: {
    borderWidth: 2,
    borderColor: palette.lineStrong,
    borderStyle: "dashed",
    borderRadius: 22,
    padding: 30,
    backgroundColor: palette.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  scannerButton: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  scannerBtnText: {
    fontWeight: "800",
    fontSize: 16,
    color: palette.brand,
  },
  scannerBtnSub: {
    fontSize: 12,
    color: palette.muted,
    textAlign: "center",
  },
  scannerWrapper: {
    height: 200,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#151822",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  scannerBar: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    height: 4,
    backgroundColor: "#4f46e5",
    borderRadius: 99,
    shadowColor: "#4f46e5",
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  scannerText: {
    color: "rgba(255,255,255,0.7)",
    marginTop: 18,
    fontWeight: "700",
    fontSize: 13,
  },
  previewSpecBadgeRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  previewSpecBadge: {
    flex: 1,
    backgroundColor: palette.surfaceSoft,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 14,
    padding: 10,
    alignItems: "center",
  },
  specBadgeLabel: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  specBadgeVal: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 2,
  },
  wizardFooter: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingTop: 16,
  },
  statusSheetBody: {
    gap: 14,
  },
  sheetLeadInfo: {
    color: palette.muted,
    fontWeight: "700",
    fontSize: 13,
  },
  statusOptionsList: {
    gap: 8,
  },
  statusOptionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceSoft,
  },
  statusOptionRowActive: {
    borderColor: palette.brand,
    backgroundColor: palette.brandSoft,
  },
  statusOptionText: {
    color: palette.ink,
    fontWeight: "800",
    fontSize: 13,
  },
  statusOptionTextActive: {
    color: palette.brandDeep,
  },
});
