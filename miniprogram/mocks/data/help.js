"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HELP_GROUPS = exports.HELP_ARTICLES = void 0;

exports.HELP_ARTICLES = [
  {
    id: "help-upload",
    title: "照片需要满足哪些要求？",
    summary: "建议准备清晰、无遮挡、主体完整的猫狗照片。",
    meta: "上传与生成",
    body: [
      "正脸、侧面、全身照片是推荐素材结构，不是强制三张上传。",
      "系统更偏好自然光、无遮挡、主体完整的素材。",
      "如果结果页提示某个维度不像，可以再通过定向补图或细节补色继续优化。"
    ],
    relatedIds: ["help-upload-few", "help-generation-time"]
  },
  {
    id: "help-upload-few",
    title: "素材偏少能生成吗？",
    summary: "素材偏少时也可以尝试，但结果可能不稳定。",
    meta: "上传与生成",
    body: [
      "素材偏少时可以进入生成流程，但模型识别到的宠物特征会更少。",
      "建议至少准备正面、侧面或全身照中的 2 张清晰照片。",
      "如果生成后某些细节不像，可以通过定向补图或细节补色继续优化。"
    ],
    relatedIds: ["help-upload", "help-generation-time"]
  },
  {
    id: "help-generation-time",
    title: "生成需要多长时间？",
    summary: "生成时间会根据素材和排队情况变化。",
    meta: "上传与生成",
    body: [
      "生成会先进入等待状态，完成后会自动展示可用结果。",
      "生成时间可能受素材数量、系统排队和网络情况影响。",
      "如果生成中断，可以进入异常恢复页查看下一步建议。"
    ],
    relatedIds: ["help-generate-failed", "help-upload"]
  },
  {
    id: "help-optimize",
    title: "优化次数如何获得？",
    summary: "观看广告解锁试用后，可获得基础生成权限和 3 次优化次数。",
    meta: "优化次数",
    body: [
      "每次广告解锁会附带 3 次结果优化次数。",
      "优化次数用于重新生成类的有效优化请求。",
      "细节补色属于局部贴图修补，不消耗重新生成类优化次数。"
    ],
    relatedIds: ["help-optimize-failed", "help-optimize-keep"]
  },
  {
    id: "help-optimize-failed",
    title: "优化失败会扣次数吗？",
    summary: "系统异常或生成失败时不应消耗有效优化次数。",
    meta: "优化次数",
    body: [
      "用户提交有效优化后，可以先在前端展示预占状态。",
      "只有优化成功返回可用结果后，才正式扣减本次优化次数。",
      "如果后续生成失败、网络异常或结果不可用，应恢复本次优化次数。"
    ],
    relatedIds: ["help-optimize"]
  },
  {
    id: "help-optimize-keep",
    title: "优化次数可以累计吗？",
    summary: "当前会展示本次可用次数，具体权益以页面提示为准。",
    meta: "优化次数",
    body: [
      "观看广告获得的优化次数用于当前创作链路内的模型调整。",
      "当前产品只表达本次创作链路内的可用优化次数，不做复杂长期累计系统。",
      "如果后续要支持累计，需要先补充权益规则和后端数据结构。"
    ],
    relatedIds: ["help-optimize", "help-trial-recovery"]
  },
  {
    id: "help-ar-unlock",
    title: "如何解锁当前作品 AR？",
    summary: "在结果页或 AR 使用说明页进入支付页后解锁。",
    meta: "AR 使用",
    body: [
      "AR 权益绑定到单个宠物作品，而不是账号身份。",
      "用户可以在结果页、作品详情页或 AR 使用说明页查看解锁入口。",
      "支付成功后，应回到当前作品的 AR 已解锁状态。"
    ],
    relatedIds: ["help-payment-rights", "help-ar"]
  },
  {
    id: "help-ar-repeat",
    title: "AR 可以无限次使用吗？",
    summary: "同一作品解锁后，可在该作品范围内重复打开。",
    meta: "AR 使用",
    body: [
      "AR 权益只绑定当前宠物作品。",
      "同一作品已解锁后，可以重复进入 AR 展示页。",
      "如果创建了新的宠物作品，新作品需要单独判断是否拥有 AR 权益。"
    ],
    relatedIds: ["help-ar", "help-rights-bound"]
  },
  {
    id: "help-ar",
    title: "AR 失败了怎么办？",
    summary: "在支付成功的前提下，AR 权益仍然保留。",
    meta: "AR 使用",
    body: [
      "AR 权益绑定到单个宠物作品 ID。",
      "同一作品再次优化或补色后，仍然继承已购买的 AR 权益。",
      "若 AR 初始化失败，会进入 AR 失败说明页，而不会退回支付页。"
    ],
    relatedIds: ["help-ar-repeat", "help-trial-recovery"]
  },
  {
    id: "help-payment-rights",
    title: "支付成功但权益未到账？",
    summary: "优先刷新当前作品状态，仍异常时可提交反馈。",
    meta: "支付与权益",
    body: [
      "支付成功后，系统会为当前作品确认 AR 权益。",
      "如果权益未到账，请优先刷新当前作品详情。",
      "仍然异常时，引导用户提交反馈，并带上作品 ID 和支付时间。"
    ],
    relatedIds: ["help-rights-bound", "help-ar-unlock"]
  },
  {
    id: "help-rights-bound",
    title: "权益是绑定账号还是作品？",
    summary: "AR 权益绑定到当前宠物作品，不随账号共享。",
    meta: "支付与权益",
    body: [
      "当前产品规则中，AR 权益绑定单个作品 ID。",
      "不要把 AR 权益写成账号下作品共享。",
      "同一作品后续轻量优化时，可以继承已解锁 AR 权益。"
    ],
    relatedIds: ["help-ar-repeat", "help-payment-rights"]
  },
  {
    id: "help-refund",
    title: "可以退款吗？",
    summary: "退款与异常支付会通过反馈入口协助处理。",
    meta: "支付与权益",
    body: [
      "如遇支付异常或退款问题，请提交反馈并等待处理。",
      "处理结果会结合平台支付状态和产品规则确认。",
      "页面不要承诺自动退款，只引导用户提交反馈并等待处理。"
    ],
    relatedIds: ["help-payment-rights"]
  },
  {
    id: "help-generate-failed",
    title: "生成失败怎么办？",
    summary: "可以查看失败原因，重新上传或进入异常恢复。",
    meta: "失败与恢复",
    body: [
      "生成失败时，不要让用户停在空白页。",
      "应展示失败原因、可恢复操作和返回入口。",
      "用户可以重新上传素材，也可以稍后重试。"
    ],
    relatedIds: ["help-recovery", "help-upload"]
  },
  {
    id: "help-upload-failed",
    title: "上传失败如何处理？",
    summary: "检查网络、图片清晰度和格式后重新上传。",
    meta: "失败与恢复",
    body: [
      "上传失败时，优先检查网络状态。",
      "图片过大、过暗、主体不完整时，也可能导致质检不通过。",
      "用户可以重新选择更清晰的照片。"
    ],
    relatedIds: ["help-upload", "help-recovery"]
  },
  {
    id: "help-generation-fail-count",
    title: "生成失败会扣次数吗？",
    summary: "了解优化次数的消耗规则与失败补偿机制",
    meta: "优化次数",
    tag: "热门问题",
    body: [
      "不会。只有当你主动提交优化请求并进入重新生成流程时，才会扣减 1 次优化次数。",
      "由系统异常、生成失败、页面中断或结果未成功返回导致的失败，均不会扣减优化次数。"
    ],
    answer: [
      "不会。只有当你主动提交优化请求并进入重新生成流程时，才会扣减 1 次优化次数。",
      "由系统异常、生成失败、页面中断或结果未成功返回导致的失败，均不会扣减优化次数。"
    ],
    steps: [
      {
        title: "查看当前任务状态",
        desc: "在生成等待页或作品详情页，查看任务的实时状态。",
        iconText: "▤"
      },
      {
        title: "检查是否有可恢复权益",
        desc: "若因异常终止，可返回广告解锁页查看权益是否仍在。",
        iconText: "盾"
      },
      {
        title: "返回上传页或生成等待页重试",
        desc: "根据提示补充照片或稍后重试，重新进入生成流程。",
        iconText: "↻"
      }
    ],
    relatedIds: [
      "help-upload",
      "help-optimize-empty",
      "help-ar-fail",
      "help-retouch-diff",
      "help-pay-repeat"
    ]
  },
  {
    id: "help-optimize-empty",
    title: "优化次数用完了怎么办？",
    summary: "可以重新观看广告获得新的优化次数。",
    meta: "优化次数",
    body: [
      "优化次数用完后，可以回到广告解锁说明页重新观看广告。",
      "每次广告解锁只作用于当前创作链路，不代表长期持续共享。"
    ],
    relatedIds: ["help-generation-fail-count", "help-retouch-diff"]
  },
  {
    id: "help-ar-fail",
    title: "AR 失败后怎么办？",
    summary: "可根据失败原因重新进入 AR，权益不会因为初始化失败丢失。",
    meta: "AR 使用",
    body: [
      "如果 AR 初始化失败，请先检查相机权限、光线和当前环境。",
      "已购买的 AR 权益绑定当前作品，单次打开失败不会让权益失效。"
    ],
    relatedIds: ["help-pay-repeat", "help-generation-fail-count"]
  },
  {
    id: "help-retouch-diff",
    title: "细节补色和再次优化有什么区别？",
    summary: "细节补色偏局部调整，再次优化偏整体重生成。",
    meta: "优化次数",
    body: [
      "细节补色主要用于眼睛、毛色、花纹等局部修正。",
      "再次优化会根据当前反馈重新生成结果，影响范围更大。"
    ],
    relatedIds: ["help-generation-fail-count", "help-upload"]
  },
  {
    id: "help-pay-repeat",
    title: "同一只宠物需要重复付费吗？",
    summary: "同一作品的 AR 权益购买后会绑定在该作品上。",
    meta: "支付与权益",
    body: [
      "AR 权益按作品绑定，不随账号共享。",
      "同一作品已解锁 AR 后，后续再次进入该作品不需要重复付费。"
    ],
    relatedIds: ["help-ar-fail", "help-generation-fail-count"]
  },
  {
    id: "help-trial-recovery",
    title: "怎么恢复我的试用权益？",
    summary: "系统异常时应保留或恢复试用权益。",
    meta: "失败与恢复",
    body: [
      "如果因为系统异常导致流程中断，用户应能进入异常恢复页查看处理建议。",
      "广告解锁获得的试用机会不应该因为系统异常被无故消耗。",
      "系统会根据当前状态保留或恢复可用权益。"
    ],
    relatedIds: ["help-generate-failed", "help-upload-failed"]
  },
  {
    id: "help-recovery",
    title: "失败与恢复规则说明",
    summary: "说明生成、上传和权益异常时的恢复方向。",
    meta: "失败与恢复",
    body: [
      "异常恢复页只处理广告、上传、生成等试用链路异常。",
      "系统异常导致生成未成功返回时，不应扣减优化次数。",
      "如果权益状态不明确，应提供重新查询或提交反馈入口。"
    ],
    relatedIds: ["help-trial-recovery", "help-generate-failed"]
  }
];

exports.HELP_GROUPS = [
  {
    id: "upload-generation",
    icon: "☁",
    title: "上传与生成",
    summary: "如何上传照片及素材要求、生成规则",
    articleId: "help-upload",
    keywords: ["上传", "照片", "素材", "生成", "清晰", "要求"],
    questions: [
      { id: "help-upload", text: "照片需要满足哪些要求？" },
      { id: "help-upload-few", text: "素材偏少能生成吗？" },
      { id: "help-generation-time", text: "生成需要多长时间？" }
    ]
  },
  {
    id: "optimize-quota",
    icon: "✦",
    title: "优化次数",
    summary: "关于优化次数的获取、使用与扣减规则",
    articleId: "help-optimize",
    keywords: ["优化", "次数", "广告", "扣减", "失败", "累计"],
    questions: [
      { id: "help-optimize", text: "优化次数如何获得？" },
      { id: "help-optimize-failed", text: "优化失败会扣次数吗？" },
      { id: "help-optimize-keep", text: "优化次数可以累计吗？" }
    ]
  },
  {
    id: "ar-usage",
    icon: "AR",
    title: "AR 使用",
    summary: "关于 AR 权益、使用方式与常见问题",
    articleId: "help-ar-unlock",
    keywords: ["AR", "解锁", "使用", "失败", "无限", "权益"],
    questions: [
      { id: "help-ar-unlock", text: "如何解锁当前作品 AR？" },
      { id: "help-ar-repeat", text: "AR 可以无限次使用吗？" },
      { id: "help-ar", text: "AR 失败了怎么办？" }
    ]
  },
  {
    id: "payment-rights",
    icon: "▣",
    title: "支付与权益",
    summary: "支付、权益到账与权益说明",
    articleId: "help-payment-rights",
    keywords: ["支付", "权益", "到账", "退款", "账号", "作品"],
    questions: [
      { id: "help-payment-rights", text: "支付成功但权益未到账？" },
      { id: "help-rights-bound", text: "权益是绑定账号还是作品？" },
      { id: "help-refund", text: "可以退款吗？" }
    ]
  },
  {
    id: "failure-recovery",
    icon: "✓",
    title: "失败与恢复",
    summary: "生成失败、上传失败、权益异常与恢复方法",
    articleId: "help-recovery",
    keywords: ["失败", "恢复", "异常", "上传失败", "生成失败", "试用权益"],
    questions: [
      { id: "help-generate-failed", text: "生成失败怎么办？" },
      { id: "help-upload-failed", text: "上传失败如何处理？" },
      { id: "help-trial-recovery", text: "怎么恢复我的试用权益？" }
    ]
  }
];
