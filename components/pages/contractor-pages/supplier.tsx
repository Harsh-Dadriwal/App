"use client";

import { useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  CardGrid,
  DataCard,
  DataTable,
  FormNotice,
  PageSection,
  QueryState,
  StatsGrid,
  useMutationAction,
  useRows
} from "@/components/data-view";
import { getSupabaseBrowserClient } from "@mahalaxmi/core/supabase/client";
import { markOrderItemSupplied } from "@/lib/backend/modules/workflow-gateway";
export function SupplierFulfillmentQueue() {
  const { profile, activeTenant } = useAuth();
  const tenantId = activeTenant?.id ?? "";
  const mutation = useMutationAction();

  const orders = useRows(
    async (client) => {
      const { data, error } = await client
        .from("order_items")
        .select("*, site_orders!inner(order_number), products!inner(item_name, sku, unit, mrp)")
        .in("status", ["approved_pending_shop_confirmation", "approved_pending_supply"])
        .order("created_at", { ascending: true });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [tenantId],
    { realtimeTable: "order_items" }
  );

  async function markSupplied(orderItemId: string, requiredQty: number) {
    if (!profile) return;

    const ok = await mutation.run(
      async () =>
        markOrderItemSupplied({
          target_order_item_id: orderItemId,
          supplied_qty: requiredQty,
          note_text: "Supplied by supplier portal"
        }),
      "Item marked as supplied successfully."
    );

    if (ok) {
      orders.refetch?.();
    }
  }

  return (
    <PageSection title="Fulfillment Queue" description="Orders approved and waiting for supply dispatch.">
      <QueryState
        loading={orders.loading}
        error={orders.error}
        hasData={orders.data.length > 0}
        empty={{
          title: "No pending orders in database",
          description: "There are no approved orders waiting for supply dispatch in the database."
        }}
      >
        <CardGrid>
          {orders.data.map((item: any) => (
            <DataCard
              key={item.id}
              title={item.products?.item_name || "Unknown Product"}
              subtitle={`Order: ${item.site_orders?.order_number}`}
              meta={item.status}
            >
              <p>SKU: {item.products?.sku}</p>
              <p>Required Qty: {item.quantity_required} {item.unit_snapshot}</p>
              <p>MRP: ₹{item.products?.mrp}</p>
              <div className="inline-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => markSupplied(item.id, Number(item.quantity_required))}
                  disabled={mutation.isSubmitting}
                >
                  Mark Supplied
                </button>
              </div>
            </DataCard>
          ))}
        </CardGrid>
        <FormNotice error={mutation.error} success={mutation.success} />
      </QueryState>
    </PageSection>
  );
}

export function SupplierInventoryManager() {
  const { profile, activeTenant } = useAuth();
  const tenantId = activeTenant?.id ?? "";
  const mutation = useMutationAction();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newQty, setNewQty] = useState<string>("");

  const inventory = useRows(
    async (client) => {
      const { data, error } = await client
        .from("product_inventory")
        .select("*, products!inner(item_name, sku, stock_status, tenant_id)")
        .eq("products.tenant_id", tenantId)
        .order("available_qty", { ascending: true });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [tenantId],
    { realtimeTable: "product_inventory" }
  );

  async function saveQty(productId: string) {
    const qty = Number(newQty);
    if (isNaN(qty) || qty < 0) return;
    
    const client = await getSupabaseBrowserClient();
    if (!client) return;

    const ok = await mutation.run(async () => {
      const { error } = await client
        .from("product_inventory")
        .update({ available_qty: qty })
        .eq("product_id", productId);
      if (error) throw new Error(error.message);
    }, "Inventory updated");

    if (ok) {
      setEditingId(null);
      inventory.refetch?.();
    }
  }

  const lowStockCount = inventory.data.filter((item: any) => Number(item.available_qty) <= Number(item.reorder_level)).length;

  return (
    <div className="page-stack mt-12">
      <StatsGrid
        items={[
          { label: "Total Tracked Items", value: inventory.data.length },
          { label: "Low Stock Items", value: lowStockCount },
        ]}
      />
      <PageSection title="Inventory Management" description="Quickly adjust available quantities.">
        <QueryState 
          loading={inventory.loading} 
          error={inventory.error} 
          hasData={inventory.data.length > 0}
          empty={{ title: "No inventory tracked", description: "You don't have any active product inventory to manage." }}
        >
          <DataTable
            columns={["Product", "SKU", "Available", "Reserved", "Reorder Level", "Actions"]}
            rows={inventory.data.map((item: any) => [
              item.products?.item_name,
              item.products?.sku,
              editingId === item.product_id ? (
                <input 
                  type="number" 
                  value={newQty} 
                  onChange={e => setNewQty(e.target.value)} 
                  className="w-24 px-2 py-1 border rounded bg-white text-black dark:bg-zinc-800 dark:text-white dark:border-zinc-700" 
                />
              ) : (
                <span className={Number(item.available_qty) <= Number(item.reorder_level) ? "text-red-500 font-bold" : ""}>
                  {item.available_qty}
                </span>
              ),
              item.reserved_qty,
              item.reorder_level,
              editingId === item.product_id ? (
                <div className="flex gap-2">
                  <button onClick={() => saveQty(item.product_id)} className="text-green-600 hover:underline">Save</button>
                  <button onClick={() => setEditingId(null)} className="text-zinc-500 hover:underline">Cancel</button>
                </div>
              ) : (
                <button 
                  onClick={() => { setEditingId(item.product_id); setNewQty(item.available_qty); }} 
                  className="text-blue-600 hover:underline"
                >
                  Edit
                </button>
              )
            ])}
          />
          <FormNotice error={mutation.error} success={mutation.success} />
        </QueryState>
      </PageSection>
    </div>
  );
}

export function SupplierDashboardPage() {
  return (
    <div className="page-stack">
      <SupplierFulfillmentQueue />
      <SupplierInventoryManager />
    </div>
  );
}
