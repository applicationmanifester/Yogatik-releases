/**
 * Yogatik License Server — Refactored
 *
 * Key improvements over original index.js:
 * - Transaction-based account creation (eliminates race condition)
 * - Middleware pipeline for auth, rate limiting, validation
 * - Config-driven constants via Remote Config / environment
 * - Structured logging with request IDs
 * - Schema validation for webhook payloads (Zod)
 * - Persistent IP cache using Firestore with TTL
 * - Idempotency keys for webhook processing
 * - TypeScript with strict mode
 */
export declare const license: import("firebase-functions/v2/https").HttpsFunction;
export declare const createSubscription: import("firebase-functions/v2/https").HttpsFunction;
export declare const verifyPayment: import("firebase-functions/v2/https").HttpsFunction;
export declare const paddleWebhook: import("firebase-functions/v2/https").HttpsFunction;
export declare const razorpayWebhook: import("firebase-functions/v2/https").HttpsFunction;
//# sourceMappingURL=index.d.ts.map