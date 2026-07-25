"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.PAYMENT_PAGE_STATUS = exports.EXCEPTION_STATUS = exports.EXCEPTION_SCENES = exports.AD_UNLOCK_SOURCES = exports.SHARE_ROUTES = exports.TAB_ROUTES = exports.PAGE_ROUTES = void 0;
exports.normalizeRoute = normalizeRoute;
exports.normalizeUrl = normalizeUrl;
exports.withoutLeadingSlash = withoutLeadingSlash;
exports.stripQuery = stripQuery;
exports.isTabRoute = isTabRoute;
exports.isRegisteredRoute = isRegisteredRoute;

const PAGE_ROUTES = Object.freeze({
  works: Object.freeze({
    index: "/pages/works/index/index",
    startCreate: "/pages/works/start-create/index",
    adUnlock: "/pages/works/ad-unlock/index",
    upload: "/pages/works/upload/index",
    generating: "/pages/works/generating/index",
    result: "/pages/works/result/index",
    targetedUpload: "/pages/works/targeted-upload/index",
    detailRetouch: "/pages/works/detail-retouch/index",
    arGuide: "/pages/works/ar-guide/index",
    payment: "/pages/works/payment/index",
    arView: "/pages/works/ar-view/index",
    arFailure: "/pages/works/ar-failure/index",
    exception: "/pages/works/exception/index",
    generatedList: "/pages/works/generated-list/index",
    detail: "/pages/works/detail/index"
  }),
  cases: Object.freeze({
    index: "/pages/cases/index/index",
    search: "/pages/cases/search/index",
    videoDetail: "/pages/cases/video-detail/index",
    detail: "/pages/cases/detail/index",
    templateDemo: "/pages/cases/template-demo/index"
  }),
  mine: Object.freeze({
    index: "/pages/mine/index/index",
    help: "/pages/mine/help/index",
    contact: "/pages/mine/contact/index",
    feedback: "/pages/mine/feedback/index",
    helpDetail: "/pages/mine/help-detail/index",
    profile: "/pages/mine/profile/index",
    benefits: "/pages/mine/benefits/index"
  }),
  share: Object.freeze({
    landing: "/pages/share/landing/index",
    conversion: "/pages/share/conversion/index"
  })
});

exports.PAGE_ROUTES = PAGE_ROUTES;

const TAB_ROUTES = Object.freeze([
  PAGE_ROUTES.works.index,
  PAGE_ROUTES.cases.index,
  PAGE_ROUTES.mine.index
]);

exports.TAB_ROUTES = TAB_ROUTES;

exports.SHARE_ROUTES = Object.freeze({
  landing: PAGE_ROUTES.share.landing,
  conversion: PAGE_ROUTES.share.conversion
});

exports.AD_UNLOCK_SOURCES = Object.freeze({
  firstCreate: "first_create",
  optimizeRefill: "optimize_refill",
  recover: "recover"
});

exports.EXCEPTION_SCENES = Object.freeze({
  ad: "ad",
  upload: "upload",
  generation: "generation",
  optimization: "optimization",
  network: "network"
});

exports.EXCEPTION_STATUS = Object.freeze({
  rightUnknown: "rightUnknown",
  skipped: "skipped",
  unavailable: "unavailable",
  error: "error",
  granted: "granted",
  permissionError: "permissionError"
});

exports.PAYMENT_PAGE_STATUS = Object.freeze({
  idle: "idle",
  paying: "paying",
  success: "success",
  confirming: "confirming",
  failed: "failed",
  cancelled: "cancelled",
  owned: "owned"
});

const REGISTERED_ROUTES = Object.freeze([
  PAGE_ROUTES.works.index,
  PAGE_ROUTES.cases.index,
  PAGE_ROUTES.mine.index,
  PAGE_ROUTES.share.landing,
  PAGE_ROUTES.share.conversion,
  PAGE_ROUTES.cases.search,
  PAGE_ROUTES.cases.videoDetail,
  PAGE_ROUTES.cases.detail,
  PAGE_ROUTES.cases.templateDemo,
  PAGE_ROUTES.works.startCreate,
  PAGE_ROUTES.works.adUnlock,
  PAGE_ROUTES.works.upload,
  PAGE_ROUTES.works.generating,
  PAGE_ROUTES.works.result,
  PAGE_ROUTES.works.targetedUpload,
  PAGE_ROUTES.works.detailRetouch,
  PAGE_ROUTES.works.arGuide,
  PAGE_ROUTES.works.payment,
  PAGE_ROUTES.works.arView,
  PAGE_ROUTES.works.arFailure,
  PAGE_ROUTES.works.exception,
  PAGE_ROUTES.works.generatedList,
  PAGE_ROUTES.works.detail,
  PAGE_ROUTES.mine.help,
  PAGE_ROUTES.mine.contact,
  PAGE_ROUTES.mine.feedback,
  PAGE_ROUTES.mine.helpDetail,
  PAGE_ROUTES.mine.profile,
  PAGE_ROUTES.mine.benefits
]);

const TAB_ROUTE_SET = new Set(TAB_ROUTES);
const REGISTERED_ROUTE_SET = new Set(REGISTERED_ROUTES);

function stripQuery(path) {
  return String(path || "").split("?")[0];
}

function normalizeRoute(path) {
  const route = stripQuery(path).trim();
  if (!route) {
    return "";
  }
  return route.charAt(0) === "/" ? route : `/${route}`;
}

function normalizeUrl(path) {
  const value = String(path || "").trim();
  if (!value) {
    return "";
  }
  return value.charAt(0) === "/" ? value : `/${value}`;
}

function withoutLeadingSlash(path) {
  const route = normalizeRoute(path);
  return route.charAt(0) === "/" ? route.slice(1) : route;
}

function isTabRoute(path) {
  return TAB_ROUTE_SET.has(normalizeRoute(path));
}

function isRegisteredRoute(path) {
  return REGISTERED_ROUTE_SET.has(normalizeRoute(path));
}
