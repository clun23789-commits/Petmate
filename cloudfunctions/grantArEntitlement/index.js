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

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createEntitlementId() {
  return `entitlement-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function createDocId(openid, workId) {
  const encoded = Buffer.from(`${openid}:${workId}`).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `ar_entitlement_${encoded}`;
}

function fail(error, message, errorCode = "GRANT_AR_ENTITLEMENT_FAILED") {
  console.error("grantArEntitlement failed", error);
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

async function syncOrderEntitlement(order, entitlement) {
  if (!order || !order._id || !entitlement) {
    return;
  }

  await orders.doc(order._id).update({
    data: {
      entitlementStatus: "active",
      entitlementId: entitlement.entitlementId,
      updatedAt: new Date()
    }
  });
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

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();
    const orderId = normalizeString(event.orderId);
    const workId = normalizeString(event.workId);

    if (!OPENID) {
      return fail(new Error("OPENID is required"), "AR 权益发放失败，请稍后重试。", "OPENID_REQUIRED");
    }

    if (!orderId || !workId) {
      return fail(new Error("orderId and workId are required"), "权益发放信息缺失，请稍后重试。", "ENTITLEMENT_INFO_REQUIRED");
    }

    const orderResult = await orders
      .where({
        openid: OPENID,
        orderId
      })
      .limit(1)
      .get();
    const order = orderResult.data && orderResult.data[0];

    if (!order) {
      return fail(new Error("order not found"), "订单不存在，请重新发起支付。", "ORDER_NOT_FOUND");
    }

    if (order.workId !== workId) {
      return fail(new Error("workId mismatch"), "订单与当前作品不匹配。", "ORDER_WORK_MISMATCH");
    }

    if (order.productType !== ALLOWED_PRODUCT_TYPE) {
      return fail(new Error("invalid productType"), "暂不支持该支付项目。", "INVALID_PRODUCT_TYPE");
    }

    if (order.status !== "paid") {
      return {
        ok: false,
        status: "not_paid",
        errorCode: "ORDER_NOT_PAID",
        message: "订单尚未支付成功，不能发放 AR 权益。"
      };
    }

    const work = await getOwnedWork(OPENID, workId);
    if (!work || work.status === "deleted") {
      return expectedError("WORK_NOT_FOUND", "作品不存在或已删除，请返回作品页刷新后重试。");
    }

    if (!isPayableWork(work)) {
      return expectedError("WORK_STATUS_NOT_PAYABLE", "当前作品状态暂不能解锁 AR 权益。");
    }

    const existingResult = await arEntitlements
      .where({
        openid: OPENID,
        workId
      })
      .limit(1)
      .get();
    const existing = existingResult.data && existingResult.data[0];

    if (existing && existing.status === "active") {
      await syncOrderEntitlement(order, existing);
      return toEntitlementResponse(existing);
    }

    const now = new Date();
    const entitlement = {
      _id: createDocId(OPENID, workId),
      entitlementId: createEntitlementId(),
      openid: OPENID,
      ownerOpenid: OPENID,
      workId,
      orderId,
      productType: "ar_unlock",
      status: "active",
      activatedAt: now,
      expiresAt: null,
      createdAt: now,
      updatedAt: now
    };

    try {
      if (existing) {
        const { _id, ...entitlementPatch } = entitlement;
        await arEntitlements.doc(existing._id).update({
          data: entitlementPatch
        });
      } else {
        await arEntitlements.add({
          data: entitlement
        });
      }
    } catch (error) {
      const raceResult = await arEntitlements
        .where({
          openid: OPENID,
          workId,
          status: "active"
        })
        .limit(1)
        .get();
      const raceEntitlement = raceResult.data && raceResult.data[0];

      if (raceEntitlement) {
        await syncOrderEntitlement(order, raceEntitlement);
        return toEntitlementResponse(raceEntitlement);
      }

      throw error;
    }

    await syncOrderEntitlement(order, entitlement);
    return toEntitlementResponse(entitlement);
  } catch (error) {
    return fail(error, "AR 权益发放失败，请稍后重试。");
  }
};
