<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import type { Domain, PlanMilestone, StudyPlan, StudyResource } from '@/types'
import { DOMAINS } from '@/constants'
import { computePlanProgress, milestonePosition } from '@/utils/progress'
import { shortLabel, today } from '@/utils/date'
import { uid } from '@/utils/id'
import { useLogsStore } from '@/stores/logs'
import { usePlansStore } from '@/stores/plans'

const plansStore = usePlansStore()
const logsStore = useLogsStore()

const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const formRef = ref<FormInstance>()
const todayKey = today()

/** 弹窗内的里程碑草稿（保存时按名称过滤） */
type MilestoneDraft = Pick<PlanMilestone, 'id' | 'name' | 'targetDate'>

const emptyForm = (): {
  name: string
  domain: Domain
  goal: string
  startDate: string
  endDate: string
  totalHours: number
  dailyHours: number
  resources: StudyResource[]
  milestones: MilestoneDraft[]
} => ({
  name: '',
  domain: '编程',
  goal: '',
  startDate: today(),
  endDate: '',
  totalHours: 100,
  dailyHours: 2,
  resources: [],
  milestones: [],
})

const form = reactive(emptyForm())

const rules: FormRules = {
  name: [{ required: true, message: '请输入计划名称', trigger: 'blur' }],
  startDate: [{ required: true, message: '请选择开始日期', trigger: 'change' }],
  endDate: [{ required: true, message: '请选择结束日期', trigger: 'change' }],
  totalHours: [{ required: true, message: '请输入预计总学时', trigger: 'blur' }],
  dailyHours: [{ required: true, message: '请输入每日学习时长', trigger: 'blur' }],
}

const planViews = computed(() =>
  plansStore.plans.map((plan) => ({
    plan,
    progress: computePlanProgress(plan, logsStore.logs),
  })),
)

const statusTagType: Record<string, 'info' | 'success' | 'danger' | 'primary'> = {
  未开始: 'info',
  进行中: 'primary',
  已完成: 'success',
  已逾期: 'danger',
}

function openCreate(): void {
  editingId.value = null
  Object.assign(form, emptyForm())
  dialogVisible.value = true
}

function openEdit(plan: StudyPlan): void {
  editingId.value = plan.id
  Object.assign(form, {
    name: plan.name,
    domain: plan.domain,
    goal: plan.goal,
    startDate: plan.startDate,
    endDate: plan.endDate,
    totalHours: plan.totalHours,
    dailyHours: plan.dailyHours,
    resources: plan.resources.map((r) => ({ ...r })),
    milestones: plan.milestones.map((m) => ({
      id: m.id,
      name: m.name,
      targetDate: m.targetDate,
    })),
  })
  dialogVisible.value = true
}

function addResource(): void {
  form.resources.push({ id: uid(), name: '', link: '' })
}

function removeResource(index: number): void {
  form.resources.splice(index, 1)
}

function addMilestone(): void {
  form.milestones.push({ id: uid(), name: '', targetDate: '' })
}

function removeMilestone(index: number): void {
  form.milestones.splice(index, 1)
}

async function save(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  const validDrafts = form.milestones.filter((m) => m.name.trim() !== '')
  if (validDrafts.some((m) => !m.targetDate)) {
    ElMessage.warning('请为每个里程碑选择目标日期')
    return
  }
  const payload = {
    name: form.name.trim(),
    domain: form.domain,
    goal: form.goal.trim(),
    startDate: form.startDate,
    endDate: form.endDate,
    totalHours: form.totalHours,
    dailyHours: form.dailyHours,
    resources: form.resources.filter((r) => r.name.trim() !== ''),
  }
  if (editingId.value) {
    const existing = plansStore.plans.find((p) => p.id === editingId.value)
    // 沿用草稿的稳定 id；编辑中保留的里程碑回填原完成状态
    const milestones: PlanMilestone[] = validDrafts.map((draft) => {
      const previous = existing?.milestones.find((m) => m.id === draft.id)
      return {
        id: draft.id,
        name: draft.name.trim(),
        targetDate: draft.targetDate,
        ...(previous?.completedAt ? { completedAt: previous.completedAt } : {}),
      }
    })
    plansStore.updatePlan(editingId.value, { ...payload, milestones })
    ElMessage.success('计划已更新')
  } else {
    plansStore.addPlan({
      ...payload,
      milestones: validDrafts.map((draft) => ({
        id: draft.id,
        name: draft.name.trim(),
        targetDate: draft.targetDate,
      })),
    })
    ElMessage.success('计划已创建')
  }
  dialogVisible.value = false
}

function removePlan(plan: StudyPlan): void {
  plansStore.removePlan(plan.id)
  ElMessage.success('计划已删除')
}
</script>

<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">学习计划</h2>
      <el-button type="primary" @click="openCreate">新建计划</el-button>
    </div>

    <el-empty v-if="planViews.length === 0" description="还没有学习计划，点击右上角新建" />

    <div class="plan-list">
      <el-card v-for="{ plan, progress } in planViews" :key="plan.id" class="plan-card" shadow="hover">
        <div class="plan-head">
          <div class="plan-title">
            <span class="plan-name">{{ plan.name }}</span>
            <el-tag size="small" :type="statusTagType[progress.status]">{{ progress.status }}</el-tag>
          </div>
          <el-tag size="small" effect="plain">{{ plan.domain }}</el-tag>
        </div>

        <p class="plan-goal">{{ plan.goal || '暂无目标描述' }}</p>

        <div class="progress-row">
          <div class="progress-wrap">
            <el-progress
              :percentage="progress.percent"
              :show-text="false"
              :status="progress.status === '已逾期' ? 'exception' : progress.status === '已完成' ? 'success' : undefined"
              :stroke-width="12"
            />
            <el-tooltip
              v-for="m in plan.milestones"
              :key="m.id"
              :content="`${m.name} · ${shortLabel(m.targetDate)}${m.completedAt ? '（已完成）' : ''}`"
              placement="top"
            >
              <span
                class="milestone-dot"
                :class="{
                  done: Boolean(m.completedAt),
                  overdue: !m.completedAt && m.targetDate < todayKey,
                }"
                :style="{ left: `${milestonePosition(plan, m)}%` }"
                @click="plansStore.toggleMilestone(plan.id, m.id)"
              />
            </el-tooltip>
          </div>
          <span class="progress-percent">{{ progress.percent }}%</span>
        </div>

        <ul v-if="plan.milestones.length" class="milestone-list">
          <li
            v-for="m in plan.milestones"
            :key="m.id"
            class="milestone-item"
            :class="{ done: Boolean(m.completedAt) }"
            @click="plansStore.toggleMilestone(plan.id, m.id)"
          >
            <span class="milestone-icon">{{ m.completedAt ? '✓' : '' }}</span>
            <span class="milestone-name">{{ m.name }}</span>
            <span class="milestone-date">{{ shortLabel(m.targetDate) }}</span>
          </li>
        </ul>

        <div class="plan-meta">
          <span>已过 {{ progress.elapsedDays }} 天</span>
          <span>剩余 {{ progress.remainingDays }} 天</span>
          <span>应完成 {{ progress.shouldHours }}h</span>
          <span>实际 {{ progress.actualHours }}h / {{ plan.totalHours }}h</span>
          <span v-if="plan.milestones.length">
            里程碑 {{ plan.milestones.filter((m) => m.completedAt).length }}/{{ plan.milestones.length }}
          </span>
        </div>

        <div class="plan-resources" v-if="plan.resources.length">
          <el-link
            v-for="r in plan.resources"
            :key="r.id"
            type="primary"
            :href="r.link || undefined"
            :target="r.link ? '_blank' : undefined"
            class="resource-link"
          >
            {{ r.name }}
          </el-link>
        </div>

        <div class="plan-actions">
          <el-button size="small" @click="openEdit(plan)">编辑</el-button>
          <el-button
            v-if="progress.status !== '已完成'"
            size="small"
            type="success"
            @click="plansStore.toggleComplete(plan.id)"
          >
            标记完成
          </el-button>
          <el-popconfirm title="确定删除该计划？" @confirm="removePlan(plan)">
            <template #reference>
              <el-button size="small" type="danger">删除</el-button>
            </template>
          </el-popconfirm>
        </div>
      </el-card>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑计划' : '新建计划'"
      width="620px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px">
        <el-form-item label="计划名称" prop="name">
          <el-input v-model="form.name" placeholder="如：三个月攻克雅思" />
        </el-form-item>
        <el-form-item label="学习领域" prop="domain">
          <el-select v-model="form.domain" style="width: 100%">
            <el-option v-for="d in DOMAINS" :key="d" :label="d" :value="d" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标描述" prop="goal">
          <el-input v-model="form.goal" type="textarea" :rows="2" placeholder="描述你想达成的目标" />
        </el-form-item>
        <el-form-item label="开始日期" prop="startDate">
          <el-date-picker v-model="form.startDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="结束日期" prop="endDate">
          <el-date-picker v-model="form.endDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="预计总学时" prop="totalHours">
          <el-input-number v-model="form.totalHours" :min="1" :step="10" style="width: 100%" />
        </el-form-item>
        <el-form-item label="每日时长" prop="dailyHours">
          <el-input-number v-model="form.dailyHours" :min="0.5" :step="0.5" style="width: 100%" />
        </el-form-item>

        <el-form-item label="学习资源">
          <div class="resource-editor">
            <div v-for="(r, i) in form.resources" :key="r.id" class="resource-row">
              <el-input v-model="r.name" placeholder="资源名称" />
              <el-input v-model="r.link" placeholder="链接(可选)" />
              <el-button type="danger" plain @click="removeResource(i)">删除</el-button>
            </div>
            <el-button type="primary" plain @click="addResource">+ 添加资源</el-button>
          </div>
        </el-form-item>

        <el-form-item label="里程碑">
          <div class="resource-editor">
            <div v-for="(m, i) in form.milestones" :key="m.id" class="resource-row">
              <el-input v-model="m.name" placeholder="阶段节点，如：完成基础语法" />
              <el-date-picker
                v-model="m.targetDate"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="目标日期"
                style="width: 150px"
              />
              <el-button type="danger" plain @click="removeMilestone(i)">删除</el-button>
            </div>
            <el-button type="primary" plain @click="addMilestone">+ 添加里程碑</el-button>
            <span class="milestone-hint">里程碑按目标日期标注在进度条上，可单独标记完成</span>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.plan-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
}

.plan-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.plan-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.plan-name {
  font-size: 16px;
  font-weight: 600;
  color: #1f2d3d;
}

.plan-goal {
  color: #606266;
  font-size: 13px;
  min-height: 36px;
  margin: 8px 0 12px;
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-wrap {
  position: relative;
  flex: 1;
}

.progress-percent {
  font-size: 12px;
  color: #606266;
  min-width: 36px;
  text-align: right;
}

/* 进度条上的里程碑标记：位置由目标日期在时间轴上的比例决定 */
.milestone-dot {
  position: absolute;
  top: 50%;
  left: 0;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid #e6a23c;
  transform: translate(-50%, -50%);
  cursor: pointer;
  z-index: 1;
  box-sizing: border-box;
  transition: background 0.2s, border-color 0.2s;
}

.milestone-dot:hover {
  box-shadow: 0 0 0 3px rgb(230 162 60 / 20%);
}

.milestone-dot.done {
  background: #67c23a;
  border-color: #67c23a;
}

.milestone-dot.overdue {
  border-color: #f56c6c;
}

.milestone-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.milestone-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #606266;
  background: #f4f4f5;
  border-radius: 12px;
  padding: 3px 10px;
  cursor: pointer;
  user-select: none;
}

.milestone-item:hover {
  background: #e9e9eb;
}

.milestone-item.done {
  color: #67c23a;
}

.milestone-item.done .milestone-name {
  text-decoration: line-through;
}

.milestone-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border: 1.5px solid #c0c4cc;
  border-radius: 50%;
  font-size: 10px;
  line-height: 1;
}

.milestone-item.done .milestone-icon {
  background: #67c23a;
  border-color: #67c23a;
  color: #fff;
}

.milestone-date {
  color: #909399;
}

.milestone-item.done .milestone-date {
  color: #67c23a;
}

.milestone-hint {
  margin-left: 10px;
  font-size: 12px;
  color: #909399;
}

.plan-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: #909399;
  margin-top: 10px;
}

.plan-resources {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.resource-link {
  font-size: 12px;
}

.plan-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.resource-editor {
  width: 100%;
}

.resource-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
</style>
