import { Module } from "@nestjs/common";
import { TenancyModule } from "../../common/tenancy/tenancy.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { TallyService } from "./tally.service";

@Module({
  imports: [TenancyModule],
  controllers: [InventoryController],
  providers: [InventoryService, TallyService]
})
export class InventoryModule {}
