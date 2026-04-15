import { useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  GripVertical,
  Plus,
  Trash2,
  Camera,
  ShoppingBag,
  BookOpen,
  Clock,
  Film,
} from 'lucide-react'
import {
  type TemplateType,
  type EditableScene,
  type TransitionType,
  STORYBOARD_TEMPLATES,
  cloneTemplateScenesAsEditable,
} from '@/lib/storyboard-templates'

// ---------- Types ----------

interface StoryboardEditorProps {
  templateType: TemplateType
  onTemplateChange: (type: TemplateType) => void
  scenes: EditableScene[]
  onScenesChange: (scenes: EditableScene[]) => void
}

// ---------- Helpers ----------

const TEMPLATE_ICONS: Record<TemplateType, React.ComponentType<{ className?: string }>> = {
  vlog: Camera,
  product: ShoppingBag,
  education: BookOpen,
}

const TIMELINE_COLORS: string[] = [
  'bg-pink-400',
  'bg-blue-400',
  'bg-green-400',
  'bg-orange-400',
  'bg-purple-400',
  'bg-yellow-400',
  'bg-cyan-400',
  'bg-red-400',
]

const TRANSITIONS: TransitionType[] = ['fade', 'zoom', 'swipe', 'glitch', 'none']

function newEmptyScene(): EditableScene {
  return {
    id: 'scene-' + Math.random().toString(36).slice(2, 8),
    label: '新场景',
    durationSec: 5,
    transition: 'fade',
    textOverlay: '',
    promptHint: '',
  }
}

// ---------- Scene Card ----------

interface SceneCardProps {
  scene: EditableScene
  index: number
  isDragOver: boolean
  onUpdate: (updates: Partial<EditableScene>) => void
  onRemove: () => void
  onDragStart: (index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDrop: (e: React.DragEvent, index: number) => void
  onDragEnd: () => void
}

function SceneCard({
  scene,
  index,
  isDragOver,
  onUpdate,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: SceneCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
      className={`rounded-lg border transition-all ${
        isDragOver
          ? 'border-primary border-2 bg-primary/5 scale-[1.01]'
          : 'border-border bg-card'
      }`}
    >
      {/* Header row */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <GripVertical className="w-4 h-4 text-muted-foreground/50 shrink-0 cursor-grab" />
        <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
          {index + 1}
        </span>
        <span className="flex-1 text-sm font-medium truncate">{scene.label}</span>

        {/* Duration badge */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{scene.durationSec}s</span>
        </div>

        {/* Transition badge */}
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 hidden sm:flex">
          {scene.transition}
        </Badge>

        {/* Delete */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t pt-3">
          {/* Label */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">场景名称</Label>
            <Input
              value={scene.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              className="h-8 text-sm"
              placeholder="场景名称"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Duration */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">时长（秒）</Label>
            <Input
              type="number"
              min={1}
              max={60}
              value={scene.durationSec}
              onChange={(e) => onUpdate({ durationSec: Math.max(1, parseInt(e.target.value) || 1) })}
              className="h-8 text-sm"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Transition */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">转场效果</Label>
            <Select
              value={scene.transition}
              onValueChange={(v) => onUpdate({ transition: v as TransitionType })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSITIONS.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Text overlay */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">文字叠加（可选）</Label>
            <Input
              value={scene.textOverlay}
              onChange={(e) => onUpdate({ textOverlay: e.target.value })}
              className="h-8 text-sm"
              placeholder="屏幕上显示的文字"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Prompt hint */}
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">AI 提示补充（帮助大模型理解该场景）</Label>
            <Input
              value={scene.promptHint}
              onChange={(e) => onUpdate({ promptHint: e.target.value })}
              className="h-8 text-sm"
              placeholder="例如：近景特写产品细节，光线充足"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Timeline Preview ----------

function TimelinePreview({ scenes }: { scenes: EditableScene[] }) {
  const total = scenes.reduce((s, c) => s + c.durationSec, 0)
  if (total === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Film className="w-3 h-3" />
          草稿预览时间轴
        </span>
        <span className="font-medium">总时长 {total}s</span>
      </div>

      {/* Timeline bar */}
      <div className="flex h-10 rounded-lg overflow-hidden border border-border w-full">
        {scenes.map((scene, idx) => {
          const widthPct = (scene.durationSec / total) * 100
          const colorClass = TIMELINE_COLORS[idx % TIMELINE_COLORS.length]
          return (
            <div
              key={scene.id}
              className={`${colorClass} relative flex items-center justify-center group cursor-default overflow-hidden`}
              style={{ width: `${widthPct}%`, minWidth: '2px' }}
              title={`${scene.label} · ${scene.durationSec}s · 转场: ${scene.transition}`}
            >
              {widthPct > 8 && (
                <span className="text-[10px] text-white font-medium truncate px-1 leading-none">
                  {scene.label}
                </span>
              )}
              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover text-popover-foreground text-[11px] rounded shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 border">
                {scene.label} · {scene.durationSec}s · {scene.transition}
              </div>
            </div>
          )
        })}
      </div>

      {/* Scene stamps */}
      <div className="flex flex-wrap gap-1">
        {scenes.map((scene, idx) => (
          <span key={scene.id} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className={`w-2 h-2 rounded-full ${TIMELINE_COLORS[idx % TIMELINE_COLORS.length]}`} />
            {scene.label} {scene.durationSec}s
          </span>
        ))}
      </div>
    </div>
  )
}

// ---------- Main Component ----------

export function StoryboardEditor({
  templateType,
  onTemplateChange,
  scenes,
  onScenesChange,
}: StoryboardEditorProps) {
  const dragIndex = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const templates = Object.values(STORYBOARD_TEMPLATES)

  // ---- Template tab switch ----
  const handleTemplateChange = (type: TemplateType) => {
    onTemplateChange(type)
    onScenesChange(cloneTemplateScenesAsEditable(type))
  }

  // ---- Scene mutations ----
  const updateScene = (id: string, updates: Partial<EditableScene>) => {
    onScenesChange(scenes.map((s) => (s.id === id ? { ...s, ...updates } : s)))
  }

  const removeScene = (id: string) => {
    onScenesChange(scenes.filter((s) => s.id !== id))
  }

  const addScene = () => {
    onScenesChange([...scenes, newEmptyScene()])
  }

  // ---- Drag-and-drop (HTML5 native) ----
  const handleDragStart = (index: number) => {
    dragIndex.current = index
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    const fromIndex = dragIndex.current
    if (fromIndex === null || fromIndex === dropIndex) return
    const next = [...scenes]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(dropIndex, 0, moved)
    onScenesChange(next)
    dragIndex.current = null
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    dragIndex.current = null
    setDragOverIndex(null)
  }

  const currentTemplate = STORYBOARD_TEMPLATES[templateType]

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center text-base">
          <Film className="w-4 h-4 mr-2 text-primary" />
          分镜模板编辑器
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Template selector tabs */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">选择视频类型</Label>
          <div className="flex gap-2 flex-wrap">
            {templates.map((tpl) => {
              const Icon = TEMPLATE_ICONS[tpl.type]
              const isActive = tpl.type === templateType
              return (
                <button
                  key={tpl.type}
                  type="button"
                  onClick={() => handleTemplateChange(tpl.type)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tpl.name}
                </button>
              )
            })}
          </div>
          {currentTemplate && (
            <p className="text-xs text-muted-foreground pl-1">
              {currentTemplate.description}
            </p>
          )}
        </div>

        {/* Scene list */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            场景列表（拖拽 ☰ 可重新排序，点击展开编辑）
          </Label>

          {scenes.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg">
              暂无场景，点击下方按钮添加
            </p>
          )}

          <div className="space-y-2">
            {scenes.map((scene, idx) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                index={idx}
                isDragOver={dragOverIndex === idx}
                onUpdate={(updates) => updateScene(scene.id, updates)}
                onRemove={() => removeScene(scene.id)}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
              />
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full border-dashed"
            onClick={addScene}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            添加场景
          </Button>
        </div>

        {/* Timeline preview */}
        {scenes.length > 0 && (
          <div className="pt-1 border-t">
            <TimelinePreview scenes={scenes} />
          </div>
        )}

      </CardContent>
    </Card>
  )
}
