"use strict";

const { bindStore } = require("../../../store/core/bindStore");
const { store } = require("../../../store/core/createStore");
const { navigate } = require("../../../utils/navigation");

const DEFAULT_NICKNAME = "宠爱我家";
const DEFAULT_AVATAR = "/assets/mock/pet-corgi-hero.png";
const PLACEHOLDER_AVATAR = "/assets/mock/exception-hero.png";

const MENU_ITEMS = [
  {
    key: "help",
    icon: "?",
    iconClass: "icon-help",
    title: "帮助中心",
    desc: "使用说明与常见问题",
    route: "/pages/mine/help/index"
  },
  {
    key: "benefits",
    icon: "✓",
    iconClass: "icon-benefits",
    title: "权益说明",
    desc: "广告试用与 AR 权益规则",
    route: "/pages/mine/benefits/index"
  },
  {
    key: "feedback",
    icon: "…",
    iconClass: "icon-feedback",
    title: "投诉与反馈",
    desc: "问题反馈与建议",
    route: "/pages/mine/feedback/index"
  },
  {
    key: "profile",
    icon: "⚙",
    iconClass: "icon-profile",
    title: "个人信息",
    desc: "头像、昵称等管理",
    route: "/pages/mine/profile/index"
  }
];

let unbind = null;

function resolveAvatarUrl(avatarUrl) {
  if (!avatarUrl || avatarUrl === PLACEHOLDER_AVATAR) {
    return DEFAULT_AVATAR;
  }
  return avatarUrl;
}

function resolveUserDisplay(userState) {
  const userProfile = userState.userProfile || {};
  const cloudUser = userState.cloudUser || {};
  const nickname = userProfile.nickname || cloudUser.nickname;
  const avatarUrl = userProfile.avatarUrl || cloudUser.avatarUrl || "";

  return {
    avatarUrl: resolveAvatarUrl(avatarUrl),
    nickname: resolveNickname(nickname)
  };
}

function resolveNickname(nickname) {
  if (!nickname || nickname === "游客") {
    return DEFAULT_NICKNAME;
  }
  return nickname;
}

function isLoggedIn(userState) {
  return userState.loginStatus === "logged_in" || userState.cloudSyncStatus === "success";
}

function countArUnlockedWorks(state) {
  return state.workState.workOrder.filter((workId) => {
    const entitlement = state.arState.entitlementMapByWorkId[workId];
    return entitlement && entitlement.status === "active";
  }).length;
}

Page({
  data: {
    avatarUrl: DEFAULT_AVATAR,
    nickname: DEFAULT_NICKNAME,
    loginLabel: "未登录用户",
    identityLabel: "爱宠星球居民",
    workCount: 0,
    arUnlockedCount: 0,
    menuItems: MENU_ITEMS,
    showLogoutDialog: false,
    headerTopPadding: 24,
    headerRightWidth: 108,
    headerNavHeight: 44
  },

  onLoad() {
    this.updateHeaderMetrics();
    unbind = bindStore(this, (state) => {
      const userDisplay = resolveUserDisplay(state.userState);
      return {
        avatarUrl: userDisplay.avatarUrl,
        nickname: userDisplay.nickname,
        loginLabel: isLoggedIn(state.userState) ? "微信用户" : "未登录用户",
        workCount: state.workState.workOrder.length,
        arUnlockedCount: countArUnlockedWorks(state)
      };
    });
  },

  onShow() {
    this.updateHeaderMetrics();
  },

  onUnload() {
    if (unbind) {
      unbind();
      unbind = null;
    }
  },

  updateHeaderMetrics() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = windowInfo.statusBarHeight || 20;
    const screenWidth = windowInfo.windowWidth || 375;
    let safeTop = statusBarHeight + 12;
    let navHeight = 44;
    let sideWidth = 108;

    try {
      const menuButton = wx.getMenuButtonBoundingClientRect();
      if (menuButton && menuButton.width) {
        safeTop = menuButton.top || safeTop;
        navHeight = Math.max(menuButton.height || 32, 44);
        sideWidth = Math.max(108, Math.max(screenWidth - menuButton.left + 8, menuButton.width + 8));
      }
    } catch (error) {
      sideWidth = 108;
    }

    this.setData({
      headerTopPadding: safeTop,
      headerNavHeight: navHeight,
      headerRightWidth: sideWidth
    });
  },

  handleProfile() {
    navigate("/pages/mine/profile/index");
  },

  handleWorksSummary() {
    navigate("/pages/works/generated-list/index");
  },

  handleMenuTap(event) {
    const route = event.currentTarget.dataset.route;
    if (!route) {
      return;
    }
    navigate(route);
  },

  handleOpenLogout() {
    this.setData({ showLogoutDialog: true });
  },

  handleCloseLogout() {
    this.setData({ showLogoutDialog: false });
  },

  handleLogout() {
    // 小程序无法退出微信身份；这里仅清理当前会话的本地展示状态。
    store.setState(
      (state) => ({
        userState: {
          ...state.userState,
          loginStatus: "guest",
          userProfile: null,
          cloudOpenid: "",
          cloudUser: null,
          cloudSyncStatus: "idle",
          cloudSyncError: ""
        }
      }),
      "logoutFromMine"
    );

    this.setData({ showLogoutDialog: false });
  }
});
