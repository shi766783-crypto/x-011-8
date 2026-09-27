import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PlanInput, StudyPlan } from '@/types'
import { STORAGE_KEYS } from '@/constants'
import { read, write } from '@/services/storage'
import { uid } from '@/utils/id'

/** 兼容早于里程碑功能创建的本地计划：补齐内嵌里程碑数组 */
function normalize(plan: StudyPlan): StudyPlan {
  return Array.isArray(plan.milestones) ? plan : { ...plan, milestones: [] }
}

export const usePlansStore = defineStore('plans', () => {
  const plans = ref<StudyPlan[]>(read<StudyPlan[]>(STORAGE_KEYS.plans, []).map(normalize))

  function persist(): void {
    write(STORAGE_KEYS.plans, plans.value)
  }

  function addPlan(input: PlanInput): StudyPlan {
    const plan: StudyPlan = {
      ...input,
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

  /** 删除计划时内嵌里程碑随计划记录一并清除，无需额外清理 */
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

  /** 单独切换某个里程碑的完成状态，仅记录里程碑自身的完成时间 */
  function toggleMilestone(planId: string, milestoneId: string): void {
    const target = plans.value.find((p) => p.id === planId)
    const milestone = target?.milestones.find((m) => m.id === milestoneId)
    if (!milestone) return
    milestone.completedAt = milestone.completedAt ? undefined : new Date().toISOString()
    persist()
  }

  return { plans, addPlan, updatePlan, removePlan, toggleComplete, toggleMilestone }
})
