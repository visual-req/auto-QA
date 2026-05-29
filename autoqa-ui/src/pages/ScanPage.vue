<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAutoQaStore } from '../store/autoqaStore'

const props = defineProps({
  active: { type: Boolean, default: false }
})
const emit = defineEmits(['goRules'])

const store = useAutoQaStore()
const showMissingFilesModel = computed({
  get: () => !!store.showMissingFiles.value,
  set: (v) => {
    store.showMissingFiles.value = !!v
  }
})
const resultProjectTabModel = computed({
  get: () => store.resultProjectTab.value,
  set: (v) => {
    store.resultProjectTab.value = v
  }
})
const resultStageTabModel = computed({
  get: () => store.resultStageTab.value,
  set: (v) => {
    store.resultStageTab.value = v
  }
})
const topAreaCollapsed = ref(false)
const detailDrawerOpen = ref(false)
const detailRecord = ref(null)
const skippedDrawerOpen = ref(false)
const projectFilesDrawerOpen = ref(false)
const projectFilesDrawerProject = ref('')

const projectFilesDrawerRows = computed(() => {
  const p = String(projectFilesDrawerProject.value || '').trim()
  if (!p) return []
  const files = store.scanFiles.value.filter((f) => store.projectNameOfFile(f) === p)
  const rows = files
    .map((f) => ({
      key: String(f?.webkitRelativePath || store.withinProjectPathOfFile(f) || f?.name || '').trim() || String(f?.name || ''),
      path: String(f?.webkitRelativePath || store.withinProjectPathOfFile(f) || f?.name || '').trim() || String(f?.name || '')
    }))
    .filter((x) => x.path)
  rows.sort((a, b) => String(a.path).localeCompare(String(b.path)))
  return rows
})

function formatBytes(bytes) {
  const n = Number(bytes || 0) || 0
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(k)))
  const v = n / Math.pow(k, i)
  return `${v >= 10 || i === 0 ? Math.round(v) : Math.round(v * 10) / 10} ${units[i]}`
}

const skippedColumns = [
  { title: '原因', dataIndex: 'reason', key: 'reason', width: 200 },
  { title: '路径', dataIndex: 'path', key: 'path' },
  { title: '大小', dataIndex: 'size', key: 'size', width: 110 }
]

function openDetail(record) {
  detailRecord.value = record || null
  detailDrawerOpen.value = true
}

function openProjectFiles(project) {
  projectFilesDrawerProject.value = String(project || '').trim()
  projectFilesDrawerOpen.value = true
}

function openProjectDrawer() {
  if (store.drawerOpen.value) {
    store.drawerOpen.value = false
    setTimeout(() => {
      store.drawerOpen.value = true
    }, 0)
    return
  }
  store.drawerOpen.value = true
}

const chartByRuleEl = ref()
const chartByProjectEl = ref()
const chartBySeverityEl = ref()
let chartByRule
let chartByProject
let chartBySeverity

function getEcharts() {
  return globalThis?.echarts
}

function ensureCharts() {
  const echarts = getEcharts()
  if (!echarts) return

  if (chartByRuleEl.value && (!chartByRule || chartByRule.getDom?.() !== chartByRuleEl.value)) {
    chartByRule?.dispose?.()
    chartByRule = echarts.init(chartByRuleEl.value)
  }

  if (chartByProjectEl.value && (!chartByProject || chartByProject.getDom?.() !== chartByProjectEl.value)) {
    chartByProject?.dispose?.()
    chartByProject = echarts.init(chartByProjectEl.value)
  }

  if (chartBySeverityEl.value && (!chartBySeverity || chartBySeverity.getDom?.() !== chartBySeverityEl.value)) {
    chartBySeverity?.dispose?.()
    chartBySeverity = echarts.init(chartBySeverityEl.value)
  }
}

async function updateCharts() {
  if (!props.active) {
    disposeCharts()
    return
  }

  await nextTick()
  ensureCharts()

  const data = store.filteredFindings.value
  const topRules = store.buildTopEntries(data, (x) => x.rule, 12)
  const topProjects = store.buildTopEntries(data, (x) => x.project, 12)
  const severityCounts = [
    ['高', data.filter((x) => x.severity === 'high').length],
    ['中', data.filter((x) => x.severity === 'medium').length],
    ['低', data.filter((x) => x.severity === 'low').length]
  ]

  if (chartByRule) {
    chartByRule.setOption({
      title: { text: '问题类型最多（按规则）', left: 'center' },
      grid: { left: 40, right: 20, top: 55, bottom: 40, containLabel: true },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: topRules.map((x) => x[0]), axisLabel: { interval: 0 } },
      series: [{ type: 'bar', data: topRules.map((x) => x[1]) }]
    })
  }

  if (chartByProject) {
    chartByProject.setOption({
      title: { text: '哪个项目问题多（按项目）', left: 'center' },
      grid: { left: 40, right: 20, top: 55, bottom: 40, containLabel: true },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: topProjects.map((x) => x[0]), axisLabel: { interval: 0, rotate: 20 } },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', data: topProjects.map((x) => x[1]) }]
    })
  }

  if (chartBySeverity) {
    chartBySeverity.setOption({
      title: { text: '严重性分布', left: 'center' },
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['35%', '60%'],
          data: severityCounts.map(([name, value]) => ({ name, value })),
          label: { formatter: '{b}：{c}' }
        }
      ]
    })
  }

  chartByRule?.resize?.()
  chartByProject?.resize?.()
  chartBySeverity?.resize?.()
}

function disposeCharts() {
  chartByRule?.dispose?.()
  chartByProject?.dispose?.()
  chartBySeverity?.dispose?.()
  chartByRule = undefined
  chartByProject = undefined
  chartBySeverity = undefined
}

const onResize = () => {
  chartByRule?.resize?.()
  chartByProject?.resize?.()
  chartBySeverity?.resize?.()
}

onMounted(() => {
  window.addEventListener('resize', onResize)
  updateCharts()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  disposeCharts()
})

watch([store.filteredFindings, () => props.active], () => updateCharts(), { deep: true })
</script>

<template>
  <div class="top-area-toggle">
    <a-button size="small" @click="topAreaCollapsed = !topAreaCollapsed">
      {{ topAreaCollapsed ? '展开顶部区域' : '折叠顶部区域' }}
    </a-button>
  </div>
  <a-row :gutter="[16, 16]">
    <template v-if="!topAreaCollapsed">
      <a-col :xs="24" :lg="10">
        <a-card :bordered="false" class="input-card">
          <template #title>
            <a-space>
              <span>选择输入</span>
              <a-typography-link @click="openProjectDrawer">目录建议</a-typography-link>
            </a-space>
          </template>
          <div class="input-card-inner">
            <div class="input-scroll">
              <a-space direction="vertical" style="width: 100%">
                <div>
                  <a-space>
                    <a-typography-text strong>工作目录</a-typography-text>
                  </a-space>
                  <a-upload
                    :file-list="store.folderFileList.value"
                    directory
                    multiple
                    :before-upload="store.beforeUploadStop"
                    @change="store.onFolderChange"
                  >
                    <a-button>选择目录</a-button>
                  </a-upload>
                  <div class="hint">
                    <a-typography-text type="secondary">{{ store.folderSummaryText.value }}</a-typography-text>
                  </div>
                  <div v-if="Array.isArray(store.skippedFiles.value) && store.skippedFiles.value.length" class="hint">
                    <a-typography-link @click="skippedDrawerOpen = true">
                      查看已跳过的文件（{{ store.skippedFiles.value.length }}）
                    </a-typography-link>
                  </div>
                </div>

                <div class="hint">
                  <a-space>
                    <a-typography-text type="secondary">可扫描文件：{{ store.scanFiles.value.length }}</a-typography-text>
                  </a-space>
                </div>
              </a-space>
            </div>

            <div class="input-actions">
              <a-space direction="vertical" style="width: 100%">
                <a-space wrap>
                  <a-button
                    type="primary"
                    :disabled="!store.canStart.value"
                    :loading="store.scanning.value"
                    @click="store.startScan"
                  >
                    开始扫描
                  </a-button>
                </a-space>

                <a-alert
                  v-if="store.statusText.value"
                  :message="store.statusText.value"
                  type="info"
                  show-icon
                  :closable="false"
                />

                <a-progress v-if="store.scanning.value" :percent="store.progress.value" />
              </a-space>
            </div>
          </div>
        </a-card>
      </a-col>

      <a-col :xs="24" :lg="14">
        <a-card title="扫描进度（按项目）" :bordered="false">
          <a-space direction="vertical" style="width: 100%">
            <a-table
              :columns="store.scanProgressColumns"
              :data-source="store.scanStatsByProject.value"
              row-key="project"
              :pagination="false"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'doneChecks'">
                  {{ record.doneChecks }} / {{ record.totalChecks }}
                </template>
                <template v-else-if="column.key === 'totalFiles'">
                  <a-typography-link @click="openProjectFiles(record.project)">{{ record.totalFiles }}</a-typography-link>
                </template>
                <template v-else-if="column.key === 'progress'">
                  <a-progress :percent="record.percent" size="small" :status="store.scanning.value ? 'active' : 'normal'" />
                </template>
              </template>
            </a-table>

            <a-alert
              v-if="!store.rulesHydrating.value && !store.rules.value.length"
              message="未设置规则：请先在顶部菜单「规则」中选择并解析规则 Excel"
              type="warning"
              show-icon
              :closable="false"
            >
              <template #action>
                <a-button size="small" type="primary" @click="emit('goRules')">去设置规则</a-button>
              </template>
            </a-alert>
          </a-space>
        </a-card>
      </a-col>
    </template>

    <a-col :xs="24">
      <a-card :bordered="false">
        <template #title>
          <div class="result-title">
            <a-space>
              <span>扫描结果</span>
              <a-checkable-tag
                :checked="store.selectedSeverity.value.includes('high')"
                @change="(checked) => store.setSeverityChecked('high', checked)"
              >
                高
              </a-checkable-tag>
              <a-checkable-tag
                :checked="store.selectedSeverity.value.includes('medium')"
                @change="(checked) => store.setSeverityChecked('medium', checked)"
              >
                中
              </a-checkable-tag>
              <a-checkable-tag
                :checked="store.selectedSeverity.value.includes('low')"
                @change="(checked) => store.setSeverityChecked('low', checked)"
              >
                低
              </a-checkable-tag>
              <a-space size="small">
                <a-switch v-model:checked="showMissingFilesModel" />
                <span>缺少文件</span>
              </a-space>
              <span>（{{ store.filteredFindings.value.length }} 条）</span>
            </a-space>
            <a-button type="primary" :disabled="store.filteredFindings.value.length === 0" @click="store.downloadExcel">
              下载报告(Excel)
            </a-button>
          </div>
        </template>

        <a-tabs v-model:activeKey="resultProjectTabModel" size="small">
          <a-tab-pane v-for="t in store.resultProjectTabs.value" :key="t.key" :tab="t.label" />
        </a-tabs>

        <a-tabs v-model:activeKey="resultStageTabModel" size="small">
          <a-tab-pane v-for="t in store.resultStageTabs.value" :key="t.key" :tab="t.label" />
        </a-tabs>

        <a-table
          :columns="store.findingsColumns"
          :data-source="store.filteredFindings.value"
          :pagination="{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (total) => `共 ${total} 条`
          }"
          row-key="id"
          size="middle"
        >
          <template #expandedRowRender="{ record }">
            <a-space direction="vertical" style="width: 100%">
              <div v-if="Array.isArray(record.evidence) && record.evidence.length">
                <a-typography-text strong>证据</a-typography-text>
                <a-list :data-source="record.evidence" size="small">
                  <template #renderItem="{ item }">
                    <a-list-item>
                      <a-space direction="vertical" style="width: 100%">
                        <a-typography-text>{{ item.file || '-' }}</a-typography-text>
                        <a-typography-paragraph style="margin: 0" :ellipsis="{ rows: 6, expandable: true, symbol: '展开' }">
                          {{ item.snippet || item.hit || '-' }}
                        </a-typography-paragraph>
                      </a-space>
                    </a-list-item>
                  </template>
                </a-list>
              </div>
              <a-typography-text v-else type="secondary">无证据</a-typography-text>

              <a-collapse v-if="record.llmRaw">
                <a-collapse-panel key="raw" header="模型原文（截断）">
                  <a-typography-paragraph style="white-space: pre-wrap; margin: 0">
                    {{ record.llmRaw }}
                  </a-typography-paragraph>
                </a-collapse-panel>
              </a-collapse>
            </a-space>
          </template>
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'severity'">
              <a-tag :color="store.severityColor(record.severity)">{{ store.severityLabel(record.severity) }}</a-tag>
            </template>
            <template v-else-if="column.key === 'action'">
              <a-space size="small">
                <a-button type="link" @click="openDetail(record)">详情</a-button>
                <a-popconfirm title="确认删除该不符合项？" ok-text="删除" cancel-text="取消" @confirm="store.deleteFinding(record.id)">
                  <a-button type="link" danger>删除</a-button>
                </a-popconfirm>
              </a-space>
            </template>
          </template>
        </a-table>

        <a-drawer v-model:open="detailDrawerOpen" width="720" title="扫描结果详情">
          <template v-if="detailRecord">
            <a-space direction="vertical" style="width: 100%">
              <a-descriptions size="small" :column="1" bordered>
                <a-descriptions-item label="项目">{{ detailRecord.project || '-' }}</a-descriptions-item>
                <a-descriptions-item label="阶段">{{ detailRecord.stage || '-' }}</a-descriptions-item>
                <a-descriptions-item label="规则">{{ detailRecord.rule || '-' }}</a-descriptions-item>
                <a-descriptions-item label="严重性">
                  <a-tag :color="store.severityColor(detailRecord.severity)">{{ store.severityLabel(detailRecord.severity) }}</a-tag>
                </a-descriptions-item>
                <a-descriptions-item label="摘要">{{ detailRecord.file || '-' }}</a-descriptions-item>
                <a-descriptions-item label="原因">
                  <a-typography-paragraph style="white-space: pre-wrap; margin: 0">
                    {{ detailRecord.reason || '-' }}
                  </a-typography-paragraph>
                </a-descriptions-item>
                <a-descriptions-item label="建议">
                  <a-typography-paragraph style="white-space: pre-wrap; margin: 0">
                    {{ detailRecord.suggestion || '-' }}
                  </a-typography-paragraph>
                </a-descriptions-item>
              </a-descriptions>

              <div>
                <a-typography-text strong>命中文件（{{ Number(detailRecord.matchedFilesCount || 0) || 0 }}）</a-typography-text>
                <a-list
                  v-if="Array.isArray(detailRecord.matchedFiles) && detailRecord.matchedFiles.length"
                  :data-source="detailRecord.matchedFiles"
                  size="small"
                >
                  <template #renderItem="{ item }">
                    <a-list-item>
                      <a-typography-text>{{ item }}</a-typography-text>
                    </a-list-item>
                  </template>
                </a-list>
                <a-typography-text v-else type="secondary">无</a-typography-text>
              </div>

              <div>
                <a-typography-text strong>证据（{{ Number(detailRecord.evidenceCount || 0) || 0 }}）</a-typography-text>
                <a-list v-if="Array.isArray(detailRecord.evidence) && detailRecord.evidence.length" :data-source="detailRecord.evidence" size="small">
                  <template #renderItem="{ item }">
                    <a-list-item>
                      <a-space direction="vertical" style="width: 100%">
                        <a-typography-text>{{ item.file || '-' }}</a-typography-text>
                        <a-typography-paragraph style="margin: 0" :ellipsis="{ rows: 6, expandable: true, symbol: '展开' }">
                          {{ item.snippet || item.hit || '-' }}
                        </a-typography-paragraph>
                      </a-space>
                    </a-list-item>
                  </template>
                </a-list>
                <a-typography-text v-else type="secondary">无</a-typography-text>
              </div>

              <a-collapse v-if="detailRecord.llmRaw">
                <a-collapse-panel key="raw" header="模型原文（截断）">
                  <a-typography-paragraph style="white-space: pre-wrap; margin: 0">
                    {{ detailRecord.llmRaw }}
                  </a-typography-paragraph>
                </a-collapse-panel>
              </a-collapse>
            </a-space>
          </template>
        </a-drawer>

        <a-drawer v-model:open="skippedDrawerOpen" width="860" title="已跳过的文件">
          <a-table
            :columns="skippedColumns"
            :data-source="store.skippedFiles.value"
            row-key="key"
            size="small"
            :pagination="{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'] }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'reason'">
                <a-tag>{{ record.reason || '-' }}</a-tag>
              </template>
              <template v-else-if="column.key === 'size'">
                <span>{{ formatBytes(record.size) }}</span>
              </template>
            </template>
          </a-table>
        </a-drawer>

        <a-drawer v-model:open="projectFilesDrawerOpen" width="720" :title="`文件列表：${projectFilesDrawerProject || '-'}`">
          <a-list :data-source="projectFilesDrawerRows" bordered size="small">
            <template #renderItem="{ item }">
              <a-list-item>
                <a-typography-text>{{ item.path }}</a-typography-text>
              </a-list-item>
            </template>
          </a-list>
        </a-drawer>

        <a-divider />
        <a-row :gutter="[16, 16]">
          <a-col :xs="24">
            <a-card title="分析图表" size="small">
              <div ref="chartByRuleEl" class="chart" />
            </a-card>
          </a-col>
          <a-col :xs="24">
            <a-card title="分析图表" size="small">
              <div ref="chartByProjectEl" class="chart" />
            </a-card>
          </a-col>
          <a-col :xs="24">
            <a-card title="分析图表" size="small">
              <div ref="chartBySeverityEl" class="chart chart-wide" />
            </a-card>
          </a-col>
        </a-row>
      </a-card>
    </a-col>
  </a-row>
</template>
