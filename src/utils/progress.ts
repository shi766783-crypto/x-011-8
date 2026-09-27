import type { PlanMilestone, PlanProgress, StudyLog, StudyPlan } from '@/types'
import { daysBetween, today } from '@/utils/date'

/**
 * 计算单个计划的进度（纯函数）。
 * 规则：
 * - 已过天数 = 开始日期到今天的自然日（未开始为 0）
 * - 剩余天数 = 今天到结束日期的自然日（已结束为 0）
 * - 应完成学时 = min(已过天数 × 每日时长, 总学时)
 * - 实际学时 = 该计划关联日志的时长之和
 * - 进度百分比 = min(实际 / 总 × 100, 100)，手动完成视为 100%
 */
export function computePlanProgress(plan: StudyPlan, logs: StudyLog[]): PlanProgress {
  const todayKey = today()
  const totalDays = Math.max(daysBetween(plan.startDate, plan.endDate), 0)

  const elapsedDays = Math.max(daysBetween(plan.startDate, todayKey), 0)
  const remainingDays = Math.max(daysBetween(todayKey, plan.endDate), 0)

  const shouldHours = Math.min(elapsedDays * plan.dailyHours, plan.totalHours)
  const actualHours = logs
    .filter((l) => l.planId === plan.id)
    .reduce((sum, l) => sum + l.duration, 0)

  const manuallyCompleted = Boolean(plan.completedAt)
  const percent = manuallyCompleted ? 100 : Math.min((actualHours / plan.totalHours) * 100, 100)

  let status: PlanProgress['status']
  if (manuallyCompleted || percent >= 100) {
    status = '已完成'
  } else if (todayKey < plan.startDate) {
    status = '未开始'
  } else if (todayKey > plan.endDate) {
    status = '已逾期'
  } else {
    status = '进行中'
  }

  return {
    elapsedDays,
    remainingDays,
    totalDays,
    shouldHours,
    actualHours: Math.round(actualHours * 10) / 10,
    percent: Math.round(percent),
    status,
  }
}

/** 计划是否完成（供排行榜/成就判定复用） */
export function isPlanCompleted(plan: StudyPlan, logs: StudyLog[]): boolean {
  return computePlanProgress(plan, logs).status === '已完成'
}

/**
 * 里程碑在进度条上的位置（0-100），按开始/结束日期的时间轴线性计算。
 * 与时长进度相互独立：里程碑完成不会改变 computePlanProgress 的结果。
 * 日期超出计划区间时钳制到两端。
 */
export function milestonePosition(plan: StudyPlan, milestone: PlanMilestone): number {
  const span = daysBetween(plan.startDate, plan.endDate)
  if (span <= 0) return 0
  const offset = daysBetween(plan.startDate, milestone.targetDate)
  return Math.min(Math.max((offset / span) * 100, 0), 100)
}
