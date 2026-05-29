<script setup>
import { provide, ref } from 'vue'
import AppHeader from './components/AppHeader.vue'
import ProjectDrawer from './components/ProjectDrawer.vue'
import ConfigPage from './pages/ConfigPage.vue'
import RulesPage from './pages/RulesPage.vue'
import ScanPage from './pages/ScanPage.vue'
import { AUTOQA_STORE_KEY, createAutoQaStore } from './store/autoqaStore'

const store = createAutoQaStore()
provide(AUTOQA_STORE_KEY, store)

const topMenuSelectedKeys = ref([])
const currentPage = ref('scan')

function openScanPage() {
  currentPage.value = 'scan'
  topMenuSelectedKeys.value = []
}

function openScanPageFromProjectMenu() {
  currentPage.value = 'scan'
  topMenuSelectedKeys.value = ['project']
}

function openRulesPage() {
  currentPage.value = 'rules'
  topMenuSelectedKeys.value = ['rules']
}

function openConfigPage() {
  currentPage.value = 'config'
  topMenuSelectedKeys.value = ['config']
}

function onTopMenuClick(e) {
  const key = e?.key
  if (key === 'rules') openRulesPage()
  if (key === 'project') openScanPageFromProjectMenu()
  if (key === 'config') openConfigPage()
}
</script>

<template>
  <a-layout class="page">
    <AppHeader
      :selected-keys="topMenuSelectedKeys"
      :project-menu-label="store.projectMenuLabel.value"
      :config-menu-label="store.configMenuLabel.value"
      :rules-menu-label="store.rulesMenuLabel.value"
      @title-click="openScanPage"
      @menu-click="onTopMenuClick"
    />

    <a-layout-content class="content" v-if="currentPage === 'scan'">
      <ScanPage :active="currentPage === 'scan'" @goRules="openRulesPage" />
    </a-layout-content>

    <a-layout-content class="content content-wide" v-else-if="currentPage === 'config'">
      <ConfigPage />
    </a-layout-content>

    <a-layout-content class="content content-wide" v-else-if="currentPage === 'rules'">
      <RulesPage />
    </a-layout-content>

    <ProjectDrawer :open="store.drawerOpen.value" @update:open="(v) => (store.drawerOpen.value = v)" />
  </a-layout>
</template>
