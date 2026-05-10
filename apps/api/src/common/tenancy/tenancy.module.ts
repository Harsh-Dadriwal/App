import { Module } from "@nestjs/common";
import { SupabaseModule } from "../supabase/supabase.module";
import { TenantAccessService } from "./tenant-access.service";

@Module({
  imports: [SupabaseModule],
  providers: [TenantAccessService],
  exports: [TenantAccessService]
})
export class TenancyModule {}
