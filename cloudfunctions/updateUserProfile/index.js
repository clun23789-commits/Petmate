"use strict";

const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const users = db.collection("users");
const NICKNAME_SPECIAL_SYMBOL_PATTERN = /[<>\\\/{}\[\]|`~@#$%^&*+=]/;

function normalizeString(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeAvatarUrl(value) {
  const avatarUrl = normalizeString(value);
  if (!avatarUrl) {
    return "";
  }

  if (avatarUrl.startsWith("https://") || avatarUrl.startsWith("cloud://")) {
    return avatarUrl;
  }

  return null;
}

function expectedError(errorCode, message) {
  return {
    ok: false,
    errorCode,
    message
  };
}

function fail(error) {
  console.error("updateUserProfile failed", error);
  return {
    ok: false,
    errorCode: "UPDATE_USER_PROFILE_FAILED",
    message: "用户资料更新失败，请稍后重试"
  };
}

function validateNickname(nickname) {
  if (!nickname) {
    return "请输入新昵称";
  }

  if (nickname.length < 2) {
    return "昵称至少 2 个字";
  }

  if (nickname.length > 12) {
    return "昵称不能超过 12 个字";
  }

  if (NICKNAME_SPECIAL_SYMBOL_PATTERN.test(nickname)) {
    return "昵称不能包含特殊符号";
  }

  return "";
}

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();

    if (!OPENID) {
      return expectedError("OPENID_REQUIRED", "用户身份识别失败，请稍后重试");
    }

    const nickname = normalizeString(event.nickname);
    const nicknameError = validateNickname(nickname);
    if (nicknameError) {
      return expectedError("INVALID_NICKNAME", nicknameError);
    }

    const avatarUrl = Object.prototype.hasOwnProperty.call(event, "avatarUrl")
      ? normalizeAvatarUrl(event.avatarUrl)
      : undefined;

    if (avatarUrl === null) {
      return expectedError("INVALID_AVATAR_URL", "头像地址格式不支持");
    }

    const now = new Date();
    const result = await users
      .where({
        openid: OPENID
      })
      .limit(1)
      .get();
    const existingUser = result.data && result.data[0];
    const patch = {
      nickname,
      updatedAt: now
    };

    if (avatarUrl !== undefined) {
      patch.avatarUrl = avatarUrl;
    }

    if (!existingUser) {
      const user = {
        openid: OPENID,
        nickname,
        avatarUrl: avatarUrl || "",
        status: "active",
        createdAt: now,
        updatedAt: now
      };
      const addResult = await users.add({
        data: user
      });

      return {
        ok: true,
        data: {
          openid: OPENID,
          user: {
            _id: addResult._id,
            ...user
          }
        }
      };
    }

    await users.doc(existingUser._id).update({
      data: patch
    });

    return {
      ok: true,
      data: {
        openid: OPENID,
        user: {
          ...existingUser,
          ...patch
        }
      }
    };
  } catch (error) {
    return fail(error);
  }
};
