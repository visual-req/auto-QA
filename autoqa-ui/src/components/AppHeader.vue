<script setup>
defineProps({
  selectedKeys: { type: Array, default: () => [] },
  projectMenuLabel: { type: String, default: '项目' },
  configMenuLabel: { type: String, default: '配置' },
  rulesMenuLabel: { type: String, default: '规则' }
})

const emit = defineEmits(['titleClick', 'menuClick'])
</script>

<template>
  <a-layout-header class="header">
    <div class="header-left">
      <a-typography-title :level="4" class="title" @click="emit('titleClick')">自动化QA检查</a-typography-title>
      <a-menu
        mode="horizontal"
        theme="dark"
        class="top-menu"
        :selected-keys="selectedKeys"
        @click="emit('menuClick', $event)"
      >
        <a-menu-item key="project">{{ projectMenuLabel }}</a-menu-item>
        <a-menu-item key="config">{{ configMenuLabel }}</a-menu-item>
        <a-menu-item key="rules">{{ rulesMenuLabel }}</a-menu-item>
      </a-menu>
    </div>
  </a-layout-header>
</template>
