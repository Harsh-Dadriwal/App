import { Body, Controller, Post, HttpCode, HttpStatus } from "@nestjs/common";
import { FirebaseAuthService } from "./firebase-auth.service";

class FirebaseLoginDto {
  idToken!: string;
}

@Controller("/api/v1/auth")
export class FirebaseAuthController {
  constructor(private readonly firebaseAuthService: FirebaseAuthService) {}

  @Post("/firebase-login")
  @HttpCode(HttpStatus.OK)
  async firebaseLogin(@Body() body: FirebaseLoginDto) {
    return this.firebaseAuthService.exchangeFirebaseTokenForSupabaseSession(body.idToken);
  }
}
