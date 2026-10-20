import { Module } from "@nestjs/common";
import { TenancyModule } from "../../common/tenancy/tenancy.module";
import { InventoryModule } from "../inventory/inventory.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrderRequestsModule } from "../order-requests/order-requests.module";
import { QuotationPhotosService } from "./quotation-photos.service";
import { QuotationsController } from "./quotations.controller";
import { QuotationsService } from "./quotations.service";

@Module({
  imports: [TenancyModule, NotificationsModule, InventoryModule, OrderRequestsModule],
  controllers: [QuotationsController],
  providers: [QuotationsService, QuotationPhotosService],
  exports: [QuotationsService, QuotationPhotosService]
})
export class QuotationsModule {}
