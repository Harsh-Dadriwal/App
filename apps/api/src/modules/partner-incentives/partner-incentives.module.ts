import { Module } from "@nestjs/common";
import { SupabaseModule } from "../../common/supabase/supabase.module";
import { TenancyModule } from "../../common/tenancy/tenancy.module";
import { PartnerIncentivesController } from "./partner-incentives.controller";
import { PartnerIncentivesService } from "./partner-incentives.service";

@Module({
  imports: [SupabaseModule, TenancyModule],
  controllers: [PartnerIncentivesController],
  providers: [PartnerIncentivesService]
})
export class PartnerIncentivesModule {}
