<script setup>
import { computed } from 'vue'
import { useAutoQaStore } from '../store/autoqaStore'

const store = useAutoQaStore()

const configRows = computed(() => {
  const map = store.projectRuleStages.value || {}
  return Object.keys(map)
    .sort((a, b) => a.localeCompare(b))
    .map((project) => {
      const perStage = map[project] || {}
      const parts = Object.keys(perStage)
        .sort((a, b) => a.localeCompare(b))
        .map((stage) => {
          const items = Array.isArray(perStage[stage]) ? perStage[stage] : []
          return `${stage}：${items.join(', ')}`
        })
      const stageCount = Object.keys(perStage).length
      const itemCount = Object.values(perStage).reduce((sum, v) => sum + (Array.isArray(v) ? v.length : 0), 0)
      return {
        id: project,
        project,
        stages: parts.join('；'),
        stageCount,
        itemCount
      }
    })
})

const configColumns = [
  { title: '项目', dataIndex: 'project', key: 'project', width: 220 },
  { title: '适用配置（Sheet=阶段，表头=检查项）', dataIndex: 'stages', key: 'stages' },
  { title: '阶段数', dataIndex: 'stageCount', key: 'stageCount', width: 100 },
  { title: '检查项数', dataIndex: 'itemCount', key: 'itemCount', width: 110 }
]

const issuesColumns = [
  { title: 'Sheet', dataIndex: 'sheet', key: 'sheet', width: 160 },
  { title: '行', dataIndex: 'row', key: 'row', width: 80 },
  { title: '字段', dataIndex: 'field', key: 'field', width: 140 },
  { title: '问题', dataIndex: 'message', key: 'message' },
  { title: '原值', dataIndex: 'value', key: 'value' }
]
</script>

<template>
  <a-row :gutter="[16, 16]">
    <a-col :xs="24">
      <a-card title="配置（项目 → 规则阶段）" :bordered="false">
        <a-space direction="vertical" style="width: 100%">
          <a-space wrap>
            <a-upload
              :file-list="store.configFileList.value"
              :before-upload="store.beforeUploadStop"
              accept=".xls,.xlsx"
              @change="store.onConfigChange"
            >
              <a-button type="primary" :loading="store.importingConfig.value">导入配置 Excel</a-button>
            </a-upload>
            <a-button @click="store.downloadConfigTemplate">下载模板</a-button>
            <a-button @click="store.downloadConfigExample">下载示例</a-button>
            <a-typography-text type="secondary">已配置项目：{{ Object.keys(store.projectRuleStages.value || {}).length }}</a-typography-text>
          </a-space>

          <a-progress
            v-if="store.importingConfig.value"
            :percent="store.configImportPercent.value"
            :status="store.configImportPercent.value >= 100 ? 'success' : 'active'"
          />
          <a-alert
            v-if="store.importingConfig.value && store.configImportText.value"
            :message="store.configImportText.value"
            type="info"
            show-icon
            :closable="false"
          />

          <a-alert
            v-if="!store.importingConfig.value && store.configImportIssues.value.length"
            :message="`导入完成：发现 ${store.configImportIssues.value.length} 个问题（未配置阶段的项目默认使用全部规则）`"
            type="warning"
            show-icon
            :closable="false"
          />

          <a-table
            v-if="!store.importingConfig.value && store.configImportIssues.value.length"
            :columns="issuesColumns"
            :data-source="store.configImportIssues.value"
            row-key="id"
            size="small"
            :pagination="{
              pageSize: 8,
              showSizeChanger: true,
              pageSizeOptions: ['8', '20', '50', '100']
            }"
          />

          <a-table
            :columns="configColumns"
            :data-source="configRows"
            row-key="id"
            size="middle"
            :pagination="{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              pageSizeOptions: ['10', '20', '50', '100']
            }"
          />
        </a-space>
      </a-card>
    </a-col>
  </a-row>
</template>
