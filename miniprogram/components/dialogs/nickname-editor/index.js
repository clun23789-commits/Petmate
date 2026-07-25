"use strict";

const SPECIAL_SYMBOL_PATTERN = /[<>\\\/{}\[\]|`~@#$%^&*+=]/;

Component({
  properties: {
    visible: Boolean,
    value: String,
  },

  data: {
    innerValue: "",
    currentDisplayName: "游客",
  },

  observers: {
    value(value) {
      this.syncValue(value);
    },

    visible(visible) {
      if (!visible) {
        return;
      }

      this.syncValue(this.properties.value);
    },
  },

  methods: {
    noop() {},

    normalizeNickname(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    },

    syncValue(value) {
      const safeValue = this.normalizeNickname(value);
      this.setData({
        innerValue: safeValue,
        currentDisplayName: safeValue || "游客",
      });
    },

    handleInput(event) {
      this.setData({
        innerValue: event.detail.value,
      });
    },

    handleClear() {
      this.setData({
        innerValue: "",
      });
    },

    handleSave() {
      const value = this.normalizeNickname(this.data.innerValue);

      if (!value) {
        wx.showToast({
          title: "请输入新昵称",
          icon: "none",
        });
        return;
      }

      if (value.length < 2) {
        wx.showToast({
          title: "昵称至少 2 个字",
          icon: "none",
        });
        return;
      }

      if (value.length > 12) {
        wx.showToast({
          title: "昵称不能超过 12 个字",
          icon: "none",
        });
        return;
      }

      if (SPECIAL_SYMBOL_PATTERN.test(value)) {
        wx.showToast({
          title: "昵称不能包含特殊符号",
          icon: "none",
        });
        return;
      }

      this.triggerEvent("save", {
        value,
      });
    },

    handleCancel() {
      this.triggerEvent("cancel");
    },
  },
});
