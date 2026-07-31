import express from "express";
import path from "path";
import dns from "dns";
import crypto from "crypto";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Load environment variables
dotenv.config();

// --- Payment Provider Framework (ported from server.ts) ---

export interface PaymentProvider {
  id: string;
  collect(
    amount: number,
    phoneNumber: string,
    description?: string,
    externalReference?: string,
    paymentMethod?: string
  ): Promise<{
    reference: string;
    status: string;
    simulated?: boolean;
    message?: string;
    raw?: any;
  }>;
  getStatus(reference: string): Promise<{
    reference: string;
    status: string;
    simulated?: boolean;
    amount?: number;
    raw?: any;
  }>;
}

export class MTNDirectProvider implements PaymentProvider {
  id = "mtn_direct";
  async collect(): Promise<any> {
    throw new Error("MTN Direct payment provider is not yet enabled.");
  }
  async getStatus(): Promise<any> {
    throw new Error("MTN Direct payment provider is not yet enabled.");
  }
}

export class OrangeDirectProvider implements PaymentProvider {
  id = "orange_direct";
  async collect(): Promise<any> {
    throw new Error("Orange Direct payment provider is not yet enabled.");
  }
  async getStatus(): Promise<any> {
    throw new Error("Orange Money Direct payment provider is not yet enabled.");
  }
}

export class FuturaPayProvider implements PaymentProvider {
  id = "futurapay";

  private cachedToken: string | null = null;
  private cachedTokenAt: number = 0;
  private readonly TOKEN_TTL_MS = 20 * 60 * 1000; // refresh every 20 min to be safe

  constructor(
    private merchantKey: string,
    private siteId: string,
    private apiKey: string,
    private apiBaseUrl: string, // e.g. https://stage-api.futurapay.com or https://api.futurapay.com
    private simulatedTransactions: Map<string, any>
  ) {}

  private get isConfigured(): boolean {
    return !!(this.merchantKey && this.siteId && this.apiKey);
  }

  private async fetchWithRetry(url: string, options: RequestInit, maxRetries = 1): Promise<Response> {
    let lastErr: any;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, options);
        // Only retry on server-side/transient errors, not on 4xx business errors
        // (e.g. 412 "amount out of range" should NOT be retried, it will just fail again)
        if (res.status >= 500 && attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 800));
          continue;
        }
        return res;
      } catch (err) {
        lastErr = err;
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 800));
          continue;
        }
      }
    }
    throw lastErr;
  }

  // Maps FuturaPay's status vocabulary onto the vocabulary the rest of NGACCUL expects
  // (PENDING / SUCCESSFUL / FAILED), same as CampayProvider.
  private mapStatus(futuraPayStatus?: string): string {
    const s = (futuraPayStatus || "").toLowerCase().trim();
    const successTerms = ["success", "successful", "completed", "approved", "confirmed"];
    const failTerms = ["failed", "failure", "cancelled", "canceled", "declined", "rejected", "expired"];
    if (successTerms.some(t => s.includes(t))) return "SUCCESSFUL";
    if (failTerms.some(t => s.includes(t))) return "FAILED";
    if (!successTerms.some(t => s.includes(t)) && !failTerms.some(t => s.includes(t))) {
      console.warn(`[NGACCUL][FuturaPay mapStatus] Unrecognized status "${futuraPayStatus}" — defaulting to PENDING.`);
    }
    return "PENDING";
  }

  private async getMerchantToken(forceRefresh = false): Promise<string> {
    if (!this.isConfigured) {
      throw new Error("Missing FuturaPay credentials");
    }

    const isStale = Date.now() - this.cachedTokenAt > this.TOKEN_TTL_MS;
    if (!forceRefresh && this.cachedToken && !isStale) {
      return this.cachedToken;
    }

    const res = await this.fetchWithRetry(`${this.apiBaseUrl}/restapi/v1/auth/merchant/token/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchant_key: this.merchantKey }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to generate FuturaPay merchant token: ${res.statusText} - ${errText}`);
    }

    const data = await res.json() as any;
    const token = data?.data?.token || "";
    if (!token) {
      throw new Error("FuturaPay token generate response did not include a token.");
    }

    this.cachedToken = token;
    this.cachedTokenAt = Date.now();
    return token;
  }

  // Total fee we want the depositing customer to end up paying, as a fraction
  // of the requested deposit amount (0.04 = 4%). FuturaPay/Orange/MTN already
  // auto-add their OWN cut on top of whatever "amount" we send to /initiate
  // (confirmed live: Orange is currently configured at fee_in_percentage=2 on
  // this account), so to land on an exact 4% total we have to send FuturaPay a
  // slightly *smaller* "amount" than the full 4%-marked-up total, such that
  // their own percentage cut on top of that smaller number brings the
  // customer's total charge back up to exactly requestedAmount * 1.04.
  private readonly TOTAL_CUSTOMER_FEE_FRACTION = 0.04;

  private cachedFeeConfig: Record<string, { feePct: number; minFee: number }> | null = null;
  private cachedFeeConfigAt: number = 0;
  private readonly FEE_CONFIG_TTL_MS = 20 * 60 * 1000;

  // Reads FuturaPay's OWN configured fee_in_percentage / minimum_fees per
  // gateway directly from /restapi/v1/merchant/currencies (a read-only,
  // no-transaction-created endpoint), rather than hardcoding an assumed rate.
  // This is the same number visible in FuturaPay's merchant dashboard under
  // Merchant > Settings > Services, and it's what actually determines what a
  // customer's phone gets charged on top of whatever amount we request.
  private async getGatewayFeeConfig(token: string, forceRefresh = false): Promise<Record<string, { feePct: number; minFee: number }>> {
    const isStale = Date.now() - this.cachedFeeConfigAt > this.FEE_CONFIG_TTL_MS;
    if (!forceRefresh && this.cachedFeeConfig && !isStale) {
      return this.cachedFeeConfig;
    }

    const res = await this.fetchWithRetry(`${this.apiBaseUrl}/restapi/v1/merchant/currencies`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to fetch FuturaPay merchant currencies (fee config): ${res.status} ${errText}`);
    }

    const data = await res.json() as any;
    console.log(`[NGACCUL][FuturaPay Merchant Currencies Raw Response]`, JSON.stringify(data));

    const entries: any[] = Array.isArray(data?.data) ? data.data : [];
    // Match XAF case-insensitively, and consider every matching currency entry
    // (a merchant account can have more than one XAF entry, e.g. per service).
    const xafEntries = entries.filter((c: any) => (c?.code || "").toUpperCase() === "XAF");

    // FuturaPay's docs are inconsistent about this field's exact name/casing
    // across sections (their examples use "getway_configuration" in one place
    // and "gateway_configuration" elsewhere) - and now the live response has
    // proven the docs aren't fully reliable, so we check every variant.
    const gateways: any[] = xafEntries.flatMap((entry: any) =>
      entry?.getway_configuration || entry?.gateway_configuration || entry?.gatewayConfiguration || []
    );

    const config: Record<string, { feePct: number; minFee: number }> = {};
    for (const cfg of gateways) {
      const gatewayObj = Array.isArray(cfg?.gateway) ? cfg.gateway[0] : cfg?.gateway;
      const label = `${gatewayObj?.name || ""} ${gatewayObj?.payment_method || ""}`.toLowerCase();
      const feePct = Number(cfg?.fee_in_percentage) || 0;
      const minFee = Number(cfg?.minimum_fees) || 0;
      if (label.includes("mtn")) config.mtn = { feePct, minFee };
      if (label.includes("orange")) config.orange = { feePct, minFee };
    }

    if (Object.keys(config).length === 0) {
      console.error(`[NGACCUL][FuturaPay Fee Config] Parsed 0 gateways from merchant/currencies response. entries.length=${entries.length}, xafEntries.length=${xafEntries.length}, gateways.length=${gateways.length}. Raw response logged above for inspection.`);
    }

    this.cachedFeeConfig = config;
    this.cachedFeeConfigAt = Date.now();
    return config;
  }

  // Computes the "amount" we should actually send to /payments/initiate so
  // that, after FuturaPay adds its own gateway fee on top, the customer's
  // final USSD charge equals requestedAmount * (1 + TOTAL_CUSTOMER_FEE_FRACTION).
  //
  // Math: FuturaPay charges the customer initiateAmount + (initiateAmount *
  // feePct/100), i.e. initiateAmount * (1 + feePct/100). We want that to equal
  // requestedAmount * (1 + TOTAL_CUSTOMER_FEE_FRACTION), so:
  //   initiateAmount = requestedAmount * (1 + TOTAL_CUSTOMER_FEE_FRACTION) / (1 + feePct/100)
  //
  // NOTE: this assumes FuturaPay's fee is a pure percentage add-on (matches
  // the confirmed live Orange example: 500 -> fee_amount 10 -> charged 510,
  // exactly 500 * 0.02). If minimum_fees is ever nonzero for a gateway, this
  // calculation doesn't account for a flat component and the real customer
  // charge could come out slightly off 4% — logged below so it's visible if
  // that assumption stops holding.
  private computeGatewayInitiateAmount(
    requestedAmount: number,
    paymentMethod: string | undefined,
    feeConfig: Record<string, { feePct: number; minFee: number }>
  ): number {
    const method = (paymentMethod || "").toLowerCase().trim();
    const gwFee = feeConfig[method];

    if (!gwFee) {
      // Deliberately NOT throwing here: this markup is an added-on-top business
      // rule, and a parsing hiccup on FuturaPay's fee-config endpoint should
      // never be able to block a client's actual deposit. Fall back to sending
      // FuturaPay the plain requested amount (no markup) and log loudly so
      // it's visible and fixable, rather than every deposit failing outright.
      console.error(`[NGACCUL][FuturaPay Fee Markup] No fee configuration found for payment method "${paymentMethod}" - falling back to NO markup for this deposit (customer will be charged FuturaPay's own fee only, not the extra 4%). Check the "[NGACCUL][FuturaPay Merchant Currencies Raw Response]" log line to see why parsing failed to find this gateway.`);
      return requestedAmount;
    }

    if (gwFee.minFee > 0) {
      console.warn(`[NGACCUL][FuturaPay Fee Markup] Gateway "${method}" has a nonzero minimum_fees=${gwFee.minFee} in addition to fee_in_percentage=${gwFee.feePct}. The 4% markup math below only accounts for the percentage component, so the real customer charge may deviate slightly from an exact 4%.`);
    }

    const targetCustomerTotal = requestedAmount * (1 + this.TOTAL_CUSTOMER_FEE_FRACTION);
    const gatewayMultiplier = 1 + gwFee.feePct / 100;
    const initiateAmount = Math.round(targetCustomerTotal / gatewayMultiplier);

    console.log(`[NGACCUL][FuturaPay Fee Markup] requested=${requestedAmount}, gateway="${method}", futurapayFeePct=${gwFee.feePct}, targetCustomerTotal=${targetCustomerTotal}, initiateAmountSent=${initiateAmount}`);

    return initiateAmount;
  }

  // Splits a free-text description like "Direct Member Deposit: Jean Paul Mballa"
  // into first/last name for FuturaPay's required customer_first_name field.
  private deriveCustomerName(description?: string): { first: string; last: string } {
    const match = description?.match(/:\s*([A-Za-zÀ-ÿ'’\-]+(?:\s+[A-Za-zÀ-ÿ'’\-]+)*)\s*$/);
    const fullName = match?.[1]?.trim();
    if (!fullName) return { first: "NGACCUL", last: "Member" };
    const parts = fullName.split(/\s+/);
    return {
      first: parts[0],
      last: parts.slice(1).join(" ") || "Member",
    };
  }

  // Picks the gateway_configuration entry (returned by /payments/initiate) that
  // matches the mobile money network the customer selected. FuturaPay's account
  // can have several gateways configured (MTN Money, Orange Money, crypto, ...),
  // and /payments/processed needs to know which one to route through — that's
  // done via the Step 2 "Payment Status Update" call, which requires a gateway_id.
  // We match by inspecting the gateway's name/payment_method text rather than
  // hardcoding numeric IDs, since FuturaPay's docs only give "example" IDs and
  // the real ones are merchant-account-specific.
  private resolveGatewayId(gatewayConfiguration: any, paymentMethod?: string): number | undefined {
    if (!Array.isArray(gatewayConfiguration) || gatewayConfiguration.length === 0) {
      return undefined;
    }

    const cleanMethod = (paymentMethod || "").toLowerCase();
    const wantsMtn = cleanMethod.includes("mtn");
    const wantsOrange = cleanMethod.includes("orange");

    const matched = gatewayConfiguration.find((cfg: any) => {
      const label = `${cfg?.gateway?.name || ""} ${cfg?.gateway?.payment_method || ""}`.toLowerCase();
      if (wantsMtn) return label.includes("mtn");
      if (wantsOrange) return label.includes("orange");
      return false;
    });

    if (matched?.gateway?.id !== undefined) {
      return matched.gateway.id;
    }

    // Fallback: if only one gateway is configured for this merchant/currency,
    // use it rather than failing outright.
    if (gatewayConfiguration.length === 1 && gatewayConfiguration[0]?.gateway?.id !== undefined) {
      return gatewayConfiguration[0].gateway.id;
    }

    return undefined;
  }

  private async doInitiateAndProcess(
    amount: number,
    formattedPhone: string,
    description: string | undefined,
    refId: string,
    token: string,
    paymentMethod?: string
  ): Promise<any> {
    const { first, last } = this.deriveCustomerName(description);
    // FuturaPay requires an email; NGACCUL doesn't collect one for mobile money
    // deposits today, so we synthesize a stable, traceable placeholder.
    const syntheticEmail = `momo+${formattedPhone}@ngaccul.app`;

    // Compute the amount to actually send to FuturaPay so the customer's total
    // charge lands on requestedAmount * 1.04 once FuturaPay's own gateway fee
    // is added on top. `amount` here is still the original requested deposit —
    // it's what gets credited to the member's savings balance downstream (see
    // createClientDirectDeposit / reconcileFuturaPayTransaction), completely
    // unaffected by this markup.
    //
    // Wrapped defensively: this fee lookup is a business add-on, not part of
    // FuturaPay's core deposit flow, so if it fails for any reason (network
    // blip, unexpected response shape) we fall back to no markup rather than
    // blocking the client's actual deposit.
    let gatewayAmount = amount;
    try {
      const feeConfig = await this.getGatewayFeeConfig(token);
      gatewayAmount = this.computeGatewayInitiateAmount(amount, paymentMethod, feeConfig);
    } catch (feeErr: any) {
      console.error(`[NGACCUL][FuturaPay Fee Markup] Failed to fetch/compute fee markup, falling back to no markup for this deposit: ${feeErr?.message || feeErr}`);
    }

    // NOTE: per FuturaPay's official REST API docs, gateway_id is NOT a field
    // on /payments/initiate at all (it only appears in the response's
    // gateway_configuration list). It belongs on the *separate* middle step,
    // /restapi/v1/payments/status/update, which is a required step between
    // initiate and processed for this flow. Sending gateway_id at initiate or
    // at processed (both tried previously) is why every attempt failed with
    // an identical "Gateway ID is missing" error — that field simply isn't
    // read at either of those steps.
    const initiatePayload = {
      merchant_key: this.merchantKey,
      site_id: this.siteId,
      api_key: this.apiKey,
      currency_code: "XAF",
      country_code: "CM",
      customer_first_name: first,
      customer_last_name: last,
      customer_phone: formattedPhone,
      customer_email: syntheticEmail,
      customer_transaction_id: refId,
      amount: gatewayAmount,
    };

    const initiateRes = await this.fetchWithRetry(`${this.apiBaseUrl}/restapi/v1/payments/initiate`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(initiatePayload),
    });

    if (!initiateRes.ok) {
      const errText = await initiateRes.text();
      throw new Error(`FuturaPay initiate failed (${initiateRes.status}): ${errText}`);
    }

    const initiateData = await initiateRes.json() as any;
    console.log(`[NGACCUL][FuturaPay Initiate Raw Response]`, JSON.stringify(initiateData));

    // Note: FuturaPay's own docs use the field name "has_token" (not "hash_token")
    // in the initiate response, despite calling it hash_token everywhere else.
    // We defensively check both.
    const hashToken = initiateData?.data?.has_token || initiateData?.data?.hash_token;
    if (!hashToken) {
      throw new Error("FuturaPay initiate response did not include a hash/has token.");
    }

    const gatewayConfiguration = initiateData?.data?.gateway_configuration;
    const gatewayId = this.resolveGatewayId(gatewayConfiguration, paymentMethod);

    if (gatewayId === undefined) {
      throw new Error(
        `FuturaPay initiate response did not include a matching gateway configuration for payment method "${paymentMethod || "unknown"}". ` +
        `Verify MTN Money / Orange Money are both enabled and active under Merchant > Settings > Services in your FuturaPay dashboard.`
      );
    }

    // Step 2 (previously missing): /payments/status/update.
    // Per FuturaPay's docs this is the step that actually accepts
    // hash_token + status + gateway_id, and it must be called before
    // /payments/processed.
    const statusUpdateRes = await this.fetchWithRetry(`${this.apiBaseUrl}/restapi/v1/payments/status/update`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hash_token: hashToken,
        status: "initiated",
        gateway_id: gatewayId,
      }),
    });

    if (!statusUpdateRes.ok) {
      const errText = await statusUpdateRes.text();
      console.error(`[NGACCUL][FuturaPay Status Update Failed] sent hash_token=${hashToken}, gateway_id=${gatewayId}, response=${errText}`);
      throw new Error(`FuturaPay status update call failed (${statusUpdateRes.status}): ${errText}`);
    }

    const statusUpdateData = await statusUpdateRes.json() as any;
    console.log(`[NGACCUL][FuturaPay Status Update Raw Response]`, JSON.stringify(statusUpdateData));

    // Step 3: /payments/processed. Per docs this endpoint only accepts
    // hash_token, phone_number, and optional receiver_email — no gateway_id.
    const processedRes = await this.fetchWithRetry(`${this.apiBaseUrl}/restapi/v1/payments/processed`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hash_token: hashToken,
        phone_number: formattedPhone,
      }),
    });

    if (!processedRes.ok) {
      const errText = await processedRes.text();
      console.error(`[NGACCUL][FuturaPay Processed Failed] sent hash_token=${hashToken}, phone_number=${formattedPhone}, response=${errText}`);
      throw new Error(`FuturaPay processed call failed (${processedRes.status}): ${errText}`);
    }

    return await processedRes.json();
  }

  async collect(
    amount: number,
    phoneNumber: string,
    description?: string,
    externalReference?: string,
    paymentMethod?: string
  ): Promise<{
    reference: string;
    status: string;
    simulated?: boolean;
    message?: string;
    raw?: any;
  }> {
    let formattedPhone = phoneNumber.replace(/\s+/g, "").replace(/\+/g, "");
    if (!formattedPhone.startsWith("237") && formattedPhone.length === 9) {
      formattedPhone = "237" + formattedPhone;
    }

    const cleanAmount = Number(amount);
    const refId = externalReference || `TX_${Date.now()}`;

    // A. If credentials are empty, run the simulated stateful fallback,
    // same pattern as CampayProvider, so this works out of the box in dev.
    if (!this.isConfigured) {
      console.log(`[NGACCUL][Simulated FuturaPay] Registering pending collect transaction: Reference=${refId}, Amount=${cleanAmount}, Phone=${formattedPhone}`);
      this.simulatedTransactions.set(refId, {
        status: "PENDING",
        amount: cleanAmount,
        phoneNumber: formattedPhone,
        createdAt: Date.now(),
        reference: refId,
      });

      setTimeout(() => {
        const txObj = this.simulatedTransactions.get(refId);
        if (txObj) {
          txObj.status = "SUCCESSFUL";
          this.simulatedTransactions.set(refId, txObj);
          console.log(`[NGACCUL][Simulated FuturaPay] Transaction autocomplete: Reference=${refId} status changed to SUCCESSFUL`);
        }
      }, 12000);

      return {
        reference: refId,
        status: "PENDING",
        simulated: true,
        message: "Mobile money push simulated successfully (FuturaPay credentials not configured).",
      };
    }

    // B. Real FuturaPay flow: token -> initiate -> processed
    try {
      let token = await this.getMerchantToken();
      let processedData: any;
      try {
        processedData = await this.doInitiateAndProcess(cleanAmount, formattedPhone, description, refId, token, paymentMethod);
      } catch (err: any) {
        // If the cached token expired mid-flow, retry once with a fresh token.
        if (String(err.message || "").includes("401")) {
          token = await this.getMerchantToken(true);
          processedData = await this.doInitiateAndProcess(cleanAmount, formattedPhone, description, refId, token, paymentMethod);
        } else {
          throw err;
        }
      }

      console.log(`[NGACCUL][FuturaPay API Success Response]`, processedData);

      return {
        reference: refId,
        status: this.mapStatus(processedData?.data?.status),
        simulated: false,
        raw: processedData,
      };
    } catch (err: any) {
      console.error(`[NGACCUL][FuturaPay Collect Exception]`, err);
      throw new Error(err.message || "FuturaPay collection request failed.");
    }
  }

  async getStatus(reference: string): Promise<{
    reference: string;
    status: string;
    simulated?: boolean;
    amount?: number;
    raw?: any;
  }> {
    // Check simulatedTransactions first (mirrors CampayProvider behavior)
    if (this.simulatedTransactions.has(reference)) {
      const simTx = this.simulatedTransactions.get(reference)!;
      return {
        reference: simTx.reference,
        status: simTx.status,
        simulated: true,
        amount: simTx.amount,
      };
    }

    if (!this.isConfigured) {
      return {
        reference: reference,
        status: "SUCCESSFUL",
        simulated: true,
      };
    }

    const statusRes = await fetch(`${this.apiBaseUrl}/api/v1/futurapay/payment/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        customer_transaction_id: reference,
      }),
    });

    if (!statusRes.ok) {
      const errText = await statusRes.text();
      console.error(`[NGACCUL][FuturaPay Status HTTP Error]`, errText);
      throw new Error(`Failed to check transaction status with FuturaPay: ${errText}`);
    }

    const statusData = await statusRes.json() as any;
    console.log(`[NGACCUL][FuturaPay Status Fetch OK]`, statusData);

    return {
      reference: statusData?.data?.customer_transaction_id || reference,
      status: this.mapStatus(statusData?.data?.status),
      simulated: false,
      amount: statusData?.data?.amount,
      raw: statusData,
    };
  }
}

// Standard port is 3000
const PORT = 3000;

async function start() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  // Business hours check (Mon-Sat, 8:00 AM - 4:00 PM Africa/Douala)
  //
  // TEMP OVERRIDE: set DISABLE_BUSINESS_HOURS=true in the environment (Vercel project
  // settings, or .env for local dev) to bypass this enforcement. Also set
  // VITE_DISABLE_BUSINESS_HOURS=true so the client UI stops greying out buttons to
  // match. Unset/flip both back to false once the client adopts the app and it goes live.
  async function checkBusinessHoursServer(actorId?: string): Promise<{ within: boolean; message: string }> {
    if (process.env.DISABLE_BUSINESS_HOURS === "true") {
      return { within: true, message: "" };
    }

    let role = "client"; // default to restricted if not found
    let branchId = "ngde";

    if (actorId && serverSupabase) {
      try {
        const { data: profile } = await serverSupabase
          .from("profiles")
          .select("role, branch_id")
          .eq("id", actorId)
          .maybeSingle();
        if (profile) {
          role = profile.role || "client";
          branchId = profile.branch_id || "ngde";
        } else {
          console.warn(`checkBusinessHoursServer: Actor ID ${actorId} specified but profile not found in Supabase. Falling back to default role 'client' and branch 'ngde'.`);
        }
      } catch (err) {
        console.error("Failed to fetch actor profile for hours check:", err);
      }
    }

    // Admins/PDG/staff must never be blocked by this gate
    if (role === "pdg" || role === "branch_admin" || role === "staff") {
      return { within: true, message: "" };
    }

    // Now query settings and appeals from Supabase to resolve the hours
    let startHour = 8;
    let startMin = 0;
    let endHour = 16;
    let endMin = 0;
    let daysActive = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    let isEnabled = true;

    if (serverSupabase) {
      try {
        // Fetch settings and appeals
        const { data: settings } = await serverSupabase
          .from("business_hours_settings")
          .select("*");
        const { data: appeals } = await serverSupabase
          .from("business_hours_appeals_branch")
          .select("*");

        // Use our resolution logic:
        const approvedAppeal = (appeals || []).find((a: any) => a.branch_id === branchId && a.status === 'approved');
        const branchSetting = (settings || []).find((s: any) => s.scope === branchId);
        const globalSetting = (settings || []).find((s: any) => s.scope === 'global');

        let resolved = null;

        if (approvedAppeal && branchSetting && branchSetting.enabled) {
          resolved = {
            enabled: true,
            workdays: branchSetting.workdays,
            start_time: branchSetting.start_time,
            end_time: branchSetting.end_time
          };
        } else if (globalSetting) {
          if (globalSetting.enabled) {
            resolved = {
              enabled: true,
              workdays: globalSetting.workdays,
              start_time: globalSetting.start_time,
              end_time: globalSetting.end_time
            };
          } else {
            resolved = {
              enabled: false,
              workdays: "",
              start_time: "00:00",
              end_time: "23:59"
            };
          }
        } else if (branchSetting && branchSetting.enabled) {
          resolved = {
            enabled: true,
            workdays: branchSetting.workdays,
            start_time: branchSetting.start_time,
            end_time: branchSetting.end_time
          };
        }

        if (resolved) {
          isEnabled = resolved.enabled;
          const [sH, sM] = resolved.start_time.split(":").map(Number);
          const [eH, eM] = resolved.end_time.split(":").map(Number);
          startHour = sH;
          startMin = sM;
          endHour = eH;
          endMin = eM;
          daysActive = resolved.workdays.split(",").map((s: string) => s.trim()).filter(Boolean);
        }
      } catch (err) {
        console.error("Failed to query business hours from Supabase:", err);
      }
    }

    if (!isEnabled) {
      return { within: true, message: "" };
    }

    const d = new Date();
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Africa/Douala",
        weekday: "long",
        hour: "numeric",
        minute: "numeric",
        hour12: false,
      });
      const parts = formatter.formatToParts(d);
      let weekday = "";
      let hour = 0;
      let minute = 0;
      
      for (const part of parts) {
        if (part.type === "weekday") weekday = part.value;
        if (part.type === "hour") hour = parseInt(part.value, 10);
        if (part.type === "minute") minute = parseInt(part.value, 10);
      }
      
      const weekdaysOrdered = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const idx = weekdaysOrdered.findIndex(d => d.toLowerCase() === weekday.toLowerCase());
      const yesterdayWeekday = idx !== -1 ? weekdaysOrdered[(idx + 6) % 7] : "";

      const currentMins = hour * 60 + minute;
      const startMins = startHour * 60 + startMin;
      const endMins = endHour * 60 + endMin;

      let isWithinHours = false;
      let targetWeekday = weekday;

      if (endMins > startMins) {
        isWithinHours = currentMins >= startMins && currentMins < endMins;
        targetWeekday = weekday;
      } else {
        // Overnight case (endMins <= startMins)
        if (currentMins >= startMins) {
          isWithinHours = true;
          targetWeekday = weekday;
        } else if (currentMins < endMins) {
          isWithinHours = true;
          targetWeekday = yesterdayWeekday;
        } else {
          isWithinHours = false;
        }
      }

      const dayMatch = isWithinHours && daysActive.some((day: string) => day.toLowerCase() === targetWeekday.toLowerCase());
      
      return {
        within: dayMatch,
        message: `NGACCUL is open ${daysActive.join(", ")}, ${String(startHour).padStart(2, "0")}:${String(startMin).padStart(2, "0")}–${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")} (Africa/Douala). Please come back during business hours.`,
      };
    } catch (err) {
      const utcHour = d.getUTCHours();
      const doualaHour = (utcHour + 1) % 24;
      const utcDay = d.getUTCDay();
      let doualaDay = utcDay;
      if (utcHour === 23) {
        doualaDay = (utcDay + 1) % 7;
      }
      const isSunday = doualaDay === 0;
      const isOpen = doualaHour >= 8 && doualaHour < 16;
      
      return {
        within: !isSunday && isOpen,
        message: "NGACCUL is open Monday–Saturday, 8:00 AM–4:00 PM. Please come back during business hours.",
      };
    }
  }
  app.use(express.urlencoded({ extended: true }));

  // Initialize Server-side Supabase client using Service Role Key or Anon Key
  const serverSupabaseUrl = process.env.VITE_SUPABASE_URL || "";
  const serverSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

  let serverSupabase: any = null;
  if (serverSupabaseUrl && serverSupabaseKey) {
    try {
      serverSupabase = createClient(serverSupabaseUrl, serverSupabaseKey, {
        auth: { persistSession: false }
      });
      console.log(`[NGACCUL][Supabase Server Client] Initialized successfully. URL: ${serverSupabaseUrl}`);
    } catch (err) {
      console.error("[NGACCUL][Supabase Server Client] Failed to initialize:", err);
    }
  }

  const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "ngaccul-internal-dev-secret-2024";

  function requireInternalAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const token = req.headers["x-internal-token"];
    if (!token || token !== INTERNAL_API_SECRET) {
      return res.status(403).json({ error: "Forbidden: Missing or invalid internal token." });
    }
    next();
  }

  // Dual-auth for cron-triggered routes: accepts EITHER the same internal token used by
  // /api/db/* (for manual/local testing), OR the bearer token Vercel Cron automatically
  // sends as `Authorization: Bearer ${CRON_SECRET}` when it invokes a scheduled function
  // (see vercel.json -> "crons"). Vercel Cron never sends x-internal-token, so relying on
  // requireInternalAuth alone made this endpoint permanently 403 for real scheduled runs.
  function requireCronAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const internalToken = req.headers["x-internal-token"];
    if (internalToken && internalToken === INTERNAL_API_SECRET) {
      return next();
    }

    const cronSecret = process.env.CRON_SECRET || "";
    const authHeader = req.headers["authorization"] || "";
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      return next();
    }

    return res.status(403).json({ error: "Forbidden: Missing or invalid internal token / cron secret." });
  }

  function serverValidateID(
    docType: string | undefined,
    idNumber: string | undefined,
    issuedDateStr: string | undefined
  ): { success: boolean; expiry?: string; error?: string } {
    if (!idNumber) {
      return { success: true };
    }
    const sanitizedId = idNumber.trim();
    if (!docType) {
      return { success: false, error: "ID Card Fraud Prevention: ID document type is required." };
    }
    if (!issuedDateStr) {
      return { success: false, error: "ID Card Fraud Prevention: ID date of issuance is required." };
    }

    const issuedDate = new Date(issuedDateStr);
    if (isNaN(issuedDate.getTime())) {
      return { success: false, error: "ID Card Fraud Prevention: Invalid date of issuance format." };
    }

    const now = new Date();
    if (issuedDate > now) {
      return { success: false, error: "ID Card Fraud Prevention: ID date of issuance cannot be in the future." };
    }

    let expiryDate = new Date(issuedDate);
    if (docType === "card") {
      if (!/^\d{17}$/.test(sanitizedId)) {
        return { success: false, error: "ID Card Fraud Prevention: Cameroon Original CNI card must be exactly 17 numeric digits." };
      }
      expiryDate.setFullYear(expiryDate.getFullYear() + 10);
    } else if (docType === "receipt") {
      if (!/^[A-Za-z0-9]{19,20}$/.test(sanitizedId)) {
        return { success: false, error: "ID Card Fraud Prevention: Cameroon temporary CNI receipt must be exactly 19 or 20 alphanumeric characters." };
      }
      expiryDate.setMonth(expiryDate.getMonth() + 3);
    } else {
      return { success: false, error: "ID Card Fraud Prevention: Invalid document type. Must be 'card' or 'receipt'." };
    }

    if (expiryDate < now) {
      return { success: false, error: `ID Card Fraud Prevention: This ID document has expired (expired on ${expiryDate.toISOString().split('T')[0]}).` };
    }

    return { success: true, expiry: expiryDate.toISOString().split('T')[0] };
  }

  // Proxy endpoint to write (upsert) data to Supabase using server authority
  app.post("/api/db/upsert", requireInternalAuth, async (req, res) => {
    try {
      const { table, records } = req.body;
      if (!serverSupabase) {
        return res.status(503).json({ error: "Supabase not configured server-side" });
      }
      if (!table || !records || !Array.isArray(records)) {
        return res.status(400).json({ error: "Invalid request parameters (table or records missing/invalid)" });
      }

      // Secure Backend Business Hours Enforcement
      if (table === "transactions" || table === "loans") {
        for (const rec of records) {
          const actorId = rec.created_by;
          const { within, message } = await checkBusinessHoursServer(actorId);
          if (!within) {
            return res.status(400).json({ success: false, error: message });
          }
        }
      }
       if (table === "profiles") {
        for (const rec of records) {
          if (rec.national_id) {
            const val = serverValidateID(rec.national_id_document_type, rec.national_id, rec.national_id_issued_date);
            if (!val.success) {
              return res.status(400).json({ success: false, error: val.error });
            }
            rec.national_id_expiry = val.expiry;

            const sanitizedId = rec.national_id.trim();
            // Check for duplicates
            const { data: duplicateId } = await serverSupabase
              .from("profiles")
              .select("id, full_name")
              .eq("national_id", sanitizedId)
              .neq("id", rec.id)
              .maybeSingle();
            if (duplicateId) {
              return res.status(400).json({
                success: false,
                error: `ID Card Fraud Prevention: This National ID is already registered to ${duplicateId.full_name || "another member"}.`
              });
            }
          }

          if (rec.guarantor_id_number) {
            const val = serverValidateID(rec.guarantor_id_document_type, rec.guarantor_id_number, rec.guarantor_id_issued_date);
            if (!val.success) {
              return res.status(400).json({ success: false, error: `Guarantor: ${val.error}` });
            }
            rec.guarantor_id_expiry = val.expiry;
          }

          if (rec.role === "client") {
            // Only block client registrations by agents (indicated by recruited_by being present)
            const { data: existing } = await serverSupabase
              .from("profiles")
              .select("id")
              .eq("id", rec.id)
              .maybeSingle();
            if (!existing && rec.recruited_by) {
              const { within, message } = await checkBusinessHoursServer(rec.recruited_by);
              if (!within) {
                return res.status(400).json({
                  success: false,
                  error: message || "Outside business hours: Agent client registrations are restricted to resolved business hours.",
                });
              }
            }
          }

          const { data: existingProf } = await serverSupabase
            .from("profiles")
            .select("id")
            .eq("id", rec.id)
            .maybeSingle();

          if (!existingProf) {
            if (rec.branch_id && ["ngdl", "meig", "tiba", "tign"].includes(rec.branch_id) && ["agent", "branch_admin", "staff"].includes(rec.role)) {
              const { data: lockSetting } = await serverSupabase
                .from("subdivision_access_settings")
                .select("locked")
                .eq("branch_id", rec.branch_id)
                .maybeSingle();

              const isLocked = lockSetting ? lockSetting.locked !== false : true;
              if (isLocked) {
                return res.status(400).json({
                  success: false,
                  error: `Subdivision '${rec.branch_id.toUpperCase()}' is currently locked by PDG padlock. Unlock it with PIN before creating staff, BMs, or collectors.`
                });
              }
            }
          }
        }
      }

      if (table === "loan_guarantors") {
        for (const rec of records) {
          if (rec.national_id_number) {
            const val = serverValidateID(rec.national_id_document_type, rec.national_id_number, rec.national_id_issued_date);
            if (!val.success) {
              return res.status(400).json({ success: false, error: `Loan Guarantor: ${val.error}` });
            }
            rec.national_id_expiry = val.expiry;

            const sanitizedId = rec.national_id_number.trim();
            // Ensure guarantor is not the borrower
            const { data: loan } = await serverSupabase
              .from("loans")
              .select("client_id")
              .eq("id", rec.loan_id)
              .maybeSingle();
            if (loan && loan.client_id) {
              const { data: borrower } = await serverSupabase
                .from("profiles")
                .select("national_id")
                .eq("id", loan.client_id)
                .maybeSingle();
              if (borrower && borrower.national_id && borrower.national_id.trim() === sanitizedId) {
                return res.status(400).json({
                  success: false,
                  error: "ID Card Fraud Prevention: A borrower cannot act as their own guarantor."
                });
              }
            }
          }
        }
      }

      const { data, error } = table === "business_hours_settings"
        ? await serverSupabase.from(table).upsert(records, { onConflict: "scope" })
        : await serverSupabase.from(table).upsert(records);
      if (error) {
        console.error(`[Db Server Upsert Error] Table: ${table}, Message:`, error.message);
        return res.status(200).json({ success: false, error: error.message });
      }
      return res.json({ success: true, data });
    } catch (err: any) {
      console.error("[Db Server Upsert Exception]:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Proxy endpoint to select data from Supabase using server authority
  app.post("/api/db/select", requireInternalAuth, async (req, res) => {
    try {
      const { table, orderCol, orderAsc, eqFilters } = req.body;
      if (!serverSupabase) {
        return res.status(503).json({ success: false, error: "Supabase not configured server-side" });
      }
      if (!table) {
        return res.status(400).json({ success: false, error: "Table name is required" });
      }

      let query = serverSupabase.from(table).select("*");
      
      // Apply filters if provided
      if (eqFilters && typeof eqFilters === "object") {
        Object.entries(eqFilters).forEach(([key, val]) => {
          if (val !== undefined && val !== null) {
            query = query.eq(key, val);
          }
        });
      }

      if (orderCol) {
        query = query.order(orderCol, { ascending: orderAsc !== false });
      }

      let { data, error } = await query;
      if (error) {
        console.error(`[Db Server Select Error] Table: ${table}, Message:`, error.message);
        return res.status(200).json({ success: false, error: error.message });
      }

      if (table === "profiles" && Array.isArray(data)) {
        const now = Date.now();
        const isDataSaver = req.headers["x-data-saver"] === "true";
        data = data.map((p: any) => {
          let mapped = { ...p };
          if (p.role === "agent") {
            const lastHeartbeat = p.last_heartbeat_at ? new Date(p.last_heartbeat_at).getTime() : 0;
            if (!lastHeartbeat || now - lastHeartbeat > 60000) {
              mapped.presence_status = "offline";
            }
          }
          if (isDataSaver && mapped.photo_url) {
            mapped.photo_url = ""; // Strip heavy photo URLs to conserve payload bandwidth
          }
          return mapped;
        });
      }

      return res.json({ success: true, data });
    } catch (err: any) {
      console.error("[Db Server Select Exception]:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Proxy endpoint to update data using server authority under constraints
  app.post("/api/db/update", requireInternalAuth, async (req, res) => {
    try {
      const { table, updates, eqFilters } = req.body;
      if (!serverSupabase) {
        return res.status(503).json({ error: "Supabase not configured server-side" });
      }
      if (!table || !updates) {
        return res.status(400).json({ error: "Invalid parameters" });
      }

      // Enforce server-side ID validation on Update
      if (table === "profiles") {
        if (updates.national_id !== undefined && updates.national_id !== null && updates.national_id !== "") {
          const val = serverValidateID(updates.national_id_document_type, updates.national_id, updates.national_id_issued_date);
          if (!val.success) {
            return res.status(400).json({ success: false, error: val.error });
          }
          updates.national_id_expiry = val.expiry;
        }
        if (updates.guarantor_id_number !== undefined && updates.guarantor_id_number !== null && updates.guarantor_id_number !== "") {
          const val = serverValidateID(updates.guarantor_id_document_type, updates.guarantor_id_number, updates.guarantor_id_issued_date);
          if (!val.success) {
            return res.status(400).json({ success: false, error: `Guarantor: ${val.error}` });
          }
          updates.guarantor_id_expiry = val.expiry;
        }
      }

      if (table === "loan_guarantors") {
        if (updates.national_id_number !== undefined && updates.national_id_number !== null && updates.national_id_number !== "") {
          const val = serverValidateID(updates.national_id_document_type, updates.national_id_number, updates.national_id_issued_date);
          if (!val.success) {
            return res.status(400).json({ success: false, error: `Loan Guarantor: ${val.error}` });
          }
          updates.national_id_expiry = val.expiry;
        }
      }

      let query = serverSupabase.from(table).update(updates);
      if (eqFilters) {
        Object.entries(eqFilters).forEach(([key, val]) => {
          query = query.eq(key, val);
        });
      }
      const { data, error } = await query;
      if (error) {
        console.error(`[Db Server Update Error] Table: ${table}, Message:`, error.message);
        return res.status(200).json({ success: false, error: error.message });
      }
      return res.json({ success: true, data });
    } catch (err: any) {
      console.error("[Db Server Update Exception]:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Subdivision Access Padlock Unlock Endpoint
  app.post("/api/subdivision-access/unlock", requireInternalAuth, async (req, res) => {
    try {
      const { branch_id, pin, actor_id } = req.body;
      if (!branch_id || !pin) {
        return res.status(400).json({ success: false, error: "Missing branch_id or pin" });
      }
      const cleanBranch = String(branch_id).toLowerCase().trim();
      if (!["ngdl", "meig", "tiba", "tign"].includes(cleanBranch)) {
        return res.status(400).json({ success: false, error: "Invalid branch_id for subdivision access padlock" });
      }

      const pinStr = String(pin).trim();
      const hash = crypto.createHash("sha256").update(pinStr).digest("hex");

      const DEFAULT_HASHES: Record<string, string> = {
        ngdl: "a6ea08cf9c707b6bb1792f4a634306c714bb9dc5f9297756b80f80a7ddc2a7ed",
        meig: "00e6b849361111a6581e9b574d2bcdc30a799fedc14ae1beed20c9a4ce7dc3b3",
        tiba: "416126984ede4282c6da8a786baa984e6b609f49dad74dfbe3f5ae7a0b4a3c55",
        tign: "a59be0418c6dc2a4b58e03e3bf77a5cab6262c9d9ad4dbe04e65050a52f33b1f",
      };

      if (serverSupabase) {
        const { data: setting } = await serverSupabase
          .from("subdivision_access_settings")
          .select("*")
          .eq("branch_id", cleanBranch)
          .maybeSingle();

        const storedHash = setting?.pin_hash || DEFAULT_HASHES[cleanBranch];

        if (storedHash && storedHash === hash) {
          const { error: updErr } = await serverSupabase
            .from("subdivision_access_settings")
            .upsert({
              branch_id: cleanBranch,
              locked: false,
              pin_hash: storedHash,
              unlocked_by: actor_id || "pdg",
              unlocked_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });

          if (updErr) {
            console.error("[Subdivision Unlock DB Error]", updErr);
            return res.status(500).json({ success: false, error: "Failed to update lock status in DB" });
          }
          return res.json({ success: true });
        } else {
          return res.status(400).json({ success: false, error: "Invalid unlock PIN" });
        }
      } else {
        if (DEFAULT_HASHES[cleanBranch] === hash) {
          return res.json({ success: true });
        } else {
          return res.status(400).json({ success: false, error: "Invalid unlock PIN" });
        }
      }
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Server error during unlock" });
    }
  });

  // Subdivision Access Padlock Lock Endpoint
  app.post("/api/subdivision-access/lock", requireInternalAuth, async (req, res) => {
    try {
      const { branch_id } = req.body;
      if (!branch_id) {
        return res.status(400).json({ success: false, error: "Missing branch_id" });
      }
      const cleanBranch = String(branch_id).toLowerCase().trim();
      if (!["ngdl", "meig", "tiba", "tign"].includes(cleanBranch)) {
        return res.status(400).json({ success: false, error: "Invalid branch_id for subdivision access padlock" });
      }

      const DEFAULT_HASHES: Record<string, string> = {
        ngdl: "a6ea08cf9c707b6bb1792f4a634306c714bb9dc5f9297756b80f80a7ddc2a7ed",
        meig: "00e6b849361111a6581e9b574d2bcdc30a799fedc14ae1beed20c9a4ce7dc3b3",
        tiba: "416126984ede4282c6da8a786baa984e6b609f49dad74dfbe3f5ae7a0b4a3c55",
        tign: "a59be0418c6dc2a4b58e03e3bf77a5cab6262c9d9ad4dbe04e65050a52f33b1f",
      };

      if (serverSupabase) {
        const { data: setting } = await serverSupabase
          .from("subdivision_access_settings")
          .select("pin_hash")
          .eq("branch_id", cleanBranch)
          .maybeSingle();

        const hashToSave = setting?.pin_hash || DEFAULT_HASHES[cleanBranch];

        const { error: updErr } = await serverSupabase
          .from("subdivision_access_settings")
          .upsert({
            branch_id: cleanBranch,
            locked: true,
            pin_hash: hashToSave,
            updated_at: new Date().toISOString(),
          });

        if (updErr) {
          console.error("[Subdivision Lock DB Error]", updErr);
          return res.status(500).json({ success: false, error: "Failed to lock subdivision in DB" });
        }
      }
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Server error during lock" });
    }
  });

  // Campay Credentials & Environment
  const username = process.env.CAMPAY_APP_USERNAME || "";
  const password = process.env.CAMPAY_APP_PASSWORD || "";
  const env = process.env.CAMPAY_ENVIRONMENT || "sandbox"; // "sandbox" or "production"
  const isProd = env === "production";
  const apiBaseUrl = isProd ? "https://www.campay.net/api" : "https://demo.campay.net/api";

  console.log(`[NGACCUL][Campay Config] Mode: ${env}, BaseURL: ${apiBaseUrl}, Credentials: ${username ? "CONFIGURED" : "NOT CONFIGURED - Running simulated sandbox fallback"}`);

  // Feature flags for payment providers.
  // FuturaPay is the primary/default gateway for both MTN and Orange in production.
  // Campay is kept in the codebase as a fallback option (e.g. for local/dev testing)
  // but is not expected to have credentials configured in production.
  const paymentProviderMtn = process.env.PAYMENT_PROVIDER_MTN || "futurapay";
  const paymentProviderOrange = process.env.PAYMENT_PROVIDER_ORANGE || "futurapay";

  // FuturaPay configuration
  const futurapayMerchantKey = process.env.FUTURAPAY_MERCHANT_KEY || "";
  const futurapaySiteId = process.env.FUTURAPAY_SITE_ID || "";
  const futurapayApiKey = process.env.FUTURAPAY_API_KEY || "";
  const futurapayEnv = process.env.FUTURAPAY_ENVIRONMENT || "sandbox"; // "sandbox" or "production"
  const futurapayIsProd = futurapayEnv === "production";
  const futurapayApiBaseUrl = futurapayIsProd
    ? "https://api.futurapay.com"
    : "https://stage-api.futurapay.com";

  console.log(`[NGACCUL][FuturaPay Config] Mode: ${futurapayEnv}, BaseURL: ${futurapayApiBaseUrl}, Credentials: ${(futurapayMerchantKey && futurapaySiteId && futurapayApiKey) ? "CONFIGURED" : "NOT CONFIGURED - Running simulated sandbox fallback"}`);

  // Stateful in-memory tracker for simulated fallback transactions.
  // Shared across providers so authorize/status endpoints work regardless of
  // which provider originally created the simulated transaction.
  const simulatedTransactions = new Map<string, {
    status: string;
    amount: number;
    phoneNumber: string;
    createdAt: number;
    reference: string;
  }>();

  // Instantiate payment providers
  const futurapayProvider = new FuturaPayProvider(
    futurapayMerchantKey,
    futurapaySiteId,
    futurapayApiKey,
    futurapayApiBaseUrl,
    simulatedTransactions
  );
  const mtnDirectProvider = new MTNDirectProvider();
  const orangeDirectProvider = new OrangeDirectProvider();

  // Resolve the configured provider for a given payment method.
  // NOTE: unlike server.ts, this file keeps its existing Campay logic inline
  // (via getCampayToken + the /api/campay/* routes below) rather than as a
  // PaymentProvider class instance, since that's how it already worked here
  // and we don't want to touch the working Campay routes. So PAYMENT_PROVIDER_MTN
  // / PAYMENT_PROVIDER_ORANGE = "campay" isn't supported through this generic
  // router in this file — use the dedicated /api/campay/collect route directly
  // for that. futurapay is, and remains, the default for both methods.
  function getProviderForMethod(paymentMethod?: string): PaymentProvider {
    const cleanMethod = (paymentMethod || "").toLowerCase().trim();
    if (cleanMethod === "mtn" && paymentProviderMtn === "mtn_direct") return mtnDirectProvider;
    if (cleanMethod === "orange" && paymentProviderOrange === "orange_direct") return orangeDirectProvider;
    // Default fallback (and the only supported path for "campay" override here)
    return futurapayProvider;
  }

  // 1. GET Campay config status
  app.get("/api/campay/config", (req, res) => {
    res.json({
      configured: !!(username && password),
      environment: env,
      simulated: !(username && password)
    });
  });

  // FuturaPay diagnostic config endpoint (mirrors /api/campay/config) so you can
  // hit one URL and instantly see CONFIGURED/NOT CONFIGURED + environment,
  // without digging through Vercel function logs.
  app.get("/api/futurapay/config", (req, res) => {
    res.json({
      configured: !!(futurapayMerchantKey && futurapaySiteId && futurapayApiKey),
      environment: futurapayEnv,
      simulated: !(futurapayMerchantKey && futurapaySiteId && futurapayApiKey)
    });
  });

  // Helper to fetch authentication token from Campay
  async function getCampayToken(): Promise<string> {
    if (!username || !password) {
      throw new Error("Missing Campay credentials");
    }

    const res = await fetch(`${apiBaseUrl}/token/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        app_username: username,
        app_password: password
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to request token from Campay: ${res.statusText} - ${errText}`);
    }

    const data = await res.json() as any;
    return data.token || data.access_token || data.access || "";
  }

  // 2. POST /api/campay/collect - Trigger Mobile Money/USSD deposit collection
  app.post("/api/campay/collect", async (req, res) => {
    try {
      const { amount, phoneNumber, description, externalReference } = req.body;

      if (!amount || !phoneNumber) {
        return res.status(400).json({ error: "Missing amount or phone receipt/number parameter" });
      }

      // Format phoneNumber (Ensure Cameroonian 237 prefix)
      let formattedPhone = phoneNumber.replace(/\s+/g, "").replace(/\+/g, "");
      if (!formattedPhone.startsWith("237")) {
        // Assume Cameroonian number missing code if length is 9
        if (formattedPhone.length === 9) {
          formattedPhone = "237" + formattedPhone;
        }
      }

      const cleanAmount = Number(amount);
      const refId = externalReference || `TX_${Date.now()}`;

      // A. If credentials are empty, run the simulated stateful fallback
      if (!username || !password) {
        console.log(`[NGACCUL][Simulated Campay] Registering pending collect transaction: Reference=${refId}, Amount=${cleanAmount}, Phone=${formattedPhone}`);
        simulatedTransactions.set(refId, {
          status: "PENDING",
          amount: cleanAmount,
          phoneNumber: formattedPhone,
          createdAt: Date.now(),
          reference: refId
        });

        // Autoconvert to success in 12 seconds in simulated flow to mimic user approving on their phone
        setTimeout(() => {
          const txObj = simulatedTransactions.get(refId);
          if (txObj) {
            txObj.status = "SUCCESSFUL";
            simulatedTransactions.set(refId, txObj);
            console.log(`[NGACCUL][Simulated Campay] Transaction autocomplete: Reference=${refId} status changed to SUCCESSFUL`);
          }
        }, 12000);

        return res.json({
          reference: refId,
          status: "PENDING",
          simulated: true,
          message: "USSD push request simulated successfully."
        });
      }

      // B. Real Campay API Call
      const token = await getCampayToken();
      
      const payload = {
        amount: cleanAmount.toString(),
        from: formattedPhone,
        description: description || "Ngaoundéré Cooperative Member Deposit",
        external_reference: refId,
        currency: "XAF"
      };

      console.log(`[NGACCUL][Campay API Request] URL: ${apiBaseUrl}/collect/ Payload:`, payload);

      const collectRes = await fetch(`${apiBaseUrl}/collect/`, {
        method: "POST",
        headers: {
          "Authorization": `Token ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!collectRes.ok) {
        const errorText = await collectRes.text();
        console.error(`[NGACCUL][Campay HTTP Error] Code: ${collectRes.status}`, errorText);
        return res.status(collectRes.status).json({
          error: "Campay service returned an error during collect registration",
          details: errorText
        });
      }

      const collectData = await collectRes.json() as any;
      console.log(`[NGACCUL][Campay API Success Response]`, collectData);

      return res.json({
        reference: collectData.reference || refId,
        status: collectData.status || "PENDING",
        simulated: false,
        raw: collectData
      });

    } catch (err: any) {
      console.error("[NGACCUL][Campay Router Exception]", err);
      return res.status(500).json({ error: "Exception caught in collect endpoint", details: err.message });
    }
  });

  // 3. GET /api/campay/status/:reference - Check the status of a collect transaction
  app.get("/api/campay/status/:reference", async (req, res) => {
    try {
      const { reference } = req.params;

      if (!reference) {
        return res.status(400).json({ error: "Missing transaction reference query identifier" });
      }

      // Check simulatedTransactions first
      if (simulatedTransactions.has(reference)) {
        const simTx = simulatedTransactions.get(reference)!;
        return res.json({
          reference: simTx.reference,
          status: simTx.status,
          simulated: true,
          amount: simTx.amount
        });
      }

      // If credentials are empty but no simulator transaction exists, send standard status
      if (!username || !password) {
        return res.json({
          reference: reference,
          status: "SUCCESSFUL", // Default fallback if reference is queried out of typical simulator lifecycle
          simulated: true
        });
      }

      // Real Campay Status Call
      const token = await getCampayToken();
      console.log(`[NGACCUL][Campay Status Check] Querying reference ${reference}`);

      const statusRes = await fetch(`${apiBaseUrl}/transaction/${reference}/`, {
        method: "GET",
        headers: {
          "Authorization": `Token ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!statusRes.ok) {
        const errText = await statusRes.text();
        console.error(`[NGACCUL][Campay Status HTTP Error]`, errText);
        return res.status(statusRes.status).json({
          error: "Failed to check transaction status with Campay Gateway",
          details: errText
        });
      }

      const statusData = await statusRes.json() as any;
      console.log(`[NGACCUL][Campay Status Fetch OK]`, statusData);

      return res.json({
        reference: statusData.reference,
        status: statusData.status || "PENDING", // PENDING, SUCCESSFUL, FAILED
        simulated: false,
        raw: statusData
      });

    } catch (err: any) {
      console.error("[NGACCUL][Campay Status Check Exception]", err);
      return res.status(500).json({ error: "Exception caught in status check", details: err.message });
    }
  });

  // 4. POST /api/campay/authorize/:reference - Manually authorize simulated transaction
  app.post("/api/campay/authorize/:reference", (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Unauthorized: Sandbox manual bypass is restricted in production builds." });
    }
    try {
      const { reference } = req.params;
      if (simulatedTransactions.has(reference)) {
        const txObj = simulatedTransactions.get(reference)!;
        txObj.status = "SUCCESSFUL";
        simulatedTransactions.set(reference, txObj);
        console.log(`[NGACCUL][Simulated Campay] Transaction manually authorized via UI bypass: Reference=${reference}`);
        return res.json({ success: true, status: "SUCCESSFUL" });
      }
      // If it doesn't exist, create it as SUCCESSFUL (e.g. ad-hoc fallback)
      simulatedTransactions.set(reference, {
        status: "SUCCESSFUL",
        amount: 5,
        phoneNumber: "237677000000",
        createdAt: Date.now(),
        reference: reference
      });
      return res.json({ success: true, status: "SUCCESSFUL", message: "Created on the fly as successful" });
    } catch (err: any) {
      console.error("[NGACCUL][Campay Simulation Authorization Failure]", err);
      return res.status(500).json({ error: "Authorization error", details: err.message });
    }
  });

  // 5. POST /api/payments/collect - Generic payment collection routing endpoint
  // (ported from server.ts). This is what the client frontend actually calls for
  // deposits, and it was previously 404ing/missing on this Vercel deployment.
  app.post("/api/payments/collect", async (req, res) => {
    try {
      const { amount, phoneNumber, description, externalReference, paymentMethod } = req.body;

      if (!amount || !phoneNumber) {
        return res.status(400).json({ error: "Missing amount or phone receipt/number parameter" });
      }

      // Secure Backend Business Hours Enforcement
      const { within, message } = await checkBusinessHoursServer(req.body.created_by || req.body.actorId);
      if (!within) {
        return res.status(400).json({ error: message });
      }

      // Resolve configured provider for this payment method (falls back to FuturaPay)
      const provider = getProviderForMethod(paymentMethod);
      console.log(`[NGACCUL][Payments] Routing collect request for method "${paymentMethod || 'default'}" via provider "${provider.id}"`);

      const result = await provider.collect(amount, phoneNumber, description, externalReference, paymentMethod);
      return res.json(result);

    } catch (err: any) {
      console.error("[NGACCUL][Payments Router Exception]", err);
      return res.status(500).json({ error: err.message || "Exception caught in collect endpoint" });
    }
  });

  // 6. GET /api/payments/status/:reference - Check status from configured payment provider
  app.get("/api/payments/status/:reference", async (req, res) => {
    try {
      const { reference } = req.params;
      const paymentMethod = req.query.paymentMethod as string || "mtn";

      if (!reference) {
        return res.status(400).json({ error: "Missing transaction reference query identifier" });
      }

      const provider = getProviderForMethod(paymentMethod);
      console.log(`[NGACCUL][Payments] Routing status check for reference "${reference}" (method: "${paymentMethod}") via provider "${provider.id}"`);

      const result = await provider.getStatus(reference);
      return res.json(result);

    } catch (err: any) {
      console.error("[NGACCUL][Payments Status Check Exception]", err);
      return res.status(500).json({ error: err.message || "Exception caught in status check" });
    }
  });

  // AI-Powered Receipt Fraud Prevention endpoint
  app.post("/api/fraud/verify-receipt", async (req, res) => {
    try {
      const { imageBase64, mimeType, enteredAmount, paymentMethod } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ success: false, error: "No receipt image provided." });
      }

      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY") {
        // If no API key is set, fallback to a secure validation simulation to prevent app blocking
        console.warn("[Fraud Prevention] GEMINI_API_KEY is not configured. Simulating secure verification.");
        const mockRef = "TXN-" + Math.floor(Math.random() * 900000 + 100000);
        return res.json({
          success: true,
          simulated: true,
          reference: mockRef,
          amount: enteredAmount ? Number(enteredAmount) : 5000,
          date: new Date().toISOString(),
          confidenceScore: 0.95,
          provider: paymentMethod || "mtn",
          message: "Receipt securely processed and matched (Simulated verification active)."
        });
      }

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const prompt = `You are a strict, professional anti-fraud auditor for NGACCUL, a financial cooperative in Cameroon.
Analyze this mobile money receipt image (MTN Mobile Money, Orange Money, or banking transfer receipt).
You must extract the following exact details and output them in a strict JSON format only.

Details to extract:
1. "is_valid_receipt": boolean (true only if this is a genuine financial payment receipt or mobile money transaction screenshot. If it is a completely unrelated photo or a blank screen, set to false).
2. "transaction_reference": string (the unique transaction reference ID, transaction ID, or TxID. Examples for Cameroon MoMo: "I2023...", "MP2...", "172...", or a long digit string. Do not include spaces).
3. "amount": number (the exact transfer or payment amount in FCFA/XAF. If the receipt says 5000, extract 5000 as a number. No commas or text).
4. "date": string (the transaction date and time in YYYY-MM-DD HH:MM:SS format or ISO format if possible, or any clean readable format).
5. "provider": "mtn" | "orange" | "other" (the payment carrier or method).
6. "confidence_score": number (between 0.0 and 1.0 representing your confidence in the authenticity of this receipt image).
7. "fraud_flag": boolean (true if you detect signs of digital tampering, mismatched numbers, photos of screens instead of clean screenshots, or other anomalies).

Return ONLY a valid JSON object matching this schema:
{
  "is_valid_receipt": boolean,
  "transaction_reference": string,
  "amount": number,
  "date": string,
  "provider": string,
  "confidence_score": number,
  "fraud_flag": boolean,
  "reasons_or_anomalies": string
}

Ensure absolutely no markdown wrapper like \`\`\`json outside the response - just return raw stringified JSON that can be parsed directly.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          prompt,
          {
            inlineData: {
              data: imageBase64,
              mimeType: mimeType || "image/jpeg"
            }
          }
        ]
      });

      const responseText = response.text ? response.text.trim() : "";
      console.log("[Fraud Prevention] Gemini Response text:", responseText);

      // Clean the response from markdown blocks if any
      let cleanedText = responseText;
      if (cleanedText.startsWith("```")) {
        cleanedText = cleanedText.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      }

      let parsedResult;
      try {
        parsedResult = JSON.parse(cleanedText);
      } catch (e) {
        console.error("[Fraud Prevention] Failed to parse Gemini response as JSON:", responseText);
        throw new Error("Could not parse receipt verification details.");
      }

      if (!parsedResult.is_valid_receipt) {
        return res.json({
          success: false,
          error: "The uploaded image is not recognized as a valid mobile money or transfer receipt. Please upload a clear screenshot of the transaction receipt."
        });
      }

      if (parsedResult.fraud_flag) {
        return res.json({
          success: false,
          error: `Potential receipt manipulation/fraud detected: ${parsedResult.reasons_or_anomalies || "Mismatched or altered text detected."}`
        });
      }

      // Check for amount mismatch
      if (enteredAmount && Math.abs(Number(enteredAmount) - Number(parsedResult.amount)) > 1) {
        return res.json({
          success: false,
          error: `Receipt Amount Mismatch: The receipt amount is ${parsedResult.amount.toLocaleString()} FCFA, but you entered ${Number(enteredAmount).toLocaleString()} FCFA. Please check the amount.`
        });
      }

      // Duplicate receipt prevention - Check if transaction reference is already in Supabase
      if (parsedResult.transaction_reference && serverSupabase) {
        const { data: existingTx } = await serverSupabase
          .from("transactions")
          .select("id")
          .eq("payment_ref", parsedResult.transaction_reference)
          .maybeSingle();

        if (existingTx) {
          return res.json({
            success: false,
            error: `Receipt Reuse Fraud Blocked: This payment receipt reference (${parsedResult.transaction_reference}) has already been uploaded and processed for another deposit.`
          });
        }
      }

      return res.json({
        success: true,
        reference: parsedResult.transaction_reference,
        amount: parsedResult.amount,
        date: parsedResult.date,
        confidenceScore: parsedResult.confidence_score,
        provider: parsedResult.provider,
        message: "Receipt verified and matched successfully."
      });

    } catch (err: any) {
      console.error("[Fraud Prevention] Receipt Verification Exception:", err);
      return res.status(500).json({ success: false, error: err.message || "An error occurred while verifying the receipt." });
    }
  });

  // Server-side reconciliation: mirrors handleCampayNotification() / applyTxToBalance()
  // from src/services/db.ts, but writes straight to Supabase instead of the browser's
  // local MockDatabase cache. This is what lets a payment confirm even if nobody has
  // the app open (webhook-driven, and also reusable by a scheduled/cron sweep).
  //
  // Deliberately NOT ported here: commission ledger entries and audit_log rows.
  // Commission is computed dynamically (getCommissionLedger() in db.ts derives it
  // live from confirmed `transactions` rows), so updating the transaction's status
  // is sufficient - no separate ledger write needed. audit_log.actor_id is a NOT NULL
  // FK to profiles(id), and the client's "NGC-SYSTEM" sentinel actor isn't a real
  // profile row, so writing that here would just throw; skipped to avoid masking
  // real reconciliation failures behind an unrelated FK error.
  async function reconcileFuturaPayTransaction(
    reference: string,
    normalizedStatus: "SUCCESSFUL" | "FAILED" | "PENDING"
  ): Promise<{ reconciled: boolean; reason: string }> {
    if (!serverSupabase) {
      return { reconciled: false, reason: "supabase_not_configured" };
    }
    if (normalizedStatus === "PENDING") {
      return { reconciled: false, reason: "still_pending" };
    }

    try {
      const { data: tx, error: fetchErr } = await serverSupabase
        .from("transactions")
        .select("*")
        .eq("payment_ref", reference)
        .maybeSingle();

      if (fetchErr) {
        console.error(`[NGACCUL][Reconcile] Lookup error for reference "${reference}":`, fetchErr.message);
        return { reconciled: false, reason: "lookup_error" };
      }
      if (!tx) {
        return { reconciled: false, reason: "transaction_not_found" };
      }
      if (tx.status !== "pending" && tx.status !== "rejected") {
        // Already reconciled (previous webhook delivery, cron sweep, or the
        // frontend poll got there first) - nothing left to do.
        return { reconciled: false, reason: "already_processed" };
      }

      const nowIso = new Date().toISOString();

      if (normalizedStatus === "SUCCESSFUL") {
        // Atomic-ish guard: only flips rows still "pending" or "rejected" (cancelled by user), 
        // so a concurrent webhook redelivery or cron sweep can't double-credit the balance.
        const { data: updatedRows, error: updErr } = await serverSupabase
          .from("transactions")
          .update({ status: "confirmed", confirmed_at: nowIso })
          .eq("id", tx.id)
          .in("status", ["pending", "rejected"])
          .select();

        if (updErr) {
          console.error(`[NGACCUL][Reconcile] Update error for tx "${tx.id}":`, updErr.message);
          return { reconciled: false, reason: "update_error" };
        }
        if (!updatedRows || updatedRows.length === 0) {
          return { reconciled: false, reason: "already_processed_race" };
        }

        const { data: existingBalance } = await serverSupabase
          .from("client_balances")
          .select("*")
          .eq("client_id", tx.client_id)
          .maybeSingle();

        let balance = existingBalance ? Number(existingBalance.balance) : 0;
        let totalDeposits = existingBalance ? Number(existingBalance.total_deposits) : 0;
        let totalWithdrawals = existingBalance ? Number(existingBalance.total_withdrawals) : 0;

        if (tx.type === "deposit") {
          balance += Number(tx.amount);
          totalDeposits += Number(tx.amount);
        } else if (tx.type === "withdrawal") {
          balance -= Number(tx.amount);
          totalWithdrawals += Number(tx.amount);
        }

        const { error: balErr } = await serverSupabase.from("client_balances").upsert({
          client_id: tx.client_id,
          branch_id: tx.branch_id,
          balance,
          total_deposits: totalDeposits,
          total_withdrawals: totalWithdrawals,
          updated_at: nowIso,
        });
        if (balErr) {
          console.error(`[NGACCUL][Reconcile] Balance upsert error for client "${tx.client_id}":`, balErr.message);
          // Transaction is already confirmed at this point; log loudly so it's not silently lost,
          // but don't report reconciled:false (the status flip is the source of truth and did commit).
        }

        const { error: notifErr } = await serverSupabase.from("notifications").insert({
          branch_id: tx.branch_id,
          recipient_id: tx.client_id,
          type: "deposit_confirmed",
          title: "Savings Balance Confirmed",
          body: `Your Mobile Money deposit of ${Number(tx.amount).toLocaleString()} FCFA was successfully processed!`,
          reference_id: tx.id,
          is_read: false,
        });
        if (notifErr) {
          console.error(`[NGACCUL][Reconcile] Notification insert error for tx "${tx.id}":`, notifErr.message);
        }

        console.log(`[NGACCUL][Reconcile] Confirmed deposit tx "${tx.id}" (reference "${reference}") - balance updated for client "${tx.client_id}".`);
        return { reconciled: true, reason: "confirmed" };
      }

      // FAILED
      if (tx.status === "rejected") {
        return { reconciled: false, reason: "already_rejected" };
      }
      const { data: updatedRows, error: updErr } = await serverSupabase
        .from("transactions")
        .update({ status: "rejected", rejection_reason: "Payment rejected or failed." })
        .eq("id", tx.id)
        .eq("status", "pending")
        .select();

      if (updErr) {
        console.error(`[NGACCUL][Reconcile] Update error for tx "${tx.id}":`, updErr.message);
        return { reconciled: false, reason: "update_error" };
      }
      if (!updatedRows || updatedRows.length === 0) {
        return { reconciled: false, reason: "already_processed_race" };
      }

      const { error: notifErr } = await serverSupabase.from("notifications").insert({
        branch_id: tx.branch_id,
        recipient_id: tx.client_id,
        type: "deposit_disputed",
        title: "Mobile Money Payment Failed",
        body: `Your Mobile Money deposit of ${Number(tx.amount).toLocaleString()} FCFA has failed or was cancelled.`,
        reference_id: tx.id,
        is_read: false,
      });
      if (notifErr) {
        console.error(`[NGACCUL][Reconcile] Notification insert error for tx "${tx.id}":`, notifErr.message);
      }

      console.log(`[NGACCUL][Reconcile] Marked failed deposit tx "${tx.id}" (reference "${reference}") as rejected.`);
      return { reconciled: true, reason: "rejected" };
    } catch (err: any) {
      console.error(`[NGACCUL][Reconcile] Exception reconciling reference "${reference}":`, err);
      return { reconciled: false, reason: "exception" };
    }
  }

  // 7. POST /api/webhooks/futurapay - Receives async payment status notifications from FuturaPay.
  // Configure this URL (https://<your-vercel-domain>/api/webhooks/futurapay) in the FuturaPay
  // merchant dashboard under Settings > Configurations. This is a supplement to, not a
  // replacement for, the polling done via /api/payments/status/:reference, and (unlike the
  // frontend poll) it works even if nobody has the app open.
  app.post("/api/webhooks/futurapay", async (req, res) => {
    try {
      const payload = req.body || {};
      const transactionId = payload.transaction_id || payload.customer_transaction_id || "";
      const status = payload.status || "";

      console.log(`[NGACCUL][FuturaPay Webhook] Received notification for transaction "${transactionId}": status="${status}"`, payload);

      if (!transactionId) {
        return res.status(400).json({ error: "Invalid payload: missing transaction identifier." });
      }

      const normalizedStatus: "SUCCESSFUL" | "FAILED" | "PENDING" =
        status === "success" ? "SUCCESSFUL" : status === "failed" || status === "cancelled" ? "FAILED" : "PENDING";

      // If this reference belongs to a simulated transaction, reflect the update there too.
      if (simulatedTransactions.has(transactionId)) {
        const txObj = simulatedTransactions.get(transactionId)!;
        txObj.status = normalizedStatus;
        simulatedTransactions.set(transactionId, txObj);
      }

      const result = await reconcileFuturaPayTransaction(transactionId, normalizedStatus);
      console.log(`[NGACCUL][FuturaPay Webhook] Reconciliation result for "${transactionId}":`, result);

      return res.status(200).json({ received: true, ...result });
    } catch (err: any) {
      console.error("[NGACCUL][FuturaPay Webhook Exception]", err);
      return res.status(500).json({ error: err.message || "Webhook processing error" });
    }
  });

  // 8. GET /api/cron/reconcile-payments - Scheduled safety-net sweep for pending mobile
  // money deposits. Actively re-checks each pending transaction against FuturaPay's own
  // status API (rather than waiting on a webhook delivery), so reconciliation still
  // happens even if the webhook is misconfigured, delayed, or dropped by the network.
  // Protect with the same internal token used by /api/db/*; wire this URL into Vercel
  // Cron (vercel.json -> "crons") pointing here on a schedule, e.g. every 5 minutes.
  app.get("/api/cron/reconcile-payments", requireCronAuth, async (req, res) => {
    if (!serverSupabase) {
      return res.status(503).json({ error: "Supabase not configured server-side" });
    }
    try {
      // Only sweep pending or rejected DEPOSITS made via a mobile-money reference. Withdrawals also sit
      // at status="pending" with payment_method "mtn"/"orange", but their payment_ref holds
      // the client's phone number (not a FuturaPay transaction reference) — see
      // createClientDirectDeposit / requestWithdrawal in src/services/db.ts. Calling
      // provider.getStatus() with a phone number instead of a real reference would
      // incorrectly mark a legitimate pending withdrawal as failed, so `type` is filtered too.
      const { data: pending, error } = await serverSupabase
        .from("transactions")
        .select("id, payment_ref, payment_method, type, amount, client_id, branch_id, created_at")
        .in("status", ["pending", "rejected"])
        .eq("type", "deposit")
        .in("payment_method", ["mtn", "orange"])
        .not("payment_ref", "is", null);

      if (error) {
        console.error("[NGACCUL][Cron Reconcile] Query error:", error.message);
        return res.status(500).json({ error: error.message });
      }

      const results: any[] = [];
      for (const tx of pending || []) {
        try {
          const paymentMethod = tx.payment_method === "orange" ? "orange" : "mtn";
          const provider = getProviderForMethod(paymentMethod);
          const statusResult = await provider.getStatus(tx.payment_ref);
          const normalized = statusResult.status as "SUCCESSFUL" | "FAILED" | "PENDING";
          const outcome = await reconcileFuturaPayTransaction(tx.payment_ref, normalized);
          results.push({ reference: tx.payment_ref, providerStatus: statusResult.status, ...outcome });
        } catch (innerErr: any) {
          console.error(`[NGACCUL][Cron Reconcile] Failed to check reference "${tx.payment_ref}":`, innerErr.message);
          results.push({ reference: tx.payment_ref, reconciled: false, reason: "check_exception" });
        }
      }

      console.log(`[NGACCUL][Cron Reconcile] Swept ${(pending || []).length} pending transaction(s), ${results.filter(r => r.reconciled).length} reconciled.`);
      return res.json({ checked: (pending || []).length, results });
    } catch (err: any) {
      console.error("[NGACCUL][Cron Reconcile Exception]", err);
      return res.status(500).json({ error: err.message || "Cron reconciliation error" });
    }
  });

  // Helper for SMS Gateway Integration (Africa's Talking by default)
  async function sendSmsGateway(phone: string, message: string): Promise<{ success: boolean; simulated: boolean; raw?: any }> {
    const smsApiKey = process.env.SMS_GATEWAY_API_KEY || "";
    const smsUsername = process.env.SMS_GATEWAY_USERNAME || "";
    const senderId = process.env.SMS_SENDER_ID || "NGACCUL";

    if (!smsApiKey) {
      console.log(`\n======================================================`);
      console.log(`[SMS Simulation Mode] To: ${phone}`);
      console.log(`Message: ${message}`);
      console.log(`======================================================\n`);
      return { success: true, simulated: true };
    }

    try {
      const response = await fetch("https://api.africastalking.com/version1/messaging", {
        method: "POST",
        headers: {
          "apiKey": smsApiKey,
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json"
        },
        body: new URLSearchParams({
          username: smsUsername,
          to: phone.startsWith("+") ? phone : `+237${phone}`,
          message,
          from: senderId
        })
      });

      const data = await response.json();
      return { success: true, simulated: false, raw: data };
    } catch (err: any) {
      console.error("[SMS Send Gateway Exception]", err);
      throw err;
    }
  }

  // POST /api/sms/send - Securely dispatch standard alerts
  app.post("/api/sms/send", async (req, res) => {
    try {
      const { phone, message } = req.body;
      if (!phone || !message) {
        return res.status(400).json({ error: "Missing phone or message" });
      }

      const result = await sendSmsGateway(phone, message);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to send SMS", details: err.message });
    }
  });

  // Stateful OTP cache for Multi-Factor Authentication Verification Flow
  const otpStore = new Map<string, { otp: string; expiresAt: number }>();

  // 5. POST /api/otp/send - Generate and store secure OTP server-side & dispatch with real SMS
  app.post("/api/otp/send", async (req, res) => {
    try {
      const { phoneNumber, amount } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ error: "Missing phoneNumber parameter" });
      }

      // Generate a secure 6-digit random code
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes TTL

      otpStore.set(phoneNumber, { otp, expiresAt });

      const amountText = amount ? ` for ${Number(amount).toLocaleString()} FCFA` : "";
      const smsMessage = `${otp} is your NGACCUL verification code${amountText}. Valid for 5 minutes.`;

      const result = await sendSmsGateway(phoneNumber, smsMessage);

      return res.json({
        success: true,
        message: "OTP generated and dispatched successfully.",
        simulated: result.simulated,
        simulated_otp: otp
      });
    } catch (e: any) {
      console.error("[NGACCUL][OTP Send Error]", e);
      return res.status(500).json({ error: "Internal server error during OTP send", details: e.message });
    }
  });

  // 6. POST /api/otp/verify - Validate OTP code securely query-time
  app.post("/api/otp/verify", (req, res) => {
    try {
      const { phoneNumber, otp } = req.body;
      if (!phoneNumber || !otp) {
        return res.status(400).json({ error: "Missing phoneNumber or otp parameters" });
      }

      const record = otpStore.get(phoneNumber);
      if (!record) {
        return res.status(400).json({ success: false, error: "No pending verification code found for this phone number." });
      }

      if (Date.now() > record.expiresAt) {
        otpStore.delete(phoneNumber);
        return res.status(400).json({ success: false, error: "Verification code expired. Please request a new OTP." });
      }

      if (record.otp !== otp.toString().trim()) {
        return res.status(400).json({ success: false, error: "Incorrect verification code. Please try again." });
      }

      // Successful verification! Delete from store to prevent replay attacks
      otpStore.delete(phoneNumber);

      return res.json({
        success: true,
        message: "OTP successfully verified."
      });
    } catch (e: any) {
      console.error("[NGACCUL][OTP Verify Error]", e);
      return res.status(500).json({ error: "Internal server error during OTP verification", details: e.message });
    }
  });

  // Serve static UI React assets or use Vite dev server middleware
  // Vercel serves static files via CDN — no static middleware needed here
  return app;
}

if (!process.env.VERCEL) {
  start().then(appInstance => {
    appInstance?.listen(PORT, "0.0.0.0", () => {
      console.log(`[NGACCUL][App System Server] Running on http://0.0.0.0:${PORT}`);
    });
  }).catch((e) => {
    console.error("[NGACCUL][Fatal] uncaught startup error:", e);
  });
}

const appPromise = start();

export default async function handler(req: any, res: any) {
  const app = await appPromise;
  return app(req, res);
}
