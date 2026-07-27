"use strict";

const ALLOWED_APP_ENVS = new Set(["development", "staging", "production"]);
const ALLOWED_PRODUCT_TYPE = "ar_unlock";
const ALLOWED_AR_WORK_STATUS = new Set(["ready", "retouched"]);
const AR_UNLOCK_AMOUNT = 9.9;
const AR_UNLOCK_CURRENCY = "CNY";

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

function createOrderId() {
  return `order-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function buildPaymentParams() {
  return {
    mode: "mock"
  };
}

function isPayableWork(work) {
  return Boolean(work && work.status !== "deleted" && ALLOWED_AR_WORK_STATUS.has(work.status));
}

function buildWorkSnapshot(work) {
  return {
    petName: normalizeString(work.petName || work.displayName) || "当前宠物作品",
    previewImage: normalizeString(work.previewImage || work.imageUrl),
    status: normalizeString(work.status)
  };
}

function toOrderResponse(order, work) {
  return {
    ok: true,
    orderId: order.orderId,
    workId: order.workId,
    productType: order.productType,
    amount: order.amount,
    currency: order.currency,
    status: order.status,
    paymentStatus: order.paymentStatus,
    entitlementStatus: order.entitlementStatus || "none",
    entitlementId: order.entitlementId || "",
    paymentProvider: order.paymentProvider,
    paymentMode: order.paymentMode,
    paymentConfirmationSource: order.paymentConfirmationSource || "",
    paymentParams: order.paymentParams,
    workSnapshot: order.workSnapshot || buildWorkSnapshot(work),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt || order.createdAt
  };
}

function expectedError(error) {
  return {
    ok: false,
    status: error.status || "error",
    errorCode: error.errorCode,
    message: error.message
  };
}

function createPaymentOrderHandler({
  cloud,
  db,
  serverEnv = process.env,
  now = () => new Date(),
  createOrderId: createOrderIdDependency = createOrderId,
  logger = console
}) {
  const orders = db.collection("orders");
  const works = db.collection("works");
  const arEntitlements = db.collection("arEntitlements");

  return async function createPaymentOrder(event = {}) {
    try {
      const appEnv = getServerAppEnv(serverEnv);
      if (appEnv === "production") {
        throw new BusinessError("REAL_PAYMENT_NOT_IMPLEMENTED", "真实微信支付尚未接入，当前环境不能创建支付订单");
      }

      const context = cloud.getWXContext();
      const openid = normalizeString(context && context.OPENID);
      const workId = normalizeString(event.workId);
      const productType = normalizeString(event.productType);

      if (!openid) {
        throw new BusinessError("OPENID_REQUIRED", "订单创建失败，请稍后重试");
      }
      if (!workId) {
        throw new BusinessError("WORK_ID_REQUIRED", "当前作品信息缺失，请返回后重试");
      }
      if (productType !== ALLOWED_PRODUCT_TYPE) {
        throw new BusinessError("INVALID_PRODUCT_TYPE", "暂不支持该支付项目");
      }

      const workResult = await works.where({
        ownerOpenid: openid,
        workId
      }).limit(1).get();
      const work = workResult.data && workResult.data[0];

      if (!work || work.status === "deleted") {
        throw new BusinessError("WORK_NOT_FOUND", "作品不存在或已删除，请返回作品页刷新后重试");
      }
      if (!isPayableWork(work)) {
        throw new BusinessError("WORK_STATUS_NOT_PAYABLE", "当前作品状态暂不能解锁 AR 权益");
      }

      const entitlementResult = await arEntitlements.where({
        openid,
        workId,
        status: "active"
      }).limit(1).get();
      if (entitlementResult.data && entitlementResult.data[0]) {
        throw new BusinessError("AR_ALREADY_UNLOCKED", "当前作品已解锁 AR 权益，无需重复支付", "already_unlocked");
      }

      const pendingResult = await orders.where({
        openid,
        workId,
        productType,
        status: "pending"
      }).limit(1).get();
      const pendingOrder = pendingResult.data && pendingResult.data[0];
      const transactionNow = now();
      const workSnapshot = buildWorkSnapshot(work);

      if (pendingOrder) {
        if (pendingOrder.paymentMode && pendingOrder.paymentMode !== "mock") {
          throw new BusinessError("REAL_PAYMENT_ORDER_CONFLICT", "已有真实支付订单不能转换为 Mock 订单");
        }

        const normalizedPendingOrder = {
          ...pendingOrder,
          amount: AR_UNLOCK_AMOUNT,
          currency: AR_UNLOCK_CURRENCY,
          paymentStatus: "pending",
          entitlementStatus: pendingOrder.entitlementStatus || "none",
          entitlementId: pendingOrder.entitlementId || "",
          paymentProvider: "mock",
          paymentMode: "mock",
          paymentConfirmationSource: "",
          providerTransactionId: "",
          providerConfirmedAt: null,
          providerPayloadDigest: "",
          paymentParams: buildPaymentParams(),
          workSnapshot,
          updatedAt: transactionNow
        };
        const {
          _id,
          ...patch
        } = normalizedPendingOrder;
        await orders.doc(pendingOrder._id).update({
          data: patch
        });
        return toOrderResponse(normalizedPendingOrder, work);
      }

      const orderId = createOrderIdDependency();
      const orderDoc = {
        _id: orderId,
        orderId,
        openid,
        workId,
        productType,
        amount: AR_UNLOCK_AMOUNT,
        currency: AR_UNLOCK_CURRENCY,
        status: "pending",
        paymentStatus: "pending",
        entitlementStatus: "none",
        entitlementId: "",
        paymentProvider: "mock",
        paymentMode: "mock",
        paymentConfirmationSource: "",
        providerTransactionId: "",
        providerConfirmedAt: null,
        providerPayloadDigest: "",
        paymentParams: buildPaymentParams(),
        workSnapshot,
        createdAt: transactionNow,
        updatedAt: transactionNow,
        paidAt: null,
        cancelledAt: null,
        failedAt: null
      };

      await orders.add({
        data: orderDoc
      });
      return toOrderResponse(orderDoc, work);
    } catch (error) {
      if (error && error.isBusinessError) {
        return expectedError(error);
      }
      logger.error("createPaymentOrder failed", {
        errorCode: "CREATE_PAYMENT_ORDER_FAILED",
        message: error && error.message ? error.message : String(error)
      });
      return {
        ok: false,
        status: "error",
        errorCode: "CREATE_PAYMENT_ORDER_FAILED",
        message: "订单创建失败，请稍后重试"
      };
    }
  };
}

module.exports = {
  ALLOWED_PRODUCT_TYPE,
  AR_UNLOCK_AMOUNT,
  AR_UNLOCK_CURRENCY,
  BusinessError,
  buildPaymentParams,
  createPaymentOrderHandler,
  getServerAppEnv,
  isPayableWork
};
