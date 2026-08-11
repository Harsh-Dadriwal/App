import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
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
import { MaintenanceModule } from "./modules/maintenance/maintenance.module";
import { RequirementsModule } from "./modules/requirements/requirements.module";
import { RiskModule } from "./modules/risk/risk.module";
import { MonetizationModule } from "./modules/monetization/monetization.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { ProjectMediaModule } from "./modules/project-media/project-media.module";
import { PartnerIncentivesModule } from "./modules/partner-incentives/partner-incentives.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"]
    }),
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
    PaymentsModule,
    MaintenanceModule,
    RequirementsModule,
    RiskModule,
    MonetizationModule,
    ProjectsModule,
    ProjectMediaModule,
    PartnerIncentivesModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
