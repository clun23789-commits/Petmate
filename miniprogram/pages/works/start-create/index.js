"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const { experienceFlags } = require("../../../config/experience");
const { navigate } = require("../../../utils/navigation");

Page({
  data: {
    showDevOnlyUi: experienceFlags.showDevOnlyUi,
    hero: {
      beforeImage: "/assets/mock/upload-front.png",
      modelImage: "/assets/mock/pet-corgi-hero.png",
      catImage: "/assets/mock/pet-cat-hero.png",
      dogImage: "/assets/mock/pet-corgi-hero.png"
    },
    steps: [
      {
        no: "1",
        icon: "图",
        title: "上传猫狗照片",
        desc: "清晰照片效果更好",
        showConnector: true
      },
      {
        no: "2",
        icon: "盒",
        title: "生成 AI 形象",
        desc: "快速生成专属形象",
        showConnector: true
      },
      {
        no: "3",
        icon: "单",
        title: "判断像不像并优化",
        desc: "提供反馈持续优化",
        showConnector: true
      },
      {
        no: "4",
        icon: "AR",
        title: "满意后进入 AR 展示",
        desc: "把它带到真实空间"
      }
    ],
    rightsItems: [
      {
        icon: "+",
        text: "观看激励广告后，可获得上传生成权限和 3 次结果优化次数"
      },
      {
        icon: "✓",
        text: "广告试用不包含 AR 付费权益"
      },
      {
        icon: "♡",
        text: "系统异常或生成失败不扣减优化次数"
      }
    ]
  },

  handleUnlock() {
    navigate("/pages/works/ad-unlock/index", { source: "first_create" });
  },

  handleTemplate() {
    navigate("/pages/cases/template-demo/index", {
      templateId: "template-cat",
      source: "start_create"
    });
  }
});
