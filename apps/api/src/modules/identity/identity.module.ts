import { Module } from "@nestjs/common";
import { IdentityController } from "./identity.controller";
import { IdentityService } from "./identity.service";
import { FirebaseAuthController } from "./firebase-auth.controller";
import { FirebaseAuthService } from "./firebase-auth.service";
import { TenantsModule } from "../tenants/tenants.module";

@Module({
  imports: [TenantsModule],
  controllers: [IdentityController, FirebaseAuthController],
  providers: [IdentityService, FirebaseAuthService]
})
export class IdentityModule {}
