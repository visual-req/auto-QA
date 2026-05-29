<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useAutoQaStore } from '../store/autoqaStore'

const store = useAutoQaStore()

const ruleScopeOptions = [
  { label: '内容', value: 'content' },
  { label: '文件名', value: 'file' }
]

const ruleEditCache = ref({
  id: '',
  name: '',
  pattern: '',
  severity: 'medium',
  stage: '',
  scope: 'content',
  extensionsText: '',
  prompt: '',
  reason: '',
  suggestion: ''
})

const rulesSearch = ref('')
const ruleStageTab = ref('')
const drawerOpen = ref(false)
const drawerMode = ref('detail')
const activeRuleId = ref('')

const filteredRulesForManage = computed(() => {
  const q = String(rulesSearch.value || '').trim().toLowerCase()
  const stageKey = String(ruleStageTab.value || '')
  const base = stageKey ? store.rules.value.filter((r) => String(r.stage || '') === stageKey) : store.rules.value
  if (!q) return base
  return base.filter((r) => {
    const exts = Array.isArray(r.extensions) ? r.extensions.join(',') : ''
    const scope = String(r.scope || '')
    const stage = String(r.stage || '')
    return (
      String(r.name || '').toLowerCase().includes(q) ||
      String(r.pattern || '').toLowerCase().includes(q) ||
      String(r.prompt || '').toLowerCase().includes(q) ||
      exts.toLowerCase().includes(q) ||
      scope.toLowerCase().includes(q) ||
      stage.toLowerCase().includes(q)
    )
  })
})

const rulesForManageRows = computed(() => {
  return filteredRulesForManage.value.map((r, idx) => ({ ...r, no: idx + 1 }))
})

const ruleStageTabs = computed(() => {
  const set = new Set()
  for (const r of store.rules.value) {
    const s = String(r?.stage || '').trim()
    if (s) set.add(s)
  }
  const fixedOrder = ['业务需求阶段', '设计开发阶段', '测试阶段', '投产阶段', '运维阶段']
  const all = Array.from(set)
  const rank = (name) => {
    const idx = fixedOrder.indexOf(name)
    return idx >= 0 ? idx : fixedOrder.length + 1
  }
  const items = all
    .sort((a, b) => {
      const ra = rank(a)
      const rb = rank(b)
      if (ra !== rb) return ra - rb
      return a.localeCompare(b)
    })
    .map((x) => ({ label: x, key: x }))
  return [{ label: '全部', key: '' }, ...items]
})

watch(
  ruleStageTabs,
  (tabs) => {
    const keys = new Set(tabs.map((x) => x.key))
    if (!keys.has(ruleStageTab.value)) ruleStageTab.value = ''
  },
  { immediate: true }
)

const activeRule = computed(() => {
  const id = String(activeRuleId.value || '')
  if (!id) return null
  return store.rules.value.find((r) => r.id === id) || null
})

function openDetail(record) {
  activeRuleId.value = record.id
  drawerMode.value = 'detail'
  drawerOpen.value = true
}

function openEdit(record) {
  activeRuleId.value = record.id
  drawerMode.value = 'edit'
  ruleEditCache.value = {
    id: record.id,
    name: String(record.name ?? ''),
    stage: String(record.stage ?? ''),
    pattern: String(record.pattern ?? ''),
    severity: record.severity || 'medium',
    scope: record.scope || 'content',
    extensionsText: Array.isArray(record.extensions) ? record.extensions.join(', ') : '',
    prompt: String(record.prompt ?? '').trim(),
    reason: String(record.reason ?? '').trim(),
    suggestion: String(record.suggestion ?? '').trim()
  }
  if (!ruleEditCache.value.prompt) {
    ruleEditCache.value.prompt = store.buildRulePrompt(record)
  }
  drawerOpen.value = true
}

function closeDrawer() {
  drawerOpen.value = false
  drawerMode.value = 'detail'
  activeRuleId.value = ''
  ruleEditCache.value = {
    id: '',
    name: '',
    pattern: '',
    severity: 'medium',
    stage: '',
    scope: 'content',
    extensionsText: '',
    prompt: '',
    reason: '',
    suggestion: ''
  }
}

function saveEditRule() {
  const pattern = String(ruleEditCache.value.pattern ?? '').trim()
  if (!pattern) return

  const name = String(ruleEditCache.value.name ?? '').trim() || pattern
  const stage = String(ruleEditCache.value.stage ?? '').trim()
  const severity = store.normalizeSeverity(ruleEditCache.value.severity)
  const scope = ruleEditCache.value.scope === 'file' ? 'file' : 'content'
  const extensions = store.parseExtensions(ruleEditCache.value.extensionsText)
  const patternKind = /^\/(.+)\/([a-z]*)$/i.test(pattern) ? 'regex' : 'text'
  const checkpoint = pattern
  const prompt =
    String(ruleEditCache.value.prompt ?? '').trim() ||
    store.buildRulePrompt({ stage, checkpoint, pattern, patternKind, severity, scope, extensions })
  const reason = String(ruleEditCache.value.reason ?? '').trim()
  const suggestion = String(ruleEditCache.value.suggestion ?? '').trim()
  const id = String(ruleEditCache.value.id || activeRuleId.value || '')
  if (!id) return

  store.rules.value = store.rules.value.map((r) => {
    if (r.id !== id) return r
    return { ...r, name, stage, checkpoint, pattern, patternKind, prompt, reason, suggestion, severity, scope, extensions }
  })

  closeDrawer()
}

function addRule() {
  const id = store.genId()
  const newRule = {
    id,
    name: '新规则',
    stage: '',
    pattern: '',
    patternKind: 'text',
    checkpoint: '',
    item: '',
    prompt: '',
    reason: '',
    suggestion: '',
    severity: 'medium',
    scope: 'content',
    extensions: []
  }
  newRule.prompt = store.buildRulePrompt(newRule)
  store.rules.value = [newRule, ...store.rules.value]
  openEdit(newRule)
}

function deleteRule(record) {
  store.rules.value = store.rules.value.filter((r) => r.id !== record.id)
  if (activeRuleId.value === record.id) closeDrawer()
}

async function reloadFromWork() {
  try {
    await store.loadPersistedRules()
  } catch (e) {
    store.rulesImportIssues.value = [
      {
        id: store.genId(),
        sheet: '-',
        row: '-',
        field: '重新加载',
        message: `重新加载失败（请启动后端：python3 scripts/autoqa_scan.py --serve）：${String(e?.message || e)}`,
        value: ''
      }
    ]
  }
}

async function clearAllRules() {
  await store.clearRules()
}

onMounted(async () => {
  try {
    await store.loadPersistedRules()
  } catch (e) {
  }
})

function scopeLabel(scope) {
  return store.scopeLabel(scope)
}

function severityLabel(sev) {
  return store.severityLabel(sev)
}

const rulesManageColumns = [
  { title: '编号', dataIndex: 'no', key: 'no', width: 80 },
  { title: '阶段', dataIndex: 'stage', key: 'stage', width: 110 },
  { title: '规则', dataIndex: 'name', key: 'name', width: 260 },
  { title: '规则详细', dataIndex: 'pattern', key: 'pattern' },
  { title: '检查对象', dataIndex: 'scope', key: 'scope', width: 110 },
  { title: '严重性', dataIndex: 'severity', key: 'severity', width: 110 },
  { title: '后缀限制', dataIndex: 'extensions', key: 'extensions' },
  { title: '操作', dataIndex: 'action', key: 'action', width: 220 }
]

const rulesImportIssueColumns = [
  { title: 'Sheet', dataIndex: 'sheet', key: 'sheet', width: 160 },
  { title: '行', dataIndex: 'row', key: 'row', width: 80 },
  { title: '字段', dataIndex: 'field', key: 'field', width: 120 },
  { title: '问题', dataIndex: 'message', key: 'message' },
  { title: '原值', dataIndex: 'value', key: 'value' }
]
</script>

<template>
  <a-row :gutter="[16, 16]">
    <a-col :xs="24">
      <a-card title="规则（按 Sheet 解析）" :bordered="false">
        <a-space direction="vertical" style="width: 100%">
          <a-space wrap>
            <a-upload
              :file-list="store.rulesFileList.value"
              :before-upload="store.beforeUploadStop"
              accept=".xls,.xlsx"
              @change="store.onRulesChange"
            >
              <a-button type="primary" :loading="store.importingRules.value">选择 Excel 并导入</a-button>
            </a-upload>
            <a-typography-text type="secondary">已解析规则：{{ store.rules.value.length }}</a-typography-text>
            <a-button @click="addRule">新增规则</a-button>
            <a-button @click="reloadFromWork">重新加载</a-button>
            <a-popconfirm title="确认清空当前规则？" ok-text="清空" cancel-text="取消" @confirm="clearAllRules">
              <a-button danger>清空规则</a-button>
            </a-popconfirm>
          </a-space>

          <a-progress
            v-if="store.importingRules.value"
            :percent="store.rulesImportPercent.value"
            :status="store.rulesImportPercent.value >= 100 ? 'success' : 'active'"
          />
          <a-alert
            v-if="store.importingRules.value && store.rulesImportText.value"
            :message="store.rulesImportText.value"
            type="info"
            show-icon
            :closable="false"
          />
          <a-alert
            v-if="!store.importingRules.value && store.rulesImportIssues.value.length"
            :message="`导入完成：发现 ${store.rulesImportIssues.value.length} 个问题（已尽量导入可用规则）`"
            type="warning"
            show-icon
            :closable="false"
          />
          <a-table
            v-if="!store.importingRules.value && store.rulesImportIssues.value.length"
            :columns="rulesImportIssueColumns"
            :data-source="store.rulesImportIssues.value"
            row-key="id"
            size="small"
            :pagination="{
              pageSize: 8,
              showSizeChanger: true,
              pageSizeOptions: ['8', '20', '50', '100']
            }"
          />

          <a-input
            v-model:value="rulesSearch"
            placeholder="搜索规则（阶段 / 规则名 / 规则详细 / 后缀 / 扫描对象）"
            allow-clear
          />

          <a-tabs v-model:activeKey="ruleStageTab" size="small">
            <a-tab-pane v-for="t in ruleStageTabs" :key="t.key" :tab="t.label" />
          </a-tabs>

          <a-table
            :columns="rulesManageColumns"
            :data-source="rulesForManageRows"
            row-key="id"
            :pagination="{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              pageSizeOptions: ['10', '20', '50', '100']
            }"
            size="middle"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'no'">
                {{ record.no }}
              </template>

              <template v-else-if="column.key === 'stage'">
                {{ record.stage || '-' }}
              </template>

              <template v-else-if="column.key === 'name'">
                {{ record.name }}
              </template>

              <template v-else-if="column.key === 'pattern'">
                {{ record.pattern }}
              </template>

              <template v-else-if="column.key === 'severity'">
                {{ severityLabel(record.severity) }}
              </template>

              <template v-else-if="column.key === 'scope'">
                {{ scopeLabel(record.scope) }}
              </template>

              <template v-else-if="column.key === 'extensions'">
                {{
                  Array.isArray(record.extensions) && record.extensions.length ? record.extensions.join(', ') : '不限'
                }}
              </template>

              <template v-else-if="column.key === 'action'">
                <a-space>
                  <a-button type="link" @click="openDetail(record)">详情</a-button>
                  <a-button type="link" @click="openEdit(record)">编辑</a-button>
                  <a-popconfirm title="确认删除该规则？" ok-text="删除" cancel-text="取消" @confirm="deleteRule(record)">
                    <a-button type="link" danger>删除</a-button>
                  </a-popconfirm>
                </a-space>
              </template>
            </template>
          </a-table>

          <a-drawer
            :open="drawerOpen"
            :width="720"
            :title="drawerMode === 'edit' ? '编辑规则' : '规则详情'"
            @close="closeDrawer"
          >
            <template v-if="drawerMode === 'detail'">
              <a-space direction="vertical" style="width: 100%">
                <a-descriptions bordered size="small" :column="1">
                  <a-descriptions-item label="阶段">{{ activeRule?.stage || '-' }}</a-descriptions-item>
                  <a-descriptions-item label="规则">{{ activeRule?.name || '-' }}</a-descriptions-item>
                  <a-descriptions-item label="规则详细">{{ activeRule?.pattern || '-' }}</a-descriptions-item>
                  <a-descriptions-item label="检查对象">{{ scopeLabel(activeRule?.scope) }}</a-descriptions-item>
                  <a-descriptions-item label="严重性">{{ severityLabel(activeRule?.severity) }}</a-descriptions-item>
                  <a-descriptions-item label="后缀限制">{{
                    Array.isArray(activeRule?.extensions) && activeRule.extensions.length ? activeRule.extensions.join(', ') : '不限'
                  }}</a-descriptions-item>
                </a-descriptions>
                <a-card title="检查提示词" size="small" :bordered="false">
                  <a-typography-paragraph style="white-space: pre-wrap; margin: 0">
                    {{ activeRule?.prompt || '' }}
                  </a-typography-paragraph>
                </a-card>
              </a-space>
            </template>

            <template v-else>
              <a-form layout="vertical">
                <a-form-item label="阶段">
                  <a-input v-model:value="ruleEditCache.stage" />
                </a-form-item>
                <a-form-item label="规则名称">
                  <a-input v-model:value="ruleEditCache.name" />
                </a-form-item>
                <a-form-item label="规则详细（检查要点）">
                  <a-textarea v-model:value="ruleEditCache.pattern" :auto-size="{ minRows: 3, maxRows: 8 }" />
                </a-form-item>
                <a-form-item label="检查对象">
                  <a-select v-model:value="ruleEditCache.scope" :options="ruleScopeOptions" />
                </a-form-item>
                <a-form-item label="严重性">
                  <a-select v-model:value="ruleEditCache.severity" :options="store.severityOptions" />
                </a-form-item>
                <a-form-item label="后缀限制（逗号分隔，如 .docx,.xlsx）">
                  <a-input v-model:value="ruleEditCache.extensionsText" />
                </a-form-item>
                <a-form-item label="检查提示词">
                  <a-textarea v-model:value="ruleEditCache.prompt" :auto-size="{ minRows: 4, maxRows: 12 }" />
                </a-form-item>
                <a-form-item label="不符合项原因模板（可选）">
                  <a-textarea v-model:value="ruleEditCache.reason" :auto-size="{ minRows: 2, maxRows: 6 }" />
                </a-form-item>
                <a-form-item label="修改建议模板（可选）">
                  <a-textarea v-model:value="ruleEditCache.suggestion" :auto-size="{ minRows: 2, maxRows: 6 }" />
                </a-form-item>
                <a-space>
                  <a-button type="primary" @click="saveEditRule">保存</a-button>
                  <a-button @click="closeDrawer">取消</a-button>
                </a-space>
              </a-form>
            </template>
          </a-drawer>
        </a-space>
      </a-card>
    </a-col>
  </a-row>
</template>
