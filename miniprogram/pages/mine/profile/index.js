"use strict";

const { bindStore } = require("../../../store/core/bindStore");
const { store } = require("../../../store/core/createStore");
const { updateUserProfile } = require("../../../services/user");
const { navigate, switchTab } = require("../../../utils/navigation");
const { showToast } = require("../../../utils/toast");

const DEFAULT_AVATAR = "/assets/mock/pet-cat-hero.png";
const PLACEHOLDER_AVATAR = "/assets/mock/exception-hero.png";
const MINE_PATH = "/pages/mine/index/index";
const BENEFITS_PATH = "/pages/mine/benefits/index";
const HELP_PATH = "/pages/mine/help/index";
const NICKNAME_SPECIAL_SYMBOL_PATTERN = /[<>\\\/{}\[\]|`~@#$%^&*+=]/;

let unbind = null;

function resolveAvatarUrl(userProfile) {
  const avatarUrl = userProfile && userProfile.avatarUrl;
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
    nickname: nickname || "游客",
    avatarUrl,
    displayAvatar: resolveAvatarUrl({ avatarUrl })
  };
}

function resolveNickname(userProfile) {
  const nickname = userProfile && userProfile.nickname;
  return nickname || "游客";
}

function resolveLoginStatus(loginStatus, cloudSyncStatus) {
  const isLoggedIn = loginStatus === "logged_in" || cloudSyncStatus === "success";
  return {
    loginStatusText: isLoggedIn ? "微信已登录" : "游客模式",
    loginStatusValue: isLoggedIn ? "已登录" : "未登录",
  };
}

function normalizeNickname(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

Page({
  data: {
    nickname: "游客",
    avatarUrl: "",
    displayAvatar: DEFAULT_AVATAR,
    heroPetImage: DEFAULT_AVATAR,
    avatarSourceText: "当前使用微信头像",
    loginStatusText: "游客模式",
    loginStatusValue: "未登录",
    showNicknameDialog: false,
    showLogoutDialog: false,
    nicknameSaving: false,
  },

  onLoad() {
    unbind = bindStore(this, (state) => {
      const userDisplay = resolveUserDisplay(state.userState);
      const loginStatus = resolveLoginStatus(state.userState.loginStatus, state.userState.cloudSyncStatus);

      return {
        nickname: userDisplay.nickname,
        avatarUrl: userDisplay.avatarUrl,
        displayAvatar: userDisplay.displayAvatar,
        ...loginStatus,
      };
    });
  },

  onUnload() {
    if (unbind) {
      unbind();
      unbind = null;
    }
  },

  handleAvatarInfo() {
    showToast("当前使用微信头像，暂不支持单独修改");
  },

  handleOpenNickname() {
    this.setData({ showNicknameDialog: true });
  },

  handleCloseNickname() {
    this.setData({ showNicknameDialog: false });
  },

  async handleSaveNickname(event) {
    if (this.data.nicknameSaving) {
      return;
    }

    const value = normalizeNickname(event.detail.value);
    if (!value) {
      showToast("请输入新昵称");
      return;
    }

    if (value.length < 2) {
      showToast("昵称至少 2 个字");
      return;
    }

    if (value.length > 12) {
      showToast("昵称不能超过 12 个字");
      return;
    }

    if (NICKNAME_SPECIAL_SYMBOL_PATTERN.test(value)) {
      showToast("昵称不能包含特殊符号");
      return;
    }

    this.setData({ nicknameSaving: true });

    try {
      const result = await updateUserProfile({
        nickname: value,
      });

      if (!result || result.ok !== true) {
        showToast(result && result.message ? result.message : "昵称更新失败，请稍后重试");
        return;
      }

      const data = result.data || {};
      const cloudUser = data.user || {};
      const nextProfile = {
        nickname: cloudUser.nickname || value,
        avatarUrl: cloudUser.avatarUrl || "",
      };

      store.setState(
        (state) => ({
          userState: {
            ...state.userState,
            loginStatus: "logged_in",
            userProfile: {
              ...(state.userState.userProfile || {}),
              ...nextProfile,
            },
            cloudOpenid: data.openid || state.userState.cloudOpenid,
            cloudUser: {
              ...(state.userState.cloudUser || {}),
              ...cloudUser,
              ...nextProfile,
            },
            cloudSyncStatus: "success",
            cloudSyncError: "",
          },
        }),
        "updateNickname"
      );

      this.setData({ showNicknameDialog: false });
      showToast("昵称已更新", "success");
    } finally {
      this.setData({ nicknameSaving: false });
    }
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
          cloudSyncError: "",
        },
      }),
      "logoutFromProfile"
    );

    this.setData({ showLogoutDialog: false });
    switchTab(MINE_PATH);
  },

  handleBackToMine() {
    switchTab(MINE_PATH);
  },

  handleViewBenefits() {
    navigate(BENEFITS_PATH);
  },

  handleGoHelp() {
    navigate(HELP_PATH);
  },
});
