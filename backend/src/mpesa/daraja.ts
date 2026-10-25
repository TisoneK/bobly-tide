// Daraja (M-Pesa) client. The engine/service depend on the DarajaClient
// interface; FakeDarajaClient drives tests and local dev, HttpDarajaClient
// talks to the real sandbox. No secret values live in code — the HTTP client
// is configured from env (see backend/.env.example).

export interface StkPushParams {
  /** Whole shillings. */
  amount: number;
  /** Payer MSISDN, e.g. 2547XXXXXXXX. */
  phone: string;
  accountRef: string;
  description?: string;
}
export interface StkPushResult {
  checkoutRequestId: string;
  merchantRequestId: string;
  responseCode: string;
}

export interface B2CParams {
  amount: number;
  phone: string;
  /** Our local reference, echoed back so we can match the result callback. */
  occasionRef: string;
  remarks?: string;
}
export interface B2CResult {
  conversationId: string;
  originatorConversationId: string;
  responseCode: string;
}

export interface DarajaClient {
  stkPush(p: StkPushParams): Promise<StkPushResult>;
  b2c(p: B2CParams): Promise<B2CResult>;
}

/**
 * Deterministic in-memory client for tests and credential-less local dev.
 * Records every call and returns an accepted (ResponseCode '0') result; it
 * never delivers callbacks — callers simulate those by POSTing to the
 * callback endpoints, exactly as Daraja would.
 */
export class FakeDarajaClient implements DarajaClient {
  readonly stkCalls: StkPushParams[] = [];
  readonly b2cCalls: B2CParams[] = [];
  private seq = 0;

  async stkPush(p: StkPushParams): Promise<StkPushResult> {
    this.stkCalls.push(p);
    const n = ++this.seq;
    return {
      checkoutRequestId: `ws_CO_fake_${n}`,
      merchantRequestId: `mr_fake_${n}`,
      responseCode: '0',
    };
  }

  async b2c(p: B2CParams): Promise<B2CResult> {
    this.b2cCalls.push(p);
    const n = ++this.seq;
    return {
      conversationId: `AG_fake_${n}`,
      originatorConversationId: p.occasionRef,
      responseCode: '0',
    };
  }
}

export interface DarajaConfig {
  baseUrl: string; // https://sandbox.safaricom.co.ke
  consumerKey: string;
  consumerSecret: string;
  shortcode: string; // Lipa na M-Pesa / paybill
  passkey: string;
  stkCallbackUrl: string;
  // B2C
  b2cShortcode: string;
  initiatorName: string;
  securityCredential: string;
  b2cResultUrl: string;
  b2cTimeoutUrl: string;
}

function eatTimestamp(d: Date): string {
  // Daraja wants YYYYMMDDHHmmss in East Africa Time (UTC+3).
  const eat = new Date(d.getTime() + 3 * 3600_000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${eat.getUTCFullYear()}${p(eat.getUTCMonth() + 1)}${p(eat.getUTCDate())}` +
    `${p(eat.getUTCHours())}${p(eat.getUTCMinutes())}${p(eat.getUTCSeconds())}`
  );
}

/**
 * Real Daraja client (sandbox or production). Implemented per the Daraja
 * docs; exercised against the sandbox, not by the unit suite. Credentials
 * come from config (env), never from code.
 */
export class HttpDarajaClient implements DarajaClient {
  constructor(
    private readonly config: DarajaConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async token(): Promise<string> {
    const basic = Buffer.from(`${this.config.consumerKey}:${this.config.consumerSecret}`).toString('base64');
    const res = await this.fetchImpl(`${this.config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${basic}` },
    });
    if (!res.ok) throw new Error(`Daraja OAuth failed: ${res.status}`);
    const body = (await res.json()) as { access_token: string };
    return body.access_token;
  }

  async stkPush(p: StkPushParams): Promise<StkPushResult> {
    const token = await this.token();
    const timestamp = eatTimestamp(this.now());
    const password = Buffer.from(`${this.config.shortcode}${this.config.passkey}${timestamp}`).toString('base64');
    const res = await this.fetchImpl(`${this.config.baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: this.config.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: p.amount,
        PartyA: p.phone,
        PartyB: this.config.shortcode,
        PhoneNumber: p.phone,
        CallBackURL: this.config.stkCallbackUrl,
        AccountReference: p.accountRef,
        TransactionDesc: p.description ?? 'Bobly Tide top-up',
      }),
    });
    const body = (await res.json()) as {
      CheckoutRequestID?: string;
      MerchantRequestID?: string;
      ResponseCode?: string;
      errorMessage?: string;
    };
    if (!res.ok || body.ResponseCode !== '0' || !body.CheckoutRequestID) {
      throw new Error(`Daraja STK push rejected: ${body.errorMessage ?? body.ResponseCode ?? res.status}`);
    }
    return {
      checkoutRequestId: body.CheckoutRequestID,
      merchantRequestId: body.MerchantRequestID ?? '',
      responseCode: body.ResponseCode,
    };
  }

  async b2c(p: B2CParams): Promise<B2CResult> {
    const token = await this.token();
    const res = await this.fetchImpl(`${this.config.baseUrl}/mpesa/b2c/v1/paymentrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        InitiatorName: this.config.initiatorName,
        SecurityCredential: this.config.securityCredential,
        CommandID: 'BusinessPayment',
        Amount: p.amount,
        PartyA: this.config.b2cShortcode,
        PartyB: p.phone,
        Remarks: p.remarks ?? 'Bobly Tide withdrawal',
        QueueTimeOutURL: this.config.b2cTimeoutUrl,
        ResultURL: this.config.b2cResultUrl,
        Occasion: p.occasionRef,
      }),
    });
    const body = (await res.json()) as {
      ConversationID?: string;
      OriginatorConversationID?: string;
      ResponseCode?: string;
      errorMessage?: string;
    };
    if (!res.ok || body.ResponseCode !== '0' || !body.ConversationID) {
      throw new Error(`Daraja B2C rejected: ${body.errorMessage ?? body.ResponseCode ?? res.status}`);
    }
    return {
      conversationId: body.ConversationID,
      originatorConversationId: body.OriginatorConversationID ?? p.occasionRef,
      responseCode: body.ResponseCode,
    };
  }
}
