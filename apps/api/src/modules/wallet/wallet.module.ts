import { Module } from "@nestjs/common";
import { EventsModule } from "../../common/events/events.module";
import { TenancyModule } from "../../common/tenancy/tenancy.module";
import { WalletController } from "./wallet.controller";
import { WalletService } from "./wallet.service";

@Module({
  imports: [EventsModule, TenancyModule],
  controllers: [WalletController],
  providers: [WalletService]
})
export class WalletModule {}
