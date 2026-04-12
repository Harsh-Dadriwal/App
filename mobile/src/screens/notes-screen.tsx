import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useMutationAction, useRows } from "@/components/app-state";
import { AppButton, Card, Chip, Field, Notice, QueryState, ScreenShell, SectionTitle } from "@/components/ui";
import { useAuth } from "@/providers/auth-provider";
import { supabase } from "@/lib/supabase";

const recipientOptions = ["admin", "customer", "architect", "electrician"];

export function NotesScreen() {
  const { profile } = useAuth();
  const mutation = useMutationAction();
  const [siteId, setSiteId] = useState("");
  const [recipientRole, setRecipientRole] = useState(profile?.role === "admin" ? "customer" : "admin");
  const [noteText, setNoteText] = useState("");

  const sites = useRows(async (client) => {
    if (!profile?.id) {
      return { data: [] as any[], error: null };
    }
    if (profile.role === "customer") {
      const { data, error } = await client.from("sites").select("id, site_name").eq("customer_id", profile.id);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    }
    const { data, error } = await client.from("sites").select("id, site_name").order("site_name");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, [profile?.id, profile?.role]);

  const notes = useRows(async (client) => {
    const { data, error } = await client.from("vw_site_notes_enriched").select("*").order("created_at", { ascending: false }).limit(30);
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, [profile?.id]);

  async function sendNote() {
    if (!supabase || !profile?.id || !siteId || !noteText.trim()) return;
    const client = supabase;
    const ok = await mutation.run(
      async () =>
        client.from("site_notes").insert({
          site_id: siteId,
          sender_user_id: profile.id,
          recipient_role: recipientRole,
          note_text: noteText
        }),
      "Note sent."
    );
    if (ok) {
      setNoteText("");
      notes.refetch();
    }
  }

  return (
    <ScreenShell
      title="Project notes"
      subtitle="Keep all site conversations synced across mobile and web."
      currentScreen="notes"
      showBack
    >
      <Card tone="brand">
        <SectionTitle title="Send note" />
        <Text style={{ fontWeight: "800", marginBottom: 6 }}>Choose site</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {sites.data.map((site: any) => (
              <Chip
                key={site.id}
                label={site.site_name}
                active={siteId === site.id}
                onPress={() => setSiteId(site.id)}
              />
            ))}
          </View>
        </ScrollView>
        {!sites.data.length ? (
          <Field
            label="Site ID"
            value={siteId}
            onChangeText={setSiteId}
            placeholder="Paste or type site id"
          />
        ) : null}
        <Text style={{ fontWeight: "800", marginBottom: 6, marginTop: 4 }}>Send to</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {recipientOptions.map((option) => (
            <Chip
              key={option}
              label={option}
              active={recipientRole === option}
              onPress={() => setRecipientRole(option)}
            />
          ))}
        </View>
        <Field label="Note" value={noteText} onChangeText={setNoteText} multiline />
        <AppButton label={mutation.loading ? "Sending..." : "Send note"} icon="send" onPress={() => void sendNote()} disabled={mutation.loading} />
      </Card>

      {mutation.success ? <Notice message={mutation.success} tone="success" /> : null}
      {mutation.error ? <Notice message={mutation.error} tone="error" /> : null}

      <SectionTitle title="Recent notes" />
      <QueryState loading={notes.loading} error={notes.error} hasData={notes.data.length > 0} empty="No notes yet.">
        {notes.data.map((note: any) => (
          <Card key={note.id} tone="soft">
            <Text style={{ fontSize: 17, fontWeight: "700" }}>{note.site_name}</Text>
            <Text style={{ marginTop: 6 }}>{note.sender_name} → {note.recipient_name ?? note.recipient_role ?? "All"}</Text>
            <Text style={{ marginTop: 8, lineHeight: 22 }}>{note.note_text}</Text>
          </Card>
        ))}
      </QueryState>
    </ScreenShell>
  );
}
