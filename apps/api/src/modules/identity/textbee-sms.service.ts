import { Injectable, ServiceUnavailableException } from "@nestjs/common";

const DEFAULT_BASE_URL = "https://api.textbee.dev/api/v1";

/**
 * Sends SMS through TextBee (textbee.dev), which delivers them from an Android phone
 * registered in the TextBee dashboard, using that phone's SIM.
 */
@Injectable()
export class TextBeeSmsService {
  isConfigured() {
    return Boolean(process.env.TEXTBEE_API_KEY && process.env.TEXTBEE_DEVICE_ID);
  }

  async send(phone: string, message: string) {
    const apiKey = process.env.TEXTBEE_API_KEY;
    const deviceId = process.env.TEXTBEE_DEVICE_ID;
    if (!apiKey || !deviceId) {
      throw new ServiceUnavailableException("Phone sign-in is not available right now. Please use email.");
    }
    const baseUrl = (process.env.TEXTBEE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");

    const response = await fetch(`${baseUrl}/gateway/devices/${encodeURIComponent(deviceId)}/send-sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ recipients: [phone], message }),
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) {
      throw new Error(`TextBee send-sms failed: ${response.status} ${await response.text().catch(() => "")}`);
    }
  }
}
