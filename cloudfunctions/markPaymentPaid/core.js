"use strict";

const ALLOWED_APP_ENVS = new Set(["development", "staging", "production"]);
const ALLOWED_PRODUCT_TYPE = "ar_unlock";
const ALLOWED_AR_WORK_STATUS = new Set(["ready", "retouched"]);
const AR_UNLOCK_AMOUNT = 9.9;
const AR_UNLOCK_CURRENCY = "CNY";
const TRUSTED_MOCK_CONFIRMATION_SOURCE = "trusted_mock_flow";

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

function unwrapTransactionResult(value) {
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "result")) {
    return value.result;
  }
  return value;
}

function expectedError(error) {
  return {
    ok: false,
    status: error.status || "error",
    errorCode: error.errorCode,
    message: error.message
  };
}

function validateMockOrder(order) {
  if (order.productType !== ALLOWED_PRODUCT_TYPE) {
    throw new BusinessError("INVALID_PRODUCT_TYPE", "暂不支持该支付项目");
  }
  if (order.paymentMode !== "mock" || order.paymentProvider !== "mock") {
    throw new BusinessError("PAYMENT_CONFIRMATION_SOURCE_INVALID", "当前订单不能通过 Mock 支付确认");
  }
  if (order.amount !== AR_UNLOCK_AMOUNT || order.currency !== AR_UNLOCK_CURRENCY) {
    throw new BusinessError("ORDER_PRODUCT_CONFIG_MISMATCH", "订单金额或币种与商品配置不一致");
  }
}

function toPaidResponse(order) {
  return {
    ok: true,
    orderId: order.orderId,
    workId: order.workId,
    productType: order.productType,
    amount: order.amount,
    currency: order.currency,
    status: "paid",
    paymentStatus: "paid",
    paymentProvider: order.paymentProvider,
    paymentMode: order.paymentMode,
    paymentConfirmationSource: order.paymentConfirmationSource,
    entitlementStatus: order.entitlementStatus || "pending_sync",
    entitlementId: order.entitlementId || "",
    providerTransactionId: order.providerTransactionId || "",
    providerConfirmedAt: order.providerConfirmedAt,
    paidAt: order.paidAt,
    updatedAt: order.updatedAt,
    workSnapshot: order.workSnapshot || null
  };
}

function createMarkPaymentPaidHandler({
  cloud,
  db,
  serverEnv = process.env,
  now = () => new Date(),
  logger = console
}) {
  return async function markPaymentPaid(event = {}) {
    const context = cloud.getWXContext();
    const openid = normalizeString(context && context.OPENID);
    const orderId = normalizeString(event.orderId);
    const workId = normalizeString(event.workId);

    try {
      const appEnv = getServerAppEnv(serverEnv);
      if (appEnv === "production") {
        throw new BusinessError("MOCK_PAYMENT_NOT_ALLOWED", "生产环境禁止客户端确认 Mock 支付");
      }
      if (!openid) {
        throw new BusinessError("OPENID_REQUIRED", "支付状态确认失败，请稍后重试");
      }
      if (!orderId || !workId) {
        throw new BusinessError("ORDER_INFO_REQUIRED", "订单信息缺失，请返回后重试");
      }

      const preflightOrderResult = await db.collection("orders").doc(orderId).get();
      const preflightOrder = preflightOrderResult.data || null;
      if (!preflightOrder || preflightOrder.openid !== openid || preflightOrder.orderId !== orderId) {
        throw new BusinessError("ORDER_NOT_FOUND", "订单不存在，请重新发起支付");
      }
      if (preflightOrder.workId !== workId) {
        throw new BusinessError("ORDER_WORK_MISMATCH", "订单与当前作品不匹配");
      }

      const ownedWorkResult = await db.collection("works").where({
        ownerOpenid: openid,
        workId
      }).limit(1).get();
      const ownedWork = ownedWorkResult.data && ownedWorkResult.data[0];
      if (!ownedWork || !ownedWork._id) {
        throw new BusinessError("WORK_NOT_FOUND", "作品不存在或已删除，请返回作品页刷新后重试");
      }

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

        validateMockOrder(order);

        if (order.status === "paid" || order.paymentStatus === "paid") {
          if (
            order.status !== "paid" ||
            order.paymentStatus !== "paid" ||
            order.paymentConfirmationSource !== TRUSTED_MOCK_CONFIRMATION_SOURCE
          ) {
            throw new BusinessError("PAYMENT_CONFIRMATION_SOURCE_INVALID", "订单缺少可信支付确认来源");
          }
          return toPaidResponse(order);
        }
        if (order.status !== "pending" || order.paymentStatus !== "pending") {
          throw new BusinessError("ORDER_STATUS_NOT_PAYABLE", "当前订单状态不能确认支付，请重新发起支付", order.status || "failed");
        }

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

        const transactionNow = now();
        const paidOrder = {
          ...order,
          status: "paid",
          paymentStatus: "paid",
          entitlementStatus: order.entitlementStatus === "active" ? "active" : "pending_sync",
          paymentConfirmationSource: TRUSTED_MOCK_CONFIRMATION_SOURCE,
          providerTransactionId: "",
          providerConfirmedAt: transactionNow,
          providerPayloadDigest: "",
          paidAt: transactionNow,
          updatedAt: transactionNow
        };
        await orderRef.update({
          data: {
            status: paidOrder.status,
            paymentStatus: paidOrder.paymentStatus,
            entitlementStatus: paidOrder.entitlementStatus,
            paymentConfirmationSource: paidOrder.paymentConfirmationSource,
            providerTransactionId: paidOrder.providerTransactionId,
            providerConfirmedAt: paidOrder.providerConfirmedAt,
            providerPayloadDigest: paidOrder.providerPayloadDigest,
            paidAt: paidOrder.paidAt,
            updatedAt: paidOrder.updatedAt
          }
        });
        return toPaidResponse(paidOrder);
      });

      return unwrapTransactionResult(transactionResult);
    } catch (error) {
      if (error && error.isBusinessError) {
        return expectedError(error);
      }
      logger.error("markPaymentPaid failed", {
        functionName: "markPaymentPaid",
        orderId,
        workId,
        errorCode: "MARK_PAYMENT_PAID_FAILED",
        message: error && error.message ? error.message : String(error)
      });
      return {
        ok: false,
        status: "error",
        errorCode: "MARK_PAYMENT_PAID_FAILED",
        message: "支付状态确认失败，请稍后重试"
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
  createMarkPaymentPaidHandler,
  getServerAppEnv,
  isPayableWork,
  toPaidResponse,
  validateMockOrder
};
