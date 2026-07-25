"use strict";

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
    },
  },

  methods: {
    noop() {},

    handleConfirm() {
      this.triggerEvent("confirm");
    },

    handleCancel() {
      this.triggerEvent("cancel");
    },
  },
});
