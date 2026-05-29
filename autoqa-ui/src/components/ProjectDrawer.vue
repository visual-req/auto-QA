<script setup>
import { computed } from 'vue'
import { useAutoQaStore } from '../store/autoqaStore'

const props = defineProps({
  open: { type: Boolean, default: false }
})
const emit = defineEmits(['update:open'])

const store = useAutoQaStore()
const openModel = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v)
})
</script>

<template>
  <a-drawer v-model:open="openModel" title="项目目录结构参考" width="720" :destroy-on-close="true" :get-container="false">
    <a-space direction="vertical" style="width: 100%">
      <a-alert
        message="建议按项目拆分目录：导入时选择 work/inputs，目录下按 <projectA>/<projectB>... 组织文件。"
        type="info"
        show-icon
        :closable="false"
      />

      <a-card title="推荐结构（示例）" size="small">
        <a-tree :tree-data="store.suggestedProjectTreeData" default-expand-all />
      </a-card>

      <a-card title="文件命名与关键词识别建议" size="small">
        <a-table
          :columns="store.fileNamingColumns"
          :data-source="store.fileNamingSuggestions"
          row-key="key"
          :pagination="false"
          size="small"
        />
      </a-card>

      <a-card title="当前结构（导入目录）" size="small">
        <a-tree :tree-data="store.currentProjectTreeData.value" default-expand-all />
      </a-card>
    </a-space>
  </a-drawer>
</template>
