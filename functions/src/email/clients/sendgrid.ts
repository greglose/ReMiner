import sgMail from "@sendgrid/mail";
import { withRetry } from "../../utils/retry";
import type { Lead, EmailStep, Config } from "../../types";

export class SendGridClient {
  constructor(apiKey: string) {
    sgMail.setApiKey(apiKey);
  }

  /**
   * Send a single email
   */
  async sendEmail(
    lead: Lead,
    step: EmailStep,
    config: Config
  ): Promise<{ messageId: string }> {
    const personalizedSubject = this.personalize(step.subject, lead, config);
    const personalizedHtml = this.personalize(step.bodyHtml, lead, config);
    const personalizedText = this.personalize(step.bodyText, lead, config);

    const msg = {
      to: lead.primaryEmail!,
      from: {
        email: config.fromEmail,
        name: config.fromName,
      },
      replyTo: config.replyToEmail || config.fromEmail,
      subject: personalizedSubject,
      html: this.addFooter(personalizedHtml, lead.id, config),
      text: this.addFooterText(personalizedText, lead.id, config),
      trackingSettings: {
        clickTracking: { enable: true, enableText: false },
        openTracking: { enable: true },
      },
      customArgs: {
        leadId: lead.id,
        userId: lead.userId,
        sequenceId: lead.emailSequenceId || "",
        stepNumber: step.stepNumber.toString(),
      },
      categories: ["motivated-seller", `step-${step.stepNumber}`],
    };

    return withRetry(async () => {
      const [response] = await sgMail.send(msg);
      return {
        messageId: response.headers["x-message-id"] as string,
      };
    });
  }

  /**
   * Personalize template with lead data
   */
  private personalize(template: string, lead: Lead, config: Config): string {
    return template
      // Owner info
      .replace(/\{\{firstName\}\}/g, lead.ownerFirstName || "there")
      .replace(/\{\{lastName\}\}/g, lead.ownerLastName || "")
      .replace(/\{\{ownerName\}\}/g, lead.ownerName || "Homeowner")
      // Property info
      .replace(/\{\{address\}\}/g, lead.address)
      .replace(/\{\{city\}\}/g, lead.city)
      .replace(/\{\{state\}\}/g, lead.state)
      .replace(/\{\{zipCode\}\}/g, lead.zipCode)
      .replace(/\{\{daysOnMarket\}\}/g, lead.daysOnMarket.toString())
      .replace(/\{\{listPrice\}\}/g, this.formatCurrency(lead.listPrice))
      .replace(/\{\{bedrooms\}\}/g, lead.bedrooms?.toString() || "")
      .replace(/\{\{bathrooms\}\}/g, lead.bathrooms?.toString() || "")
      .replace(/\{\{sqft\}\}/g, lead.sqft?.toLocaleString() || "")
      .replace(/\{\{yearBuilt\}\}/g, lead.yearBuilt?.toString() || "")
      .replace(/\{\{propertyType\}\}/g, lead.propertyType || "")
      // Company info
      .replace(/\{\{companyName\}\}/g, config.companyName)
      .replace(/\{\{yourName\}\}/g, config.fromName)
      .replace(/\{\{yourEmail\}\}/g, config.fromEmail)
      .replace(/\{\{replyEmail\}\}/g, config.replyToEmail || config.fromEmail);
  }

  /**
   * Format currency for display
   */
  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  }

  /**
   * Add CAN-SPAM compliant footer to HTML email
   */
  private addFooter(html: string, leadId: string, config: Config): string {
    const unsubscribeUrl = `https://${config.inboundEmailDomain}/unsubscribe?id=${leadId}`;

    const footer = `
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; font-family: Arial, sans-serif;">
        <p style="margin: 0 0 8px 0;">You're receiving this because your property is listed for sale.</p>
        <p style="margin: 0;">
          <a href="${unsubscribeUrl}" style="color: #666;">Unsubscribe</a> |
          ${config.companyName} |
          ${config.physicalAddress}, ${config.physicalCity}, ${config.physicalState} ${config.physicalZip}
        </p>
      </div>
    `;

    // Insert before closing body tag, or append
    if (html.includes("</body>")) {
      return html.replace("</body>", `${footer}</body>`);
    }
    return html + footer;
  }

  /**
   * Add CAN-SPAM compliant footer to text email
   */
  private addFooterText(text: string, leadId: string, config: Config): string {
    const unsubscribeUrl = `https://${config.inboundEmailDomain}/unsubscribe?id=${leadId}`;

    return `${text}

---
You're receiving this because your property is listed for sale.
Unsubscribe: ${unsubscribeUrl}
${config.companyName} | ${config.physicalAddress}, ${config.physicalCity}, ${config.physicalState} ${config.physicalZip}`;
  }
}
