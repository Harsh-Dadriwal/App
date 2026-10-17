import { Module } from "@nestjs/common";
import { TenancyModule } from "../../common/tenancy/tenancy.module";
import { InventoryModule } from "../inventory/inventory.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrderRequestsModule } from "../order-requests/order-requests.module";
import { QuotationsModule } from "../quotations/quotations.module";
import { SelectionsController } from "./selections.controller";
import { SelectionsService } from "./selections.service";

@Module({
  imports: [TenancyModule, NotificationsModule, InventoryModule, OrderRequestsModule, QuotationsModule],
  controllers: [SelectionsController],
  providers: [SelectionsService]
})
export class SelectionsModule {}
