"use strict";

const ALLOWED_APP_ENVS = new Set(["development", "staging", "production"]);
const ALLOWED_PRODUCT_TYPE = "ar_unlock";
const ALLOWED_AR_WORK_STATUS = new Set(["ready", "retouched"]);
const AR_UNLOCK_AMOUNT = 9.9;
const AR_UNLOCK_CURRENCY = "CNY";
const TRUSTED_MOCK_CONFIRMATION_SOURCE = "trusted_mock_flow";
const TRUSTED_WECHAT_CONFIRMATION_SOURCE = "wechat_server_notification";

class BusinessError extends Error {
  constructor(errorCode, message, status = "error") {
    super(message);
    this.name = "BusinessError";
    this.errorCode = errorCode;
    this.status = status;
    this.isBusinessError = true;
  }
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createSafeDocId(prefix, key) {
  const encoded = Buffer.from(key).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${prefix}_${encoded}`;
}

function getEntitlementDocId(openid, workId) {
  return createSafeDocId("ar_entitlement", `${openid}:${workId}`);
}

function createEntitlementId() {
  return `entitlement-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function getServerAppEnv(serverEnv = process.env) {
  const value = normalizeString(serverEnv && serverEnv.PETMATE_APP_ENV);
  if (!ALLOWED_APP_ENVS.has(value)) {
    throw new BusinessError("SERVER_ENV_INVALID", "支付服务环境配置缺失或无效");
  }
  return value;
}

function isPayableWork(work) {
  return Boolean(work && work.status !== "deleted" && ALLOWED_AR_WORK_STATUS.has(work.status));
}

function expectedError(error) {
  return {
    ok: false,
    status: error.status || "error",
    errorCode: error.errorCode,
    message: error.message
  };
}

function withoutId(doc) {
  const data = {
    ...doc
  };
  delete data._id;
  return data;
}

function unwrapTransactionResult(value) {
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "result")) {
    return value.result;
  }
  return value;
}

function validateTrustedPayment(order, appEnv) {
  if (order.status !== "paid" || order.paymentStatus !== "paid") {
    throw new BusinessError("ORDER_NOT_PAID", "订单尚未支付成功，不能发放 AR 权益", "not_paid");
  }
  if (order.amount !== AR_UNLOCK_AMOUNT || order.currency !== AR_UNLOCK_CURRENCY) {
    throw new BusinessError("ORDER_PRODUCT_CONFIG_MISMATCH", "订单金额或币种与商品配置不一致");
  }

  if (order.paymentMode === "mock" && order.paymentProvider === "mock") {
    if (appEnv === "production") {
      throw new BusinessError("MOCK_PAYMENT_NOT_ALLOWED", "生产环境禁止基于 Mock 支付发放权益");
    }
    if (
      order.paymentConfirmationSource !== TRUSTED_MOCK_CONFIRMATION_SOURCE ||
      normalizeString(order.providerTransactionId) ||
      !order.providerConfirmedAt
    ) {
      throw new BusinessError("PAYMENT_CONFIRMATION_SOURCE_INVALID", "订单缺少可信 Mock 支付确认来源");
    }
    return "mock";
  }

  if (order.paymentMode === "real" && order.paymentProvider === "wechat") {
    throw new BusinessError(
      "REAL_PAYMENT_CONFIRMATION_NOT_IMPLEMENTED",
      "真实微信支付服务端通知确认尚未接入，暂不能发放权益"
    );
  }

  throw new BusinessError("PAYMENT_CONFIRMATION_SOURCE_INVALID", "订单支付确认来源不可信");
}

function toEntitlementResponse(entitlement) {
  return {
    ok: true,
    hasEntitlement: true,
    entitlement: {
      entitlementId: entitlement.entitlementId,
      workId: entitlement.workId,
      orderId: entitlement.orderId,
      productType: entitlement.productType,
      status: entitlement.status,
      ownerOpenid: entitlement.ownerOpenid || entitlement.openid || "",
      activatedAt: entitlement.activatedAt,
      expiresAt: entitlement.expiresAt || null
    }
  };
}

function createGrantArEntitlementHandler({
  cloud,
  db,
  serverEnv = process.env,
  now = () => new Date(),
  createEntitlementId: createEntitlementIdDependency = createEntitlementId,
  logger = console
}) {
  return async function grantArEntitlement(event = {}) {
    const context = cloud.getWXContext();
    const openid = normalizeString(context && context.OPENID);
    const orderId = normalizeString(event.orderId);
    const workId = normalizeString(event.workId);

    try {
      const appEnv = getServerAppEnv(serverEnv);
      if (!openid) {
        throw new BusinessError("OPENID_REQUIRED", "AR 权益发放失败，请稍后重试");
      }
      if (!orderId || !workId) {
        throw new BusinessError("ENTITLEMENT_INFO_REQUIRED", "权益发放信息缺失，请稍后重试");
      }

      const preflightOrderResult = await db.collection("orders").doc(orderId).get();
      const preflightOrder = preflightOrderResult.data || null;
      if (!preflightOrder || preflightOrder.openid !== openid || preflightOrder.orderId !== orderId) {
        throw new BusinessError("ORDER_NOT_FOUND", "订单不存在，请重新发起支付");
      }
      if (preflightOrder.workId !== workId) {
        throw new BusinessError("ORDER_WORK_MISMATCH", "订单与当前作品不匹配");
      }
      if (preflightOrder.productType !== ALLOWED_PRODUCT_TYPE) {
        throw new BusinessError("INVALID_PRODUCT_TYPE", "暂不支持该支付项目");
      }
      validateTrustedPayment(preflightOrder, appEnv);

      const ownedWorkResult = await db.collection("works").where({
        ownerOpenid: openid,
        workId
      }).limit(1).get();
      const ownedWork = ownedWorkResult.data && ownedWorkResult.data[0];
      if (!ownedWork || !ownedWork._id) {
        throw new BusinessError("WORK_NOT_FOUND", "作品不存在或已删除，请返回作品页刷新后重试");
      }

      const legacyEntitlementResult = await db.collection("arEntitlements").where({
        openid,
        workId
      }).limit(1).get();
      const legacyEntitlementCandidate = legacyEntitlementResult.data && legacyEntitlementResult.data[0];

      const transactionResult = await db.runTransaction(async (transaction) => {
        const orderRef = transaction.collection("orders").doc(orderId);
        const orderResult = await orderRef.get();
        const order = orderResult.data || null;

        if (!order || order.openid !== openid || order.orderId !== orderId) {
          throw new BusinessError("ORDER_NOT_FOUND", "订单不存在，请重新发起支付");
        }
        if (order.workId !== workId) {
          throw new BusinessError("ORDER_WORK_MISMATCH", "订单与当前作品不匹配");
        }
        if (order.productType !== ALLOWED_PRODUCT_TYPE) {
          throw new BusinessError("INVALID_PRODUCT_TYPE", "暂不支持该支付项目");
        }

        validateTrustedPayment(order, appEnv);

        const workResult = await transaction.collection("works").doc(ownedWork._id).get();
        const work = workResult.data || null;
        if (
          !work ||
          work.ownerOpenid !== openid ||
          work.workId !== workId ||
          work.status === "deleted"
        ) {
          throw new BusinessError("WORK_NOT_FOUND", "作品不存在或已删除，请返回作品页刷新后重试");
        }
        if (!isPayableWork(work)) {
          throw new BusinessError("WORK_STATUS_NOT_PAYABLE", "当前作品状态暂不能解锁 AR 权益");
        }

        const deterministicRef = transaction.collection("arEntitlements").doc(getEntitlementDocId(openid, workId));
        const deterministicResult = await deterministicRef.get();
        let existing = deterministicResult.data || null;

        if (
          !existing &&
          legacyEntitlementCandidate &&
          legacyEntitlementCandidate._id !== getEntitlementDocId(openid, workId)
        ) {
          const legacyResult = await transaction
            .collection("arEntitlements")
            .doc(legacyEntitlementCandidate._id)
            .get();
          existing = legacyResult.data || null;
        }

        if (
          existing &&
          (
            normalizeString(existing.openid || existing.ownerOpenid) !== openid ||
            existing.workId !== workId
          )
        ) {
          throw new BusinessError("AR_ENTITLEMENT_CONFLICT", "现有 AR 权益与当前作品不匹配");
        }

        const transactionNow = now();
        let entitlement = existing;

        if (!existing || existing.status !== "active") {
          entitlement = {
            _id: existing ? existing._id : getEntitlementDocId(openid, workId),
            entitlementId: existing && existing.entitlementId
              ? existing.entitlementId
              : createEntitlementIdDependency(),
            openid,
            ownerOpenid: openid,
            workId,
            orderId,
            productType: ALLOWED_PRODUCT_TYPE,
            status: "active",
            activatedAt: transactionNow,
            expiresAt: null,
            createdAt: existing && existing.createdAt ? existing.createdAt : transactionNow,
            updatedAt: transactionNow
          };
          const entitlementRef = transaction.collection("arEntitlements").doc(entitlement._id);
          if (existing) {
            await entitlementRef.update({
              data: withoutId(entitlement)
            });
          } else {
            await entitlementRef.set({
              data: withoutId(entitlement)
            });
          }
        }

        await orderRef.update({
          data: {
            entitlementStatus: "active",
            entitlementId: entitlement.entitlementId,
            updatedAt: transactionNow
          }
        });
        return toEntitlementResponse(entitlement);
      });

      return unwrapTransactionResult(transactionResult);
    } catch (error) {
      if (error && error.isBusinessError) {
        return expectedError(error);
      }
      logger.error("grantArEntitlement failed", {
        functionName: "grantArEntitlement",
        orderId,
        workId,
        errorCode: "GRANT_AR_ENTITLEMENT_FAILED",
        message: error && error.message ? error.message : String(error)
      });
      return {
        ok: false,
        status: "error",
        errorCode: "GRANT_AR_ENTITLEMENT_FAILED",
        message: "AR 权益发放失败，请稍后重试"
      };
    }
  };
}

module.exports = {
  ALLOWED_PRODUCT_TYPE,
  AR_UNLOCK_AMOUNT,
  AR_UNLOCK_CURRENCY,
  BusinessError,
  TRUSTED_MOCK_CONFIRMATION_SOURCE,
  TRUSTED_WECHAT_CONFIRMATION_SOURCE,
  createGrantArEntitlementHandler,
  createSafeDocId,
  getEntitlementDocId,
  getServerAppEnv,
  toEntitlementResponse,
  validateTrustedPayment
};
