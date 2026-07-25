"use strict";

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
    },
    title: {
      type: String,
      value: "",
    },
    question: {
      type: String,
      value: "",
    },
    description: {
      type: String,
      value: "",
    },
    hint: {
      type: String,
      value: "",
    },
    confirmText: {
      type: String,
      value: "确认",
    },
    confirmLoadingText: {
      type: String,
      value: "处理中...",
    },
    cancelText: {
      type: String,
      value: "取消",
    },
    variant: {
      type: String,
      value: "delete",
    },
    iconText: {
      type: String,
      value: "!",
    },
    loading: {
      type: Boolean,
      value: false,
    },
    errorText: {
      type: String,
      value: "",
    },
  },

  methods: {
    noop() {},

    handleCancel() {
      if (this.data.loading) {
        return;
      }
      this.triggerEvent("cancel");
    },

    handleConfirm() {
      if (this.data.loading) {
        return;
      }
      this.triggerEvent("confirm");
    },
  },
});
