"use strict";

const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const orders = db.collection("orders");
const works = db.collection("works");
const arEntitlements = db.collection("arEntitlements");

const ALLOWED_PRODUCT_TYPE = "ar_unlock";
const ALLOWED_AR_WORK_STATUS = ["ready", "retouched"];
const AR_UNLOCK_AMOUNT = 9.9;
const AR_UNLOCK_CURRENCY = "CNY";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createOrderId() {
  return `order-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function fail(error, message, errorCode = "CREATE_PAYMENT_ORDER_FAILED") {
  console.error("createPaymentOrder failed", error);
  return {
    ok: false,
    status: "error",
    errorCode,
    message
  };
}

function expectedError(errorCode, message, status = "error") {
  return {
    ok: false,
    status,
    errorCode,
    message
  };
}

function isPayableWork(work) {
  return work && work.status !== "deleted" && ALLOWED_AR_WORK_STATUS.includes(work.status);
}

function buildWorkSnapshot(work) {
  return {
    petName: normalizeString(work.petName || work.displayName) || "当前宠物作品",
    previewImage: normalizeString(work.previewImage || work.imageUrl),
    status: normalizeString(work.status)
  };
}

function buildPaymentParams() {
  return {
    mode: "mock",
    timeStamp: "",
    nonceStr: "",
    package: "",
    signType: "RSA",
    paySign: ""
  };
}

function normalizeOrderResponse(order, work) {
  return {
    ok: true,
    orderId: order.orderId,
    workId: order.workId,
    productType: order.productType,
    amount: order.amount || AR_UNLOCK_AMOUNT,
    currency: order.currency || AR_UNLOCK_CURRENCY,
    status: order.status || "pending",
    paymentStatus: order.paymentStatus || order.status || "pending",
    entitlementStatus: order.entitlementStatus || "none",
    entitlementId: order.entitlementId || "",
    paymentParams: order.paymentParams || buildPaymentParams(),
    workSnapshot: order.workSnapshot || buildWorkSnapshot(work),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt || order.createdAt
  };
}

async function getOwnedWork(openid, workId) {
  const result = await works
    .where({
      ownerOpenid: openid,
      workId
    })
    .limit(1)
    .get();

  return result.data && result.data[0];
}

async function getActiveEntitlement(openid, workId) {
  const result = await arEntitlements
    .where({
      openid,
      workId,
      status: "active"
    })
    .limit(1)
    .get();

  return result.data && result.data[0];
}

async function getPendingOrder(openid, workId, productType) {
  const result = await orders
    .where({
      openid,
      workId,
      productType,
      status: "pending"
    })
    .limit(1)
    .get();

  return result.data && result.data[0];
}

async function normalizeExistingPendingOrder(order, work) {
  const patch = {};
  const workSnapshot = buildWorkSnapshot(work);

  if (order.amount !== AR_UNLOCK_AMOUNT) {
    patch.amount = AR_UNLOCK_AMOUNT;
  }

  if (order.currency !== AR_UNLOCK_CURRENCY) {
    patch.currency = AR_UNLOCK_CURRENCY;
  }

  if (!order.entitlementStatus) {
    patch.entitlementStatus = "none";
  }

  if (!order.paymentStatus) {
    patch.paymentStatus = "pending";
  }

  if (!order.paymentParams) {
    patch.paymentParams = buildPaymentParams();
  }

  if (!order.workSnapshot) {
    patch.workSnapshot = workSnapshot;
  }

  if (Object.keys(patch).length > 0) {
    patch.updatedAt = new Date();
    await orders.doc(order._id).update({
      data: patch
    });
  }

  return {
    ...order,
    ...patch,
    workSnapshot: order.workSnapshot || workSnapshot
  };
}

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();
    const workId = normalizeString(event.workId);
    const productType = normalizeString(event.productType);

    if (!OPENID) {
      return fail(new Error("OPENID is required"), "订单创建失败，请稍后重试。", "OPENID_REQUIRED");
    }

    if (!workId) {
      return fail(new Error("workId is required"), "当前作品信息缺失，请返回后重试。", "WORK_ID_REQUIRED");
    }

    if (productType !== ALLOWED_PRODUCT_TYPE) {
      return fail(new Error("invalid productType"), "暂不支持该支付项目。", "INVALID_PRODUCT_TYPE");
    }

    const work = await getOwnedWork(OPENID, workId);

    if (!work || work.status === "deleted") {
      return expectedError("WORK_NOT_FOUND", "作品不存在或已删除，请返回作品页刷新后重试。");
    }

    if (!isPayableWork(work)) {
      return expectedError("WORK_STATUS_NOT_PAYABLE", "当前作品状态暂不能解锁 AR 权益。");
    }

    const activeEntitlement = await getActiveEntitlement(OPENID, workId);
    if (activeEntitlement) {
      return expectedError("AR_ALREADY_UNLOCKED", "当前作品已解锁 AR 权益，无需重复支付。", "already_unlocked");
    }

    const pendingOrder = await getPendingOrder(OPENID, workId, productType);
    if (pendingOrder) {
      const normalizedOrder = await normalizeExistingPendingOrder(pendingOrder, work);
      return normalizeOrderResponse(normalizedOrder, work);
    }

    const orderId = createOrderId();
    const now = new Date();
    const orderDoc = {
      _id: orderId,
      orderId,
      openid: OPENID,
      workId,
      productType,
      amount: AR_UNLOCK_AMOUNT,
      currency: AR_UNLOCK_CURRENCY,
      status: "pending",
      paymentStatus: "pending",
      entitlementStatus: "none",
      entitlementId: "",
      paymentProvider: "wechat",
      paymentMode: "mock",
      paymentParams: buildPaymentParams(),
      workSnapshot: buildWorkSnapshot(work),
      createdAt: now,
      updatedAt: now,
      paidAt: null,
      cancelledAt: null,
      failedAt: null
    };

    await orders.add({
      data: orderDoc
    });

    return normalizeOrderResponse(orderDoc, work);
  } catch (error) {
    return fail(error, "订单创建失败，请稍后重试。");
  }
};
