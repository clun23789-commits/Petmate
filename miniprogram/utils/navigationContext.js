"use strict";

const { toUrl, replace } = require("./navigation");
const { getStringParam } = require("./query");
const { PAGE_ROUTES, isRegisteredRoute, normalizeUrl, stripQuery } = require("./routes");

const NAV_FROM = Object.freeze({
  result: "result",
  detail: "detail",
  generatedList: "generatedList",
  works: "works",
  share: "share"
});

const NAV_FROM_VALUES = Object.freeze(Object.keys(NAV_FROM).map((key) => NAV_FROM[key]));
const NAV_FROM_SET = new Set(NAV_FROM_VALUES);

function decodeOnce(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  try {
    return decodeURIComponent(text);
  } catch (error) {
    return text;
  }
}

function normalizeFrom(value, fallback = NAV_FROM.works) {
  const source = String(value || "").trim();
  if (NAV_FROM_SET.has(source)) {
    return source;
  }

  return NAV_FROM_SET.has(fallback) ? fallback : "";
}

function sanitizeReturnTo(value) {
  const decoded = decodeOnce(value);
  if (!decoded) {
    return "";
  }

  const url = normalizeUrl(decoded);
  if (!url || url.indexOf("//") === 0) {
    return "";
  }

  const route = stripQuery(url);
  return isRegisteredRoute(route) ? url : "";
}

function getReturnContext(options = {}, fallbackFrom = NAV_FROM.works) {
  return {
    from: normalizeFrom(getStringParam(options, "from"), fallbackFrom),
    returnTo: sanitizeReturnTo(getStringParam(options, "returnTo"))
  };
}

function withReturnContext(query = {}, context = {}) {
  const from = normalizeFrom(context.from, "");
  const returnTo = sanitizeReturnTo(context.returnTo);

  return {
    ...query,
    ...(from ? { from } : {}),
    ...(returnTo ? { returnTo } : {})
  };
}

function buildResultReturnTo(workId, versionId) {
  if (!workId) {
    return PAGE_ROUTES.works.index;
  }

  return toUrl(PAGE_ROUTES.works.result, {
    workId,
    versionId
  });
}

function buildDetailReturnTo(workId) {
  if (!workId) {
    return PAGE_ROUTES.works.generatedList;
  }

  return toUrl(PAGE_ROUTES.works.detail, {
    workId
  });
}

function buildGeneratedListReturnTo() {
  return PAGE_ROUTES.works.generatedList;
}

function getReturnTarget(context = {}, params = {}) {
  const returnTo = sanitizeReturnTo(context.returnTo);
  if (returnTo) {
    return returnTo;
  }

  const from = normalizeFrom(context.from, NAV_FROM.works);

  if (from === NAV_FROM.detail && params.workId) {
    return buildDetailReturnTo(params.workId);
  }

  if (from === NAV_FROM.generatedList) {
    return buildGeneratedListReturnTo();
  }

  if ((from === NAV_FROM.result || from === NAV_FROM.share) && params.workId) {
    return buildResultReturnTo(params.workId, params.versionId);
  }

  return PAGE_ROUTES.works.index;
}

function returnToSource(context = {}, params = {}) {
  replace(getReturnTarget(context, params));
}

function getReturnActionCopy(from) {
  const source = normalizeFrom(from, NAV_FROM.works);

  if (source === NAV_FROM.detail) {
    return {
      text: "返回作品详情",
      subtext: "继续查看当前作品信息"
    };
  }

  if (source === NAV_FROM.generatedList) {
    return {
      text: "返回已生成列表",
      subtext: "继续查看已生成的宠物作品"
    };
  }

  if (source === NAV_FROM.result || source === NAV_FROM.share) {
    return {
      text: "返回结果页",
      subtext: "继续查看当前生成结果"
    };
  }

  return {
    text: "返回作品页",
    subtext: "继续回到作品入口"
  };
}

module.exports = {
  NAV_FROM,
  normalizeFrom,
  sanitizeReturnTo,
  getReturnContext,
  withReturnContext,
  buildResultReturnTo,
  buildDetailReturnTo,
  buildGeneratedListReturnTo,
  getReturnTarget,
  returnToSource,
  getReturnActionCopy
};
