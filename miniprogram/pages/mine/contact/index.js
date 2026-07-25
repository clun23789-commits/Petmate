"use strict";

const { showToast } = require("../../../utils/toast");

const HELP_PATH = "/pages/mine/help/index";

const CONTACTS = [
  {
    id: "support",
    title: "官方邮箱",
    value: "support@petmate.cn",
    desc: "使用问题、功能咨询、产品体验建议",
    buttonText: "复制邮箱",
    icon: "✉",
    tone: "green",
  },
  {
    id: "wechat",
    title: "微信联系",
    value: "Petmate 小助手",
    desc: "产品使用指导、操作问题咨询",
    buttonText: "复制微信号",
    icon: "微",
    tone: "green",
  },
  {
    id: "business",
    title: "商务合作",
    value: "bd@petmate.cn",
    desc: "品牌合作、渠道合作、媒体合作",
    buttonText: "复制邮箱",
    icon: "商",
    tone: "orange",
  },
];

const SERVICE_NOTES = [
  {
    id: "time",
    title: "服务时间",
    value: "工作日 10:00 - 18:00",
    desc: "非工作时间提交的信息，会在后续服务时段继续查看。",
    icon: "◔",
  },
  {
    id: "reply",
    title: "响应说明",
    value: "使用问题与权益咨询会优先处理",
    desc: "通常会在 1 - 3 个工作日内回复，请耐心等待。",
    icon: "●",
  },
];

function getPreviousRoute() {
  const pages = getCurrentPages();
  if (!pages || pages.length < 2) {
    return "";
  }
  return pages[pages.length - 2].route || "";
}

Page({
  data: {
    contacts: CONTACTS,
    serviceNotes: SERVICE_NOTES,
  },

  handleBack() {
    const pages = getCurrentPages();
    if (pages && pages.length > 1) {
      wx.navigateBack();
      return;
    }

    wx.redirectTo({ url: HELP_PATH });
  },

  handleReturnHelp() {
    if (getPreviousRoute() === "pages/mine/help/index") {
      wx.navigateBack();
      return;
    }

    wx.redirectTo({ url: HELP_PATH });
  },

  handleCopyContact(event) {
    const contactId = event.currentTarget.dataset.id;
    const contact = this.data.contacts.find((item) => item.id === contactId);
    if (!contact) {
      showToast("暂未找到联系方式");
      return;
    }

    this.copyText(contact.value, `${contact.title}已复制`);
  },

  handleCopyAll() {
    const text = [
      "Petmate 联系方式",
      "官方邮箱：support@petmate.cn",
      "微信联系：Petmate 小助手",
      "商务合作：bd@petmate.cn",
      "服务时间：工作日 10:00 - 18:00",
    ].join("\n");

    this.copyText(text, "已复制全部联系方式");
  },

  copyText(text, title) {
    wx.setClipboardData({
      data: text,
      success: () => {
        showToast(title, "success");
      },
      fail: () => {
        showToast("复制暂未成功，请稍后重试");
      },
    });
  },
});
