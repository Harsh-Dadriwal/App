import { Module } from "@nestjs/common";
import { IdentityModule } from "./modules/identity/identity.module";
import { TenantsModule } from "./modules/tenants/tenants.module";
import { WorkflowsModule } from "./modules/workflows/workflows.module";
import { WalletModule } from "./modules/wallet/wallet.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { SupabaseModule } from "./common/supabase/supabase.module";
import { AuthModule } from "./common/auth/auth.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { QueueModule } from "./common/queue/queue.module";
import { HealthController } from "./health.controller";
import { EventsModule } from "./common/events/events.module";
import { TenancyModule } from "./common/tenancy/tenancy.module";
import { PaymentsModule } from "./modules/payments/payments.module";

@Module({
  imports: [
    SupabaseModule,
    AuthModule,
    QueueModule,
    EventsModule,
    TenancyModule,
    TenantsModule,
    IdentityModule,
    WorkflowsModule,
    WalletModule,
    NotificationsModule,
    InventoryModule,
    PaymentsModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
