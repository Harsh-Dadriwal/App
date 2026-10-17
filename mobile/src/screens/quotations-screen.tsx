import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useMemo, useState } from "react";
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AppButton, Chip, Field, Notice, QueryState, ScreenShell } from "@/components/ui";
import { useMutationAction, useRows } from "@/components/app-state";
import { palette, radii, shadow } from "@/lib/theme";
import { useAuth } from "@/providers/auth-provider";
import { useMobileNavigation } from "@/providers/navigation-provider";
import { acceptQuotation, closeQuotation, createQuotation, getPriceCatalog, listQuotations, uploadQuotationPhoto } from "@/lib/backend/shop-gateway";
import { formatPriceListAmount } from "@mahalaxmi/core/gateway/inventory-gateway";
import {
  MAX_QUOTATION_PHOTOS,
  QUOTATION_STATUS_LABELS,
  filterCatalog,
  indexCatalog,
  type Quotation,
  type QuotationList,
  type QuotationStatus
} from "@mahalaxmi/core/gateway/shop-gateway";
import { useCart, useCatalog } from "@mahalaxmi/core/hooks/shop-store";

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const WEB_APP_URL = (process.env.EXPO_PUBLIC_WEB_APP_URL || "https://app-rho-one-49.vercel.app").replace(/\/$/, "");

type PickedItem = { key: string; name: string; category: string; brand: string | null; quantity: number };

function statusColors(quotation: Quotation) {
  if (quotation.expired || quotation.status === "declined" || quotation.status === "cancelled") return { color: palette.danger, backgroundColor: palette.dangerSoft };
  if (quotation.status === "accepted") return { color: palette.success, backgroundColor: palette.successSoft };
  if (quotation.status === "quoted") return { color: palette.teal, backgroundColor: palette.tealSoft };
  return { color: palette.brandDeep, backgroundColor: palette.brandSoft };
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function QuotationCard({ quotation, canManage, onChanged }: { quotation: Quotation; canManage: boolean; onChanged: () => void }) {
  const { navigate } = useMobileNavigation();
  const action = useMutationAction();
  const [address, setAddress] = useState("");
  const priced = quotation.total !== undefined;

  async function run(task: () => Promise<{ error: string | null }>, done: string) {
    const ok = await action.run(task);
    if (ok) {
      Alert.alert(done);
      onChanged();
    }
  }

  function confirmClose() {
    const owner = !canManage;
    Alert.alert(owner ? (quotation.status === "quoted" ? "Decline this quotation?" : "Withdraw this request?") : "Close this request?", quotation.quotation_number, [
      { text: "Keep", style: "cancel" },
      { text: owner && quotation.status === "quoted" ? "Decline" : "Close", style: "destructive", onPress: () => void run(() => closeQuotation(quotation.id), "Done") }
    ]);
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.number}>{quotation.quotation_number}</Text>
          <Text style={styles.muted}>{new Date(quotation.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</Text>
        </View>
        <Text style={[styles.pill, statusColors(quotation)]}>{quotation.expired ? "Expired" : QUOTATION_STATUS_LABELS[quotation.status]}</Text>
      </View>

      {canManage && quotation.customer ? (
        <View>
          <Text style={styles.strong}>
            {quotation.customer.full_name}
            {quotation.customer.role && quotation.customer.role !== "customer" ? ` · ${quotation.customer.role}` : ""}
          </Text>
          {quotation.contact_phone || quotation.customer.phone ? <Text style={styles.link}>{quotation.contact_phone || quotation.customer.phone}</Text> : null}
        </View>
      ) : null}

      {quotation.photo_urls.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {quotation.photo_urls.map((url) => (
            <Pressable key={url} onPress={() => void Linking.openURL(url)} accessibilityRole="imagebutton" accessibilityLabel="Open photo">
              <Image source={{ uri: url }} style={styles.photo} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {quotation.note ? <Text style={styles.muted}>{canManage ? "Note" : "You wrote"}: {quotation.note}</Text> : null}
      {quotation.status === "requested" && !canManage ? <Text style={styles.muted}>The shop is preparing prices. You will get a notification when it is ready.</Text> : null}

      {quotation.items.map((item, index) => (
        <View key={`${item.key}-${index}`} style={styles.line}>
          <Text style={styles.lineName}>{item.name}</Text>
          <Text style={styles.lineQty}>
            × {item.quantity.toLocaleString("en-IN")}
            {priced && item.unit_price !== undefined ? ` @ ${formatPriceListAmount(item.unit_price)}` : ""}
          </Text>
        </View>
      ))}
      {priced ? (
        <View style={styles.totals}>
          <Text style={styles.muted}>Subtotal {formatPriceListAmount(quotation.subtotal ?? 0)}</Text>
          {quotation.discount_amount ? <Text style={styles.muted}>Discount − {formatPriceListAmount(quotation.discount_amount)}</Text> : null}
          <Text style={styles.total}>Total {formatPriceListAmount(quotation.total ?? 0)}</Text>
        </View>
      ) : null}
      {quotation.admin_note ? <Text style={styles.muted}>Shop: {quotation.admin_note}</Text> : null}
      {quotation.status === "quoted" && quotation.valid_until ? (
        <Text style={styles.muted}>{quotation.expired ? "Expired on" : "Valid until"} {formatDate(quotation.valid_until)}</Text>
      ) : null}
      {action.error ? <Notice message={action.error} tone="error" /> : null}

      {!canManage && quotation.status === "quoted" && !quotation.expired ? (
        <>
          <TextInput value={address} onChangeText={setAddress} placeholder="Delivery address" placeholderTextColor={palette.muted} style={styles.input} multiline />
          <AppButton
            label="Accept & order"
            icon="check"
            loading={action.loading}
            disabled={address.trim().length < 5}
            onPress={() => void run(() => acceptQuotation(quotation.id, { delivery_address: address.trim() }), "Accepted. Your order has been placed.")}
          />
        </>
      ) : null}
      {(quotation.status === "requested" || quotation.status === "quoted") && !action.loading ? (
        <Pressable onPress={confirmClose} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.link, { color: palette.danger }]}>
            {canManage ? "Close request" : quotation.status === "quoted" ? "Decline" : "Withdraw request"}
          </Text>
        </Pressable>
      ) : null}
      {quotation.status === "accepted" && !canManage ? (
        <Pressable onPress={() => navigate("orders")} hitSlop={8} accessibilityRole="button">
          <Text style={styles.link}>Track the order →</Text>
        </Pressable>
      ) : null}
      {canManage && (quotation.status === "requested" || quotation.status === "quoted") ? (
        <Pressable onPress={() => void Linking.openURL(`${WEB_APP_URL}/admin/quotations`)} hitSlop={8} accessibilityRole="link">
          <Text style={styles.link}>{quotation.status === "requested" ? "Prepare prices on the website →" : "Edit on the website →"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function RequestForm({ onSent }: { onSent: () => void }) {
  const { profile } = useAuth();
  const cart = useCart();
  const catalog = useCatalog(getPriceCatalog);
  const submit = useMutationAction();
  const [photos, setPhotos] = useState<Array<{ key: string; uri: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickedItem[]>([]);
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState(profile?.phone?.replace(/^\+91/, "") ?? "");
  const items = useMemo(() => indexCatalog(catalog.data?.items ?? []), [catalog.data]);
  const matches = useMemo(() => (query.trim() ? filterCatalog(items, { query, category: null, brand: null, inStockOnly: false }).slice(0, 6) : []), [items, query]);

  async function addPhotos(fromCamera: boolean) {
    setUploadError(null);
    const permission = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : { granted: true };
    if (!permission.granted) {
      setUploadError("Allow camera access in your phone settings to take a photo.");
      return;
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["images"],
      quality: 0.6,
      allowsMultipleSelection: !fromCamera,
      selectionLimit: MAX_QUOTATION_PHOTOS - photos.length
    };
    const result = fromCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;

    setUploading(true);
    try {
      for (const asset of result.assets.slice(0, MAX_QUOTATION_PHOTOS - photos.length)) {
        if (asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES) {
          setUploadError("One photo is larger than 4 MB. Please crop it or take it again.");
          continue;
        }
        const form = new FormData();
        form.append("file", { uri: asset.uri, name: asset.fileName ?? "requirement.jpg", type: asset.mimeType ?? "image/jpeg" } as unknown as Blob);
        const uploaded = await uploadQuotationPhoto(form);
        if (uploaded.error || !uploaded.data) {
          setUploadError(uploaded.error ?? "The photo could not be uploaded.");
          break;
        }
        setPhotos((current) => [...current, { key: uploaded.data!.key, uri: asset.uri }]);
      }
    } finally {
      setUploading(false);
    }
  }

  async function send() {
    const ok = await submit.run(() =>
      createQuotation({
        items: picked.map((item) => ({ key: item.key, quantity: item.quantity })),
        photo_keys: photos.map((photo) => photo.key),
        note: note.trim() || undefined,
        contact_phone: phone.trim() || undefined
      })
    );
    if (ok) {
      setPhotos([]);
      setPicked([]);
      setNote("");
      Alert.alert("Quotation requested", "The shop will send you prices. You will get a notification when it is ready.");
      onSent();
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.number}>Ask for a quotation</Text>
      <Text style={styles.muted}>Photograph your handwritten list or pick products — wires, switches, MCBs, fans, lights, anything in the store.</Text>

      <View style={styles.photoRow}>
        {photos.map((photo) => (
          <View key={photo.key}>
            <Image source={{ uri: photo.uri }} style={styles.photo} />
            <Pressable style={styles.removePhoto} onPress={() => setPhotos(photos.filter((item) => item.key !== photo.key))} accessibilityLabel="Remove photo" hitSlop={6}>
              <Feather name="x" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
      </View>
      {photos.length < MAX_QUOTATION_PHOTOS ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <AppButton label="Take photo" icon="camera" kind="secondary" loading={uploading} onPress={() => void addPhotos(true)} />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton label="From gallery" icon="image" kind="secondary" disabled={uploading} onPress={() => void addPhotos(false)} />
          </View>
        </View>
      ) : null}
      {uploadError ? <Notice message={uploadError} tone="error" /> : null}

      {cart.count > 0 && !picked.length ? (
        <Pressable onPress={() => setPicked(cart.lines.map((line) => ({ ...line })))} hitSlop={8}>
          <Text style={styles.link}>Add the {cart.count} item{cart.count === 1 ? "" : "s"} in your cart</Text>
        </Pressable>
      ) : null}
      <Field label="Add products" value={query} onChangeText={setQuery} placeholder="Search wires, switches, MCBs…" icon="search" autoCapitalize="none" />
      {matches.map((item) => {
        const added = picked.some((line) => line.key === item.key);
        return (
          <Pressable
            key={item.key}
            style={styles.match}
            disabled={added}
            onPress={() => {
              setPicked([...picked, { key: item.key, name: item.name, category: item.category, brand: item.brand, quantity: 1 }]);
              setQuery("");
            }}
          >
            <Text style={{ flex: 1, color: palette.ink }}>{item.name}</Text>
            <Text style={styles.link}>{added ? "Added" : "Add"}</Text>
          </Pressable>
        );
      })}
      {picked.map((line) => (
        <View key={line.key} style={styles.line}>
          <Text style={styles.lineName}>{line.name}</Text>
          <TextInput
            value={String(line.quantity)}
            onChangeText={(text) => {
              const quantity = Number(text.replace(/\D/g, "")) || 0;
              setPicked(quantity ? picked.map((item) => (item.key === line.key ? { ...item, quantity } : item)) : picked.filter((item) => item.key !== line.key));
            }}
            keyboardType="number-pad"
            style={styles.qty}
            accessibilityLabel={`Quantity of ${line.name}`}
          />
        </View>
      ))}

      <Field label="Note for the shop (optional)" value={note} onChangeText={setNote} placeholder="e.g. 3BHK full wiring, Havells preferred" multiline />
      <Field label="Contact number" value={phone} onChangeText={setPhone} placeholder="10-digit mobile number" keyboardType="phone-pad" icon="phone" />
      {submit.error ? <Notice message={submit.error} tone="error" /> : null}
      <AppButton
        label={submit.loading ? "Sending..." : "Request quotation"}
        icon="send"
        loading={submit.loading}
        disabled={uploading || (!picked.length && !photos.length && !note.trim())}
        onPress={() => void send()}
      />
    </View>
  );
}

const ADMIN_FILTERS: Array<{ id: string; label: string; statuses: QuotationStatus[] }> = [
  { id: "new", label: "New", statuses: ["requested"] },
  { id: "sent", label: "Sent", statuses: ["quoted"] },
  { id: "accepted", label: "Accepted", statuses: ["accepted"] },
  { id: "closed", label: "Closed", statuses: ["declined", "cancelled"] }
];

export function QuotationsScreen() {
  const [filter, setFilter] = useState("new");
  const quotations = useRows<QuotationList>(async () => {
    const result = await listQuotations();
    return { data: result.data ? [result.data] : [], error: result.error };
  }, []);
  const canManage = quotations.data[0]?.canManage ?? false;
  const all = quotations.data[0]?.quotations ?? [];
  const statuses = ADMIN_FILTERS.find((option) => option.id === filter)?.statuses ?? [];
  const list = canManage ? all.filter((quotation) => statuses.includes(quotation.status)) : all;

  return (
    <ScreenShell
      title="Quotations"
      subtitle={canManage ? "Requests waiting for prices" : "Send your list, get prices from the shop"}
      currentScreen="quotations"
    >
      {canManage ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {ADMIN_FILTERS.map((option) => {
            const count = all.filter((quotation) => option.statuses.includes(quotation.status)).length;
            return <Chip key={option.id} label={`${option.label}${count ? ` ${count}` : ""}`} active={filter === option.id} onPress={() => setFilter(option.id)} />;
          })}
        </ScrollView>
      ) : (
        <RequestForm onSent={() => quotations.refetch?.()} />
      )}
      <QueryState
        loading={quotations.loading}
        error={quotations.error}
        hasData={list.length > 0}
        empty={canManage ? "No quotations with this status." : "Your quotation requests and the prices the shop sends appear here."}
      >
        {list.map((quotation) => (
          <QuotationCard key={quotation.id} quotation={quotation} canManage={canManage} onChanged={() => quotations.refetch?.()} />
        ))}
      </QueryState>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 16,
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.line,
    ...shadow
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  number: { fontSize: 16, fontWeight: "900", color: palette.ink },
  strong: { fontSize: 14.5, fontWeight: "800", color: palette.ink },
  muted: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  link: { color: palette.brand, fontWeight: "800" },
  pill: { overflow: "hidden", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontSize: 12, fontWeight: "800" },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photo: { width: 84, height: 84, borderRadius: radii.sm, backgroundColor: palette.surfaceSoft },
  removePhoto: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.6)" },
  line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  lineName: { flex: 1, color: palette.ink, fontSize: 14 },
  lineQty: { fontWeight: "800", color: palette.ink, fontSize: 14 },
  qty: { minWidth: 56, height: 38, paddingHorizontal: 8, textAlign: "center", borderRadius: radii.sm, borderWidth: 1, borderColor: palette.line, color: palette.ink, fontWeight: "800" },
  match: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  totals: { alignItems: "flex-end", gap: 2, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.lineStrong },
  total: { fontSize: 18, fontWeight: "900", color: palette.ink },
  input: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.sm, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surfaceSoft, color: palette.ink }
});
