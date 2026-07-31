export type PaymentErrorCode =
  | "INSUFFICIENT_BALANCE"
  | "BELOW_MINIMUM"
  | "ABOVE_MAXIMUM"
  | "USSD_REJECTED"
  | "GATEWAY_TIMEOUT"
  | "CONFIG_ERROR"
  | "GATEWAY_ERROR"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export interface ClassifiedPaymentError {
  code: PaymentErrorCode;
  title: string;
  message: string;
}

export function classifyPaymentError(raw: string | undefined): ClassifiedPaymentError {
  const s = (raw || "").toLowerCase();

  if (s.includes("insufficient") || s.includes("low balance") || s.includes("not enough")) {
    return {
      code: "INSUFFICIENT_BALANCE",
      title: "Insufficient Mobile Money Balance",
      message: "Your mobile money wallet doesn't have enough funds to complete this deposit. Top up your wallet and try again.",
    };
  }
  if (s.includes("enter amount between") || s.includes("minimum") || s.includes("412")) {
    return {
      code: "BELOW_MINIMUM",
      title: "Amount Too Low",
      message: "The amount you entered is below the minimum this payment method allows. Please enter a larger amount and try again.",
    };
  }
  if (s.includes("rejected") || s.includes("cancelled") || s.includes("canceled") || s.includes("declined")) {
    return {
      code: "USSD_REJECTED",
      title: "Payment Not Authorized",
      message: "The USSD PIN prompt was rejected, cancelled, or timed out on your phone. Verify your PIN and try again.",
    };
  }
  if (s.includes("timeout") || s.includes("expired")) {
    return {
      code: "GATEWAY_TIMEOUT",
      title: "Confirmation Delayed",
      message: "We didn't receive a confirmation in time. If your PIN was approved, this deposit will still confirm automatically shortly — check your transaction history in a few minutes before retrying.",
    };
  }
  if (
    s.includes("merchant_key") ||
    s.includes("merchant key") ||
    s.includes("invalid credentials") ||
    s.includes("unprocessable content") ||
    s.includes("validation failed")
  ) {
    return {
      code: "CONFIG_ERROR",
      title: "Payment Method Temporarily Unavailable",
      message: "This payment option is temporarily unavailable. Please try a different payment method, or contact support if the problem continues.",
    };
  }
  if (s.includes("500") || s.includes("failed to") || s.includes("gateway")) {
    return {
      code: "GATEWAY_ERROR",
      title: "Payment Service Unavailable",
      message: "We couldn't reach the mobile money payment service. This is usually temporary — please wait a moment and try again.",
    };
  }
  if (s.includes("network") || s.includes("fetch")) {
    return {
      code: "NETWORK_ERROR",
      title: "Connection Problem",
      message: "Please check your internet connection and try again.",
    };
  }
  return {
    code: "UNKNOWN",
    title: "Deposit Failed",
    message: "Something went wrong processing this deposit. Please verify your details and try again.",
  };
}
