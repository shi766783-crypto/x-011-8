import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PlanInput, StudyPlan } from '@/types'
import { STORAGE_KEYS } from '@/constants'
import { read, write } from '@/services/storage'
import { uid } from '@/utils/id'

export const usePlansStore = defineStore('plans', () => {
  // 兼容旧数据：早期持久化的计划没有 milestones 字段，读取时补空数组
  const plans = ref<StudyPlan[]>(
    read<StudyPlan[]>(STORAGE_KEYS.plans, []).map((p) => ({ ...p, milestones: p.milestones ?? [] })),
  )

  function persist(): void {
    write(STORAGE_KEYS.plans, plans.value)
  }

  function addPlan(input: PlanInput): StudyPlan {
    const plan: StudyPlan = {
      ...input,
      milestones: input.milestones ?? [],
      id: uid(),
      createdAt: new Date().toISOString(),
    }
    plans.value.unshift(plan)
    persist()
    return plan
  }

  function updatePlan(id: string, patch: Partial<StudyPlan>): void {
    const target = plans.value.find((p) => p.id === id)
    if (target) {
      Object.assign(target, patch)
      persist()
    }
  }

  function removePlan(id: string): void {
    plans.value = plans.value.filter((p) => p.id !== id)
    persist()
  }

  function toggleComplete(id: string): void {
    const target = plans.value.find((p) => p.id === id)
    if (!target) return
    target.completedAt = target.completedAt ? undefined : new Date().toISOString()
    persist()
  }

  /** 单独标记/取消某个里程碑完成；只记录完成时间，不影响时长进度算法 */
  function toggleMilestone(planId: string, milestoneId: string): void {
    const plan = plans.value.find((p) => p.id === planId)
    const milestone = plan?.milestones.find((m) => m.id === milestoneId)
    if (!milestone) return
    milestone.completedAt = milestone.completedAt ? undefined : new Date().toISOString()
    persist()
  }

  return { plans, addPlan, updatePlan, removePlan, toggleComplete, toggleMilestone }
})
