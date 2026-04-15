export type TransitionType = 'fade' | 'zoom' | 'glitch' | 'swipe' | 'none'
export type TemplateType = 'vlog' | 'product' | 'education'

export interface SceneTemplate {
  id: string
  label: string         // 场景名称，如"开场 Hook"
  durationSec: number   // 默认时长（秒）
  transition: TransitionType
  promptHint: string    // 附加给 AI 的场景提示词
}

export interface StoryboardTemplate {
  type: TemplateType
  name: string          // 模板显示名称
  description: string   // 简要说明
  icon: string          // lucide icon 名称
  color: string         // tailwind 色彩 class（用于标签/时间轴配色）
  systemPrompt: string  // 附加给 LLM 的风格说明
  scenes: SceneTemplate[]
}

export const STORYBOARD_TEMPLATES: Record<TemplateType, StoryboardTemplate> = {
  vlog: {
    type: 'vlog',
    name: 'Vlog / 生活记录',
    description: '第一人称视角，轻松节奏，适合旅行、日常、探店等内容',
    icon: 'Camera',
    color: 'bg-pink-500',
    systemPrompt:
      'Video style: lifestyle vlog, first-person perspective, casual and warm tone. ' +
      'Use close-up everyday moments, natural lighting, authentic reactions. ' +
      'Avoid overly formal composition.',
    scenes: [
      { id: 'vlog-1', label: '开场 Hook',   durationSec: 5,  transition: 'zoom',  promptHint: 'Attention-grabbing opener, exciting moment or surprising question' },
      { id: 'vlog-2', label: '主题介绍',    durationSec: 8,  transition: 'fade',  promptHint: 'Introduce the main topic naturally, show location or context' },
      { id: 'vlog-3', label: '核心内容 1',  durationSec: 10, transition: 'swipe', promptHint: 'Main activity or highlight moment, authentic footage' },
      { id: 'vlog-4', label: '核心内容 2',  durationSec: 10, transition: 'swipe', promptHint: 'Secondary highlight, a different angle or moment' },
      { id: 'vlog-5', label: '结尾 CTA',   durationSec: 5,  transition: 'fade',  promptHint: 'Warm closing with call to action: like, follow, comment' },
    ],
  },

  product: {
    type: 'product',
    name: '产品展示',
    description: '突出卖点，近景特写，适合开箱、评测、种草等内容',
    icon: 'ShoppingBag',
    color: 'bg-blue-500',
    systemPrompt:
      'Video style: product showcase, clean and professional. ' +
      'Use close-up shots of product details, demonstrate key features, show real-world usage. ' +
      'Emphasize benefits over specs.',
    scenes: [
      { id: 'prod-1', label: '产品亮相',    durationSec: 4,  transition: 'zoom',  promptHint: 'Dramatic product reveal, clean background, hero shot' },
      { id: 'prod-2', label: '核心卖点 1',  durationSec: 8,  transition: 'fade',  promptHint: 'Close-up of the most important feature, demonstrate it in action' },
      { id: 'prod-3', label: '核心卖点 2',  durationSec: 8,  transition: 'swipe', promptHint: 'Second key feature, show problem it solves' },
      { id: 'prod-4', label: '使用场景',    durationSec: 8,  transition: 'fade',  promptHint: 'Show product being used in real life by real person' },
      { id: 'prod-5', label: '行动号召',    durationSec: 4,  transition: 'zoom',  promptHint: 'Price reveal, discount, urgency: limited time offer' },
    ],
  },

  education: {
    type: 'education',
    name: '知识科普',
    description: '清晰讲解，逻辑递进，适合教程、知识分享、科普等内容',
    icon: 'BookOpen',
    color: 'bg-green-500',
    systemPrompt:
      'Video style: educational and informative, clear and engaging. ' +
      'Use visual explanations, diagrams if possible, step-by-step progression. ' +
      'Make complex ideas accessible with simple language.',
    scenes: [
      { id: 'edu-1', label: '问题引入',    durationSec: 6,  transition: 'fade',  promptHint: 'Start with a relatable question or surprising fact to hook viewers' },
      { id: 'edu-2', label: '背景知识',    durationSec: 8,  transition: 'swipe', promptHint: 'Provide necessary context or foundational concepts' },
      { id: 'edu-3', label: '核心讲解',    durationSec: 12, transition: 'none',  promptHint: 'Main explanation with clear visuals, step-by-step breakdown' },
      { id: 'edu-4', label: '案例演示',    durationSec: 10, transition: 'swipe', promptHint: 'Concrete real-world example that illustrates the concept' },
      { id: 'edu-5', label: '总结回顾',    durationSec: 6,  transition: 'fade',  promptHint: 'Quick recap of key points, memorable takeaway phrase' },
    ],
  },
}

/** 将模板默认场景转为可编辑场景（拷贝一份，避免直接修改常量） */
export function cloneTemplateScenesAsEditable(
  type: TemplateType
): EditableScene[] {
  return STORYBOARD_TEMPLATES[type].scenes.map((s) => ({
    id: s.id + '-' + Math.random().toString(36).slice(2, 6),
    label: s.label,
    durationSec: s.durationSec,
    transition: s.transition,
    textOverlay: '',
    promptHint: s.promptHint,
  }))
}

/** 可编辑场景（用户实际操作的数据） */
export interface EditableScene {
  id: string
  label: string
  durationSec: number
  transition: TransitionType
  textOverlay: string
  promptHint: string
}
