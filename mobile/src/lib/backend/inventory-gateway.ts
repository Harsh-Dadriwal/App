import { createInventoryGateway } from "@mahalaxmi/core/gateway/inventory-gateway";
import { supabase } from "@/lib/supabase";
import { backendRequest } from "./http";
import { isBackendApiConfigured } from "./config";

const gateway = createInventoryGateway({
  isBackendApiConfigured,
  backendRequest,
  getSupabaseClient: () => supabase
});

export const getPriceList = gateway.getPriceList;
export const syncPriceList = gateway.syncPriceList;
