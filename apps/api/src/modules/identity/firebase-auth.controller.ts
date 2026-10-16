import { Body, Controller, Post, HttpCode, HttpStatus } from "@nestjs/common";
import { FirebaseAuthService, type SignupProfile } from "./firebase-auth.service";

@Controller("/api/v1/auth")
export class FirebaseAuthController {
  constructor(private readonly firebaseAuthService: FirebaseAuthService) {}

  /** Body: { idToken, profile?: { full_name, username, role } } - profile is used only for new accounts. */
  @Post("/firebase-login")
  @HttpCode(HttpStatus.OK)
  async firebaseLogin(@Body() body: Record<string, unknown>) {
    const idToken = typeof body?.idToken === "string" ? body.idToken : "";
    const profile = body?.profile && typeof body.profile === "object" ? (body.profile as SignupProfile) : undefined;
    return this.firebaseAuthService.exchangeFirebaseTokenForSupabaseSession(idToken, profile);
  }
}
