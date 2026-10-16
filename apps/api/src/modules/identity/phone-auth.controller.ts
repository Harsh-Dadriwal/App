import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { PhoneAuthService, type SignupProfile } from "./phone-auth.service";

/** Phone OTP sign-in and sign-up. Public: these run before the user has a session. */
@Controller("/api/v1/auth/otp")
export class PhoneAuthController {
  constructor(private readonly phoneAuthService: PhoneAuthService) {}

  /** Body: { phone } */
  @Post("/send")
  @HttpCode(HttpStatus.OK)
  async send(@Body() body: Record<string, unknown>) {
    return { data: await this.phoneAuthService.sendCode(body?.phone) };
  }

  /**
   * Body: { phone, code }. Signs in an existing number, or for a new number returns
   * { status: "needs_profile", signupToken } so the app can ask for name and username.
   */
  @Post("/verify")
  @HttpCode(HttpStatus.OK)
  async verify(@Body() body: Record<string, unknown>) {
    const profile = body?.profile && typeof body.profile === "object" ? (body.profile as SignupProfile) : undefined;
    return { data: await this.phoneAuthService.verifyCode(body?.phone, body?.code, profile) };
  }

  /** Body: { signupToken, profile: { full_name, username, email?, role? } } - creates the account and signs in. */
  @Post("/complete-signup")
  @HttpCode(HttpStatus.OK)
  async completeSignup(@Body() body: Record<string, unknown>) {
    return { data: await this.phoneAuthService.completeSignup(body?.signupToken, body?.profile) };
  }

  /** Body: { username?, email?, phone? } - which of them are still free, for sign-up forms. */
  @Post("/availability")
  @HttpCode(HttpStatus.OK)
  async availability(@Body() body: Record<string, unknown>) {
    return { data: await this.phoneAuthService.checkAvailability(body ?? {}) };
  }
}
