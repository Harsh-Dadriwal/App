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

  /** Body: { phone, code, profile?: { full_name, username, role } } - profile is used only for new accounts. */
  @Post("/verify")
  @HttpCode(HttpStatus.OK)
  async verify(@Body() body: Record<string, unknown>) {
    const profile = body?.profile && typeof body.profile === "object" ? (body.profile as SignupProfile) : undefined;
    return { data: await this.phoneAuthService.verifyCode(body?.phone, body?.code, profile) };
  }
}
