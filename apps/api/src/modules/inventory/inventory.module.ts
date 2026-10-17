import { Module } from "@nestjs/common";
import { TenancyModule } from "../../common/tenancy/tenancy.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { InventoryController } from "./inventory.controller";
import { PriceListCronController } from "./price-list-cron.controller";
import { InventoryService } from "./inventory.service";
import { PriceListService } from "./price-list.service";

@Module({
  imports: [TenancyModule, NotificationsModule],
  controllers: [InventoryController, PriceListCronController],
  providers: [InventoryService, PriceListService],
  exports: [InventoryService, PriceListService]
})
export class InventoryModule {}
