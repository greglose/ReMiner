import { withRetry } from "../../utils/retry";
import { normalizePhone } from "../../utils/phone";

interface SlybroadcastConfig {
  uid: string;
  password: string;
  callerId: string;
  audioUrl: string;
}

interface SlybroadcastResult {
  success: boolean;
  deliveryId: string | null;
  error: string | null;
}

export class SlybroadcastClient {
  private config: SlybroadcastConfig;
  private baseUrl = "https://www.slybroadcast.com/gateway/vmb.php";

  constructor(config: SlybroadcastConfig) {
    this.config = config;
  }

  /**
   * Send a ringless voicemail
   */
  async sendVoicemail(phone: string): Promise<SlybroadcastResult> {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      return { success: false, deliveryId: null, error: "Invalid phone number" };
    }

    const params = new URLSearchParams({
      c_uid: this.config.uid,
      c_password: this.config.password,
      c_phone: normalized,
      c_callerID: this.config.callerId,
      c_url: this.config.audioUrl,
      c_date: "now",
      c_audio: "mp3",
    });

    try {
      const response = await withRetry(async () => {
        const res = await fetch(this.baseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params,
        });

        if (!res.ok) {
          throw new Error(`Slybroadcast API error: ${res.status}`);
        }

        return res.text();
      });

      // Slybroadcast returns "OK" or error message
      if (response.includes("OK")) {
        // Extract delivery ID if present
        const match = response.match(/ID:(\d+)/);
        return {
          success: true,
          deliveryId: match ? match[1] : null,
          error: null,
        };
      } else {
        return {
          success: false,
          deliveryId: null,
          error: response,
        };
      }
    } catch (error) {
      return {
        success: false,
        deliveryId: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Check delivery status
   */
  async checkDeliveryStatus(deliveryId: string): Promise<string> {
    const params = new URLSearchParams({
      c_uid: this.config.uid,
      c_password: this.config.password,
      c_action: "status",
      c_id: deliveryId,
    });

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });

    return response.text();
  }

  /**
   * Get account balance/credits
   */
  async getAccountBalance(): Promise<number> {
    const params = new URLSearchParams({
      c_uid: this.config.uid,
      c_password: this.config.password,
      c_action: "balance",
    });

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });

    const text = await response.text();
    const match = text.match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : 0;
  }
}
