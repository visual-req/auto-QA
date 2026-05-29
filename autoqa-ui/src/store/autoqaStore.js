import * as XLSX from 'xlsx'
import { computed, inject, nextTick, ref, watch } from 'vue'

export const AUTOQA_STORE_KEY = Symbol('AUTOQA_STORE_KEY')
export const ALL_PROJECTS = '__ALL__'
export const ALL_STAGES = '__ALL_STAGE__'

export function createAutoQaStore() {
  const folderFileList = ref([])
  const skippedFiles = ref([])
  const rulesFileList = ref([])
  const configFileList = ref([])
  const rules = ref([])
  const findings = ref([])
  const scanning = ref(false)
  const progress = ref(0)
  const statusText = ref('')
  const doneRulesByProject = ref({})
  const drawerOpen = ref(false)
  const importingRules = ref(false)
  const rulesImportPercent = ref(0)
  const rulesImportText = ref('')
  const rulesImportToken = ref('')
  const rulesImportIssues = ref([])
  const rulesHydrating = ref(true)
  const importingConfig = ref(false)
  const configImportPercent = ref(0)
  const configImportText = ref('')
  const configImportToken = ref('')
  const configImportIssues = ref([])
  const projectRuleStages = ref({})

  const severityOptions = [
    { label: '高', value: 'high' },
    { label: '中', value: 'medium' },
    { label: '低', value: 'low' }
  ]

  const selectedSeverity = ref(['high', 'medium', 'low'])
  const showMissingFiles = ref(true)
  const resultProjectTab = ref(ALL_PROJECTS)
  const resultStageTab = ref(ALL_STAGES)

  const rulesMenuLabel = computed(() => {
    return rules.value.length ? `规则（${rules.value.length}）` : '规则'
  })

  const projectMenuLabel = computed(() => '项目')
  const configMenuLabel = computed(() => {
    const n = Object.keys(projectRuleStages.value || {}).length
    return n ? `配置（${n}）` : '配置'
  })

  function setSeverityChecked(sev, checked) {
    const cur = Array.isArray(selectedSeverity.value) ? selectedSeverity.value : []
    if (checked) {
      if (cur.includes(sev)) return
      selectedSeverity.value = [sev, ...cur]
      return
    }
    selectedSeverity.value = cur.filter((x) => x !== sev)
  }

  function isHiddenFile(file) {
    const name = String(file?.name || '').trim()
    const rel = String(file?.webkitRelativePath || '').trim()
    const lowerName = name.toLowerCase()
    const lowerRel = rel.toLowerCase()
    if (!name) return true
    if (lowerName === '.ds_store' || lowerName === '.gitkeep' || lowerName === 'thumbs.db' || lowerName === 'desktop.ini') return true
    if (name.startsWith('~')) return true
    if (name.includes('模板') || name.includes('模版') || rel.includes('模板') || rel.includes('模版')) return true
    if (lowerName.includes('template') || lowerRel.includes('template')) return true
    if (name.startsWith('.')) return true
    const parts = rel ? rel.split('/').filter(Boolean) : []
    if (
      parts.some(
        (p) =>
          p === '__MACOSX' ||
          p.startsWith('.') ||
          p.startsWith('~') ||
          String(p || '').includes('模板') ||
          String(p || '').includes('模版')
      )
    )
      return true
    return false
  }

  function extractProjectInfo(file) {
    const name = String(file?.name || '').trim()
    const rel = String(file?.webkitRelativePath || '').trim()
    const parts = rel ? rel.split('/').filter(Boolean) : []

    const scoreProjectCode = (code) => {
      const c = String(code || '').trim()
      if (!c) return -1
      let s = c.length
      if (/^[A-Za-z]\d{5}$/.test(c)) s += 20
      else if (/^[A-Za-z]\d{4}[A-Za-z]$/.test(c)) s += 18
      else if (/^[A-Za-z]{2}\d{4}$/.test(c)) s += 16
      const digits = (c.match(/\d/g) || []).length
      if (digits >= 5) s += 3
      if (digits >= 4) s += 1
      return s
    }

    const bestProjectCodeFromText = (text) => {
      const t = String(text || '').trim()
      if (!t) return ''
      const patterns = [
        /[A-Za-z]\d{5}/g,
        /[A-Za-z]\d{4}[A-Za-z]/g,
        /[A-Za-z]{2}\d{4}/g,
        /[A-Za-z]{1,3}\d{4,6}[A-Za-z]?/g
      ]
      const found = []
      for (const rx of patterns) {
        const ms = t.match(rx) || []
        for (const m of ms) found.push(String(m || '').toUpperCase())
      }
      const uniq = Array.from(new Set(found)).filter(Boolean)
      if (!uniq.length) return ''
      uniq.sort((a, b) => scoreProjectCode(b) - scoreProjectCode(a))
      return uniq[0] || ''
    }

    if (parts.length) {
      for (let i = 0; i < parts.length; i += 1) {
        const proj = bestProjectCodeFromText(parts[i])
        if (proj) return { project: proj, index: i < parts.length - 1 ? i : -1, parts }
      }
      const projRel = bestProjectCodeFromText(rel)
      if (projRel) {
        const proj = projRel
        for (let i = 0; i < parts.length; i += 1) {
          if (String(parts[i] || '').includes(proj))
            return { project: proj, index: i < parts.length - 1 ? i : -1, parts }
        }
        return { project: proj, index: -1, parts }
      }
    }

    const projName = bestProjectCodeFromText(name)
    if (projName) return { project: projName, index: -1, parts }

    return { project: '', index: -1, parts }
  }

  function projectNameOfFile(file) {
    const info = extractProjectInfo(file)
    return info.project || ''
  }

  function stageNameOfFile(file) {
    const rel = String(file?.webkitRelativePath || '').trim()
    if (!rel) return ''
    const info = extractProjectInfo(file)
    if (!info.project) return ''
    if (info.index >= 0) return info.parts?.[info.index + 1] || ''
    return info.parts?.[1] || ''
  }

  function withinProjectPathOfFile(file) {
    const name = String(file?.name || '')
    const rel = String(file?.webkitRelativePath || '').trim()
    if (!rel) return name
    const info = extractProjectInfo(file)
    if (info.project && info.index >= 0) {
      const rest = info.parts.slice(info.index + 1).join('/')
      return rest || name
    }
    return rel || name
  }

  const allEligibleFiles = computed(() => {
    const files = folderFileList.value.map((x) => x?.originFileObj).filter(Boolean)
    return files.filter((f) => {
      if (isHiddenFile(f)) return false
      if (!isScannableFile(f.name)) return false
      const p = projectNameOfFile(f)
      return !!p
    })
  })

  const skippedProjectText = computed(() => {
    const list = Array.isArray(skippedFiles.value) ? skippedFiles.value : []
    return list.filter((x) => String(x?.reason || '').includes('未识别项目编号')).length
  })

  const skippedFilesCount = computed(() => (Array.isArray(skippedFiles.value) ? skippedFiles.value.length : 0))

  const projectNames = computed(() => {
    const set = new Set()
    for (const f of allEligibleFiles.value) set.add(projectNameOfFile(f))
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  })

  const scanFiles = computed(() => {
    return allEligibleFiles.value
  })

  const folderSummaryText = computed(() => {
    const pCount = projectNames.value.length
    const fCount = allEligibleFiles.value.length
    const skipped = skippedProjectText.value
    const skippedAll = skippedFilesCount.value
    if (!pCount) {
      if (!folderFileList.value.length && !skippedAll) return '未选择'
      if (skipped) return `未识别项目编号（已跳过 ${skippedAll} 个文件）`
      return skippedAll ? `无可扫描文件（已跳过 ${skippedAll} 个文件）` : '无可扫描文件'
    }
    const tailProject = skipped ? `；未识别项目编号：${skipped}` : ''
    const tailAll = skippedAll ? `；已跳过 ${skippedAll} 个文件` : ''
    const tail = `${tailAll}${tailProject}`
    if (pCount === 1) return `已导入 1 个项目（可扫描文件：${fCount}）${tail}`
    return `已导入 ${pCount} 个项目（可扫描文件：${fCount}）${tail}`
  })

  const filteredFindings = computed(() => {
    const bySeverity = findings.value.filter((x) => selectedSeverity.value.includes(x.severity))
    const byType = showMissingFiles.value ? bySeverity : bySeverity.filter((x) => !x.isMissingFile)
    const byProject =
      !resultProjectTab.value || resultProjectTab.value === ALL_PROJECTS
        ? byType
        : byType.filter((x) => x.project === resultProjectTab.value)
    if (!resultStageTab.value || resultStageTab.value === ALL_STAGES) return byProject
    const stageNeed = String(resultStageTab.value || '').trim()
    return byProject.filter((x) => String(x?.stage || '').trim() === stageNeed)
  })

  const scanStatsByProject = computed(() => {
    const totalFilesByProject = new Map()
    for (const f of scanFiles.value) {
      const proj = projectNameOfFile(f)
      totalFilesByProject.set(proj, (totalFilesByProject.get(proj) || 0) + 1)
    }

    const hitsByProject = new Map()
    for (const x of findings.value) {
      hitsByProject.set(x.project, (hitsByProject.get(x.project) || 0) + 1)
    }

    const totalChecksAll = Array.from(totalFilesByProject.keys()).reduce((sum, project) => sum + getRulesForProject(project).length, 0)
    const doneMap = doneRulesByProject.value || {}
    const doneChecksAll = Array.from(totalFilesByProject.keys()).reduce((sum, project) => sum + (Number(doneMap?.[project] || 0) || 0), 0)

    const entries = Array.from(totalFilesByProject.entries())
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([project, totalFiles]) => {
        const totalRules = getRulesForProject(project).length
        const totalChecks = totalRules
        const doneChecks = Number(doneMap?.[project] || 0) || 0
        return {
          project,
          totalRules,
          totalFiles,
          totalChecks,
          doneChecks,
          hits: hitsByProject.get(project) || 0,
          percent: totalChecks ? Math.min(100, Math.round((doneChecks / totalChecks) * 100)) : 0
        }
      })

    return entries
  })

  const resultProjectTabs = computed(() => {
    const set = new Set()
    for (const x of findings.value) set.add(x.project)
    const items = Array.from(set)
      .sort((a, b) => String(a).localeCompare(String(b)))
      .map((x) => ({ label: x, key: x }))
    return [{ label: '全部', key: ALL_PROJECTS }, ...items]
  })

  const resultStageTabs = computed(() => {
    const byProject =
      !resultProjectTab.value || resultProjectTab.value === ALL_PROJECTS
        ? findings.value
        : findings.value.filter((x) => x.project === resultProjectTab.value)
    const set = new Set()
    for (const x of byProject) {
      const s = String(x?.stage || '').trim() || '-'
      set.add(s)
    }
    const items = Array.from(set)
      .sort((a, b) => String(a).localeCompare(String(b)))
      .map((x) => ({ label: x, key: x }))
    return [{ label: '全部', key: ALL_STAGES }, ...items]
  })

  watch(
    resultProjectTabs,
    (tabs) => {
      const keys = new Set(tabs.map((x) => x.key))
      if (!keys.has(resultProjectTab.value)) resultProjectTab.value = ALL_PROJECTS
    },
    { immediate: true }
  )

  watch(
    resultProjectTab,
    () => {
      resultStageTab.value = ALL_STAGES
    },
    { immediate: true }
  )

  watch(
    resultStageTabs,
    (tabs) => {
      const keys = new Set(tabs.map((x) => x.key))
      if (!keys.has(resultStageTab.value)) resultStageTab.value = ALL_STAGES
    },
    { immediate: true }
  )

  function onFolderChange(info) {
    const list = Array.isArray(info?.fileList) ? info.fileList : []
    const accepted = []
    const skipped = []
    for (const x of list) {
      const f = x?.originFileObj
      const name = String(f?.name || x?.name || '').trim()
      const rel = String(f?.webkitRelativePath || x?.webkitRelativePath || '').trim()
      const path = rel || name
      if (!f) {
        skipped.push({ key: `${path || 'unknown'}::no_origin`, name: name || '-', path: path || '-', reason: '无法读取文件对象', size: 0 })
        continue
      }
      if (isHiddenFile(f)) {
        skipped.push({ key: `${path}::hidden`, name: f.name, path, reason: '已屏蔽（系统/隐藏/模板）', size: Number(f.size || 0) || 0 })
        continue
      }
      if (!isScannableFile(f.name)) {
        skipped.push({ key: `${path}::type`, name: f.name, path, reason: '不支持的文件类型', size: Number(f.size || 0) || 0 })
        accepted.push(x)
        continue
      }
      const p = projectNameOfFile(f)
      if (!p) {
        skipped.push({ key: `${path}::project`, name: f.name, path, reason: '未识别项目编号', size: Number(f.size || 0) || 0 })
        accepted.push(x)
        continue
      }
      accepted.push(x)
    }
    skippedFiles.value = skipped
    folderFileList.value = accepted
  }

  function normalizeHeaderKey(s) {
    return String(s ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s_\-()（）【】\[\].,:，;；/\\]+/g, '')
  }

  function truthyCell(v) {
    const raw = String(v ?? '').trim()
    if (!raw) return false
    const s = raw.toLowerCase()
    if (['1', 'y', 'yes', 'true', '是', '需要', '需', '√', '✔', 'check', 'checked', 'ok'].includes(s))
      return true
    if (['0', 'n', 'no', 'false', '否', '不', '无需', 'x', '×'].includes(s)) return false
    return true
  }

  function safeUploadFilename(originalName, fallbackBase) {
    const name = String(originalName || '').trim()
    const base = String(fallbackBase || 'file').trim() || 'file'
    const m = name.match(/\.([A-Za-z0-9]+)$/)
    const ext = m ? `.${m[1].toLowerCase()}` : '.xlsx'
    return `${base}${ext}`
  }

  async function ensureWorkReady() {
    const res = await fetch('/api/work/ensure', { method: 'POST' })
    if (!res.ok) throw new Error(await res.text())
    return await res.json().catch(() => ({}))
  }

  async function persistRulesArtifactsToWork(file, parsedRules) {
    await ensureWorkReady()
    let rulesArr = Array.isArray(parsedRules) ? parsedRules : []
    const fileBuf = await file.arrayBuffer()
    const filename = safeUploadFilename(file?.name, 'rules')
    const uploadRes = await fetch('/api/rules/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': filename },
      body: fileBuf
    })
    if (!uploadRes.ok) throw new Error(await uploadRes.text())
    const uploadJson = await uploadRes.json().catch(() => ({}))

    const promptRes = await fetch('/api/prompts/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rulesArr)
    })
    if (!promptRes.ok) throw new Error(await promptRes.text())
    const promptJson = await promptRes.json().catch(() => ({}))
    if (Array.isArray(promptJson?.rules)) rulesArr = promptJson.rules

    const saveRes = await fetch('/api/rules/parsed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rulesArr)
    })
    if (!saveRes.ok) throw new Error(await saveRes.text())
    const saveJson = await saveRes.json().catch(() => ({}))

    return { upload: uploadJson, saved: saveJson, rules: rulesArr }
  }

  async function loadPersistedRules(options) {
    const silent = !!options?.silent
    const res = await fetch('/api/rules/parsed', { method: 'GET' })
    if (!res.ok) throw new Error(await res.text())
    const json = await res.json().catch(() => ({}))
    const rulesArr = Array.isArray(json?.rules) ? json.rules : Array.isArray(json) ? json : []
    rules.value = rulesArr
    if (!silent) {
      rulesImportIssues.value = []
      rulesImportPercent.value = 100
      const p = json?.path || 'work/rules/rules.json'
      rulesImportText.value = rulesArr.length ? `已加载：${p}（${rulesArr.length} 条规则）` : `已加载：${p}（0 条规则）`
    }
    return rulesArr
  }

  async function clearRules() {
    rules.value = []
    rulesFileList.value = []
    rulesImportIssues.value = []
    rulesImportText.value = ''
    rulesImportPercent.value = 0
    try {
      await fetch('/api/rules/parsed', { method: 'DELETE' })
    } catch (e) {
    }
  }

  async function onRulesChange(info) {
    rulesFileList.value = info.fileList?.slice(-1) ?? []
    const file = rulesFileList.value?.[0]?.originFileObj
    if (!file) {
      rules.value = []
      rulesImportIssues.value = []
      return
    }

    const token = genId()
    rulesImportToken.value = token
    importingRules.value = true
    rulesImportPercent.value = 0
    rulesImportText.value = '读取 Excel...'
    rules.value = []
    rulesImportIssues.value = []

    try {
      await ensureWorkReady()
      const parsed = await parseRulesExcelWithProgress(file, ({ percent, text, partial }) => {
        if (rulesImportToken.value !== token) return
        rulesImportPercent.value = percent
        rulesImportText.value = text || rulesImportText.value
        rules.value = partial
      })
      if (rulesImportToken.value === token) {
        rules.value = parsed.rules
        rulesImportIssues.value = parsed.issues || []
        rulesImportText.value = '导入完成，正在写入 work/inputs 与 work/rules...'
        try {
          const persisted = await persistRulesArtifactsToWork(file, parsed.rules)
          if (Array.isArray(persisted?.rules) && rulesImportToken.value === token) {
            rules.value = persisted.rules
          }
          const p = persisted?.saved?.path || 'work/rules/rules.json'
          rulesImportPercent.value = 100
          rulesImportText.value = rulesImportIssues.value.length
            ? `导入完成（${parsed.rules.length} 条规则），发现 ${rulesImportIssues.value.length} 个问题；已写入：${p}`
            : `导入完成（${parsed.rules.length} 条规则），已写入：${p}`
        } catch (e) {
          rulesImportPercent.value = 100
          rulesImportIssues.value = [
            ...(rulesImportIssues.value || []),
            {
              id: genId(),
              sheet: '-',
              row: '-',
              field: '落盘',
              message: `未写入 work/rules 与 work/inputs：${String(e?.message || e)}`,
              value: ''
            }
          ]
          rulesImportText.value = rulesImportIssues.value.length
            ? `导入完成（${parsed.rules.length} 条规则），发现 ${rulesImportIssues.value.length} 个问题（含落盘失败）`
            : `导入完成（${parsed.rules.length} 条规则），但落盘失败`
        }
      }
    } catch (e) {
      if (rulesImportToken.value === token) {
        rulesImportText.value = `导入失败：${String(e?.message || e)}`
        rulesImportIssues.value = [
          {
            id: genId(),
            sheet: '-',
            row: '-',
            field: '-',
            message: String(e?.message || e),
            value: ''
          }
        ]
      }
    } finally {
      if (rulesImportToken.value === token) importingRules.value = false
    }
  }

  async function onConfigChange(info) {
    configFileList.value = info.fileList?.slice(-1) ?? []
    const file = configFileList.value?.[0]?.originFileObj
    if (!file) {
      projectRuleStages.value = {}
      configImportIssues.value = []
      return
    }

    const token = genId()
    configImportToken.value = token
    importingConfig.value = true
    configImportPercent.value = 0
    configImportText.value = '读取 Excel...'
    projectRuleStages.value = {}
    configImportIssues.value = []

    try {
      await ensureWorkReady()
      const parsed = await parseConfigExcelWithProgress(file, ({ percent, text }) => {
        if (configImportToken.value !== token) return
        configImportPercent.value = percent
        configImportText.value = text || configImportText.value
      })
      if (configImportToken.value === token) {
        projectRuleStages.value = parsed.map || {}
        configImportIssues.value = parsed.issues || []
        configImportPercent.value = 100
        const n = Object.keys(projectRuleStages.value || {}).length
        configImportText.value = configImportIssues.value.length
          ? `导入完成（${n} 个项目配置），发现 ${configImportIssues.value.length} 个问题`
          : `导入完成（${n} 个项目配置）`
        try {
          await ensureWorkReady()
          const fileBuf = await file.arrayBuffer()
          const filename = safeUploadFilename(file?.name, 'config')
          const uploadRes = await fetch('/api/config/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': filename },
            body: fileBuf
          })
          if (!uploadRes.ok) throw new Error(await uploadRes.text())
          const uploadJson = await uploadRes.json().catch(() => ({}))
          const p = uploadJson?.path || 'work/inputs/config.xlsx'
          configImportText.value = `${configImportText.value}；已写入：${p}`
        } catch (e) {
          configImportIssues.value = [
            ...(configImportIssues.value || []),
            {
              id: genId(),
              sheet: '-',
              row: '-',
              field: '落盘',
              message: `未写入 work/inputs：${String(e?.message || e)}`,
              value: ''
            }
          ]
        }
      }
    } catch (e) {
      if (configImportToken.value === token) {
        configImportText.value = `导入失败：${String(e?.message || e)}`
        configImportIssues.value = [
          {
            id: genId(),
            sheet: '-',
            row: '-',
            field: '-',
            message: String(e?.message || e),
            value: ''
          }
        ]
      }
    } finally {
      if (configImportToken.value === token) importingConfig.value = false
    }
  }

  function beforeUploadStop() {
    return false
  }

  function normalizeSeverity(v) {
    const s = String(v ?? '').trim().toLowerCase()
    if (['high', 'h', 'p0', '0', '严重', '高'].includes(s)) return 'high'
    if (['medium', 'm', 'p1', '1', '中'].includes(s)) return 'medium'
    if (['low', 'l', 'p2', '2', '低'].includes(s)) return 'low'
    return 'medium'
  }

  function pick(obj, keys) {
    for (const k of keys) {
      if (obj?.[k] != null && String(obj[k]).trim() !== '') return obj[k]
    }
    const lowered = Object.fromEntries(
      Object.entries(obj ?? {}).map(([k, v]) => [String(k).toLowerCase(), v])
    )
    for (const k of keys.map((x) => String(x).toLowerCase())) {
      if (lowered?.[k] != null && String(lowered[k]).trim() !== '') return lowered[k]
    }
    return undefined
  }

  function parseExtensions(extCell) {
    const raw = String(extCell ?? '').trim()
    if (!raw) return []
    const ignoreWords = new Set(['提交件', '工作件', '.提交件', '.工作件'])
    return raw
      .split(/[,，;\s]+/g)
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((x) => !ignoreWords.has(x))
      .map((x) => (x.startsWith('.') ? x.toLowerCase() : `.${x.toLowerCase()}`))
      .filter((x) => !ignoreWords.has(x))
      .filter((x) => /^\.[a-z0-9]+$/.test(x))
  }

  function buildRulePrompt(rule) {
    const stage = String(rule?.stage ?? '').trim()
    const checkpoint = String(rule?.checkpoint ?? rule?.pattern ?? '').trim()
    const scope = rule?.scope === 'file' ? '文件名' : '内容'
    const sev = rule?.severity === 'high' ? '高' : rule?.severity === 'low' ? '低' : '中'
    const extsArr = Array.isArray(rule?.extensions) ? rule.extensions.filter(Boolean) : []
    const extsText = extsArr.length ? `限定后缀：${extsArr.join(', ')}` : '后缀不限'
    const s = stage ? `【${stage}】` : ''
    const c = checkpoint ? `检查要点（规则详细）：${checkpoint}` : '检查要点（规则详细）：'

    const normalize = (t) =>
      String(t ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s_\-()（）【】\[\].,:，;；/\\]+/g, '')

    const hasAny = (t, list) => {
      const x = normalize(t)
      if (!x) return false
      return list.some((k) => x.includes(normalize(k)))
    }

    const keywordsFromCheckpoint = (t) => {
      const raw = String(t ?? '').trim()
      if (!raw) return []
      const parts = raw
        .split(/[\s,，;；/\\|]+/g)
        .map((x) => x.trim())
        .filter(Boolean)
      const stop = new Set(['的', '和', '或', '及', '与', '是否', '需要', '必须', '应', '应当', '不得', '禁止', '可以'])
      const out = []
      for (const p of parts) {
        if (p.length < 2) continue
        if (stop.has(p)) continue
        out.push(p)
      }
      return Array.from(new Set(out)).slice(0, 12)
    }

    const scoreSuggestion = (sug, kws, exts) => {
      const hintKws = String(sug?.keywords ?? '')
        .split('|')
        .map((x) => x.trim())
        .filter(Boolean)
      const hintSet = new Set(hintKws.map((x) => normalize(x)))
      const kwSet = new Set((kws || []).map((x) => normalize(x)))
      let hit = 0
      for (const k of kwSet) if (k && hintSet.has(k)) hit += 1
      if (exts?.length) {
        const name = String(sug?.name ?? '').toLowerCase()
        const ok = exts.some((e) => e && name.includes(String(e).toLowerCase()))
        if (!ok) return 0
      }
      return hit
    }

    const inferNameRulesBySkills = (stageName, checkpointText, exts) => {
      const kws = keywordsFromCheckpoint(checkpointText)
      const all = Array.isArray(fileNamingSuggestions) ? fileNamingSuggestions : []
      const ranked = all
        .map((x) => ({ x, score: scoreSuggestion(x, kws, exts) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map((x) => x.x)

      if (!ranked.length) {
        const likelyExt = exts?.length ? `（后缀：${exts.join(', ')}）` : ''
        return {
          derived: [],
          text: `未从命名技能库中匹配到明确的文件命名规则${likelyExt}；请根据检查要点补充更明确的交付物名称/文件名线索（例如“质量计划”“风险清单”等）。`,
          keywords: kws
        }
      }

      const rules = ranked.map((x) => ({
        stage: x.stage,
        category: x.category,
        namePattern: x.name,
        keywords: x.keywords
      }))

      const lines = rules
        .map((r, idx) => `${idx + 1}) ${r.category}：${r.namePattern}（关键词：${r.keywords}）`)
        .join('\n  ')

      return { derived: rules, text: `命名/交付物规则（由技能库推断）：\n  ${lines}`, keywords: kws }
    }

    const skillNamingWords = ['命名', '文件名', '路径', '目录', '归档', '存放', '命名规范']
    const skillExistWords = ['交付', '提交', '产出', '输出物', '输出', '附件', '提供', '必须有', '应提供', '需提供', '缺失']
    const isNamingRule = scope === '文件名' || hasAny(checkpoint, skillNamingWords)
    const isExistenceRule = hasAny(checkpoint, skillExistWords)

    const nameSkill = inferNameRulesBySkills(stage, checkpoint, extsArr)

    const selectFiles = `- 目标文件集合推导（用于“文件是否存在/内容是否可检查”）：\n  1) 后缀过滤：${extsArr.length ? extsArr.join(', ') : '不限制'}\n  2) 命名过滤：按“命名/交付物规则”中的文件名模式与关键词匹配文件名/路径（忽略大小写、空格、全角/半角、括号差异）\n  3) 若步骤 2 无法得到唯一结果：保留所有候选并在证据中列出被检查的文件清单`

    const existenceDecision = `- 文件存在性判定：\n  - 若推导出的目标文件集合为空：输出“不符合：缺少目标交付物文件，无法执行后续内容检查/命名验证”，并给出建议文件名模式（来自命名规则）与建议放置目录\n  - 若目标文件集合非空：进入下一步检查`

    const contentCheck = `- 内容检查（基于检查要点生成的检查方法）：\n  1) 优先在目标文件集合内检索检查要点中的关键短语/关键词（${nameSkill.keywords?.length ? nameSkill.keywords.join('、') : '从要点中提取'}）\n  2) 若要点明确为“必须包含/不得包含/必须说明/必须给出”：按对应约束检查（存在性/禁止性/完整性）\n  3) 若要点可转为结构化要素（例如“版本号/日期/责任人/审批”）：抽取这些要素并验证是否同时出现\n  4) 证据必须包含：文件路径 + 命中原文摘录；若无法命中，则说明未找到并给出应补齐的章节/字段建议`

    const namingCheck = `- 命名/路径检查（基于技能推断的命名模式）：\n  1) 对目标文件集合逐个校验：是否满足至少一条“文件名模式”\n  2) 若存在占位符（如 YYYYMMDD / v1.0）：允许实际值替换，但结构必须一致\n  3) 证据：列出命中的文件路径；不符合时列出不符合文件及原因`

    const output = `- 输出格式：\n  - 结论：符合 / 不符合\n  - 不符合原因：必须可定位（缺文件/缺内容/命名不符）\n  - 修改建议：补齐哪个交付物、建议文件名模式、建议目录、建议补充内容位置\n  - 证据：文件路径 + 摘录/命中信息`

    const parts = []
    parts.push(`${s}${c}`)
    parts.push(`检查对象：${scope}（${extsText}）`)
    parts.push(`严重性：${sev}`)
    parts.push(`命名技能：${nameSkill.text}`)
    parts.push(`检查步骤：\n${selectFiles}\n${existenceDecision}\n${isNamingRule ? namingCheck : contentCheck}\n${output}`)
    if (!isExistenceRule && !isNamingRule) {
      parts.push('补充说明：该要点未显式包含“交付物存在性/命名规范”信号，默认按内容检查执行；如需要强制校验交付物存在，请在要点中补充“必须提供/需提交/交付物”等描述。')
    }
    return parts.join('\n')
  }

  function genId() {
    try {
      return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
    } catch {
      return `${Date.now()}-${Math.random().toString(16).slice(2)}`
    }
  }

  function estimateSheetRows(sheet) {
    const ref = sheet?.['!ref']
    if (!ref) return 0
    try {
      const range = XLSX.utils.decode_range(ref)
      const rows = range.e.r - range.s.r
      return rows > 0 ? rows : 0
    } catch {
      return 0
    }
  }

  function getRuleStages() {
    const set = new Set()
    for (const r of rules.value) {
      const s = String(r?.stage || '').trim()
      if (s) set.add(s)
    }
    return Array.from(set)
  }

  function getRulesForProject(project) {
    const m = projectRuleStages.value || {}
    const perStage = m?.[project]
    if (!perStage || typeof perStage !== 'object') return rules.value
    const filtered = rules.value.filter((r) => {
      const stage = String(r?.stage || '').trim()
      const checkpoint = String(r?.checkpoint || '').trim()
      const item = String(r?.item || '').trim()
      const name = String(r?.name || '').trim()
      const allow = perStage?.[stage]
      if (!Array.isArray(allow)) return false
      if (!allow.length) return false
      const set = new Set(allow.map((x) => String(x).trim()).filter(Boolean))
      if (checkpoint && set.has(checkpoint)) return true
      if (item && set.has(item)) return true
      return name ? set.has(name) : false
    })
    return filtered.length ? filtered : rules.value
  }

  async function parseConfigExcelWithProgress(file, onProgress) {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const outMap = {}
    const issues = []

    const pushIssue = (sheet, row, field, message, value) => {
      issues.push({
        id: genId(),
        sheet: sheet || '-',
        row: row ?? '-',
        field: field || '-',
        message: String(message || '').trim() || '未知问题',
        value: value == null ? '' : String(value)
      })
    }

    const sheets = wb.SheetNames || []
    if (!sheets.length) {
      pushIssue('-', '-', '-', 'Excel 中未找到可解析的 Sheet', '')
      return { map: {}, issues }
    }

    const knownProjects = new Set(projectNames.value)
    const totalRows = sheets.reduce((sum, s) => {
      const sh = wb.Sheets?.[s]
      return sum + (sh ? estimateSheetRows(sh) : 0)
    }, 0)
    let processed = 0

    const pushProgress = async (sheetName, forceYield = false) => {
      const percent = totalRows ? Math.min(99, Math.round((processed / totalRows) * 100)) : 0
      onProgress?.({ percent, text: sheetName ? `导入中：${sheetName}（${processed} / ${totalRows}）` : `导入中（${processed} / ${totalRows}）` })
      if (forceYield) await nextTick()
    }

    for (const sheetName of sheets) {
      const stage = String(sheetName || '').trim() || '-'
      const sheet = wb.Sheets?.[sheetName]
      if (!sheet) {
        pushIssue(sheetName, '-', 'Sheet', '无法读取 Sheet', '')
        continue
      }

      const matrix = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1, blankrows: false })
      if (!Array.isArray(matrix) || matrix.length <= 1) {
        pushIssue(sheetName, '-', 'Sheet', 'Sheet 为空或没有数据行', '')
        await pushProgress(sheetName, true)
        continue
      }

      const headerRow = Array.isArray(matrix[0]) ? matrix[0] : []
      const headers = headerRow.map((x, idx) => String(x ?? '').trim() || `COL_${idx + 1}`)
      const projectHeaderHints = [
        '系统编号',
        '系统编码',
        '系统id',
        '项目编号',
        '项目编码',
        '项目id',
        '工程编号',
        '工程编码',
        '工程id',
        '系统',
        '项目',
        '工程',
        'projectid',
        'projectcode',
        'systemid',
        'systemcode',
        'systemno',
        'projectno',
        'code',
        '编号',
        'id'
      ]
      const scoreProjectHeader = (h) => {
        const k = normalizeHeaderKey(h)
        if (!k) return 0
        let s = 0
        for (const hint of projectHeaderHints) {
          const hk = normalizeHeaderKey(hint)
          if (!hk) continue
          if (k === hk) s += 6
          else if (k.includes(hk)) s += 3
        }
        return s
      }
      const known = Array.from(knownProjects || [])
      const looksLikeProjectValue = (v) => {
        const t = String(v ?? '').trim()
        if (!t) return false
        if (known.length && known.includes(t)) return true
        if (t.length >= 2 && t.length <= 64 && !/^\d+(\.\d+)?$/.test(t)) return true
        return false
      }
      const scoreProjectColBySamples = (colIdx) => {
        let n = 0
        let ok = 0
        for (let r = 1; r < Math.min(matrix.length, 21); r += 1) {
          const rowArr = Array.isArray(matrix[r]) ? matrix[r] : []
          const v = rowArr[colIdx]
          const t = String(v ?? '').trim()
          if (!t) continue
          n += 1
          if (looksLikeProjectValue(t)) ok += 1
        }
        return n ? ok / n : 0
      }
      let projectCol = 0
      let bestScore = -1
      for (let i = 0; i < headers.length; i += 1) {
        const hScore = scoreProjectHeader(headers[i])
        const vScore = scoreProjectColBySamples(i)
        const score = hScore + vScore * 4
        if (score > bestScore) {
          bestScore = score
          projectCol = i
        }
      }
      if (bestScore <= 0) {
        pushIssue(sheetName, 1, '表头', '未识别到项目/系统标识列，将默认使用第 1 列作为项目/系统标识', headers[0] || '')
        projectCol = 0
      }

      const itemCols = headers
        .map((h, idx) => ({ h, idx }))
        .filter(({ h, idx }) => idx !== projectCol && String(h || '').trim())

      if (!itemCols.length) {
        pushIssue(sheetName, 1, '表头', '未找到检查项列（除系统编号外的表头）', headers.join(' | '))
        await pushProgress(sheetName, true)
        continue
      }

      for (let r = 1; r < matrix.length; r += 1) {
        const rowArr = Array.isArray(matrix[r]) ? matrix[r] : []
        const rowNumber = r + 1
        const project = String(rowArr[projectCol] ?? '').trim()
        if (!project) continue

        if (knownProjects.size && !knownProjects.has(project)) {
          pushIssue(sheetName, rowNumber, '系统编号', '系统/项目未在导入目录中出现（可能拼写不一致）', project)
        }

        for (const { h, idx } of itemCols) {
          const cell = rowArr[idx]
          if (!truthyCell(cell)) continue
          if (!outMap[project]) outMap[project] = {}
          if (!Array.isArray(outMap[project][stage])) outMap[project][stage] = []
          outMap[project][stage].push(String(h || '').trim())
        }

        processed += 1
        if (processed % 50 === 0) await pushProgress(sheetName, true)
      }

      await pushProgress(sheetName, true)
    }

    onProgress?.({ percent: 100, text: `导入完成（${Object.keys(outMap).length} 个项目配置）` })
    return { map: outMap, issues }
  }

  async function parseRulesExcelWithProgress(file, onProgress) {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const out = []
    const issues = []
    const sheets = wb.SheetNames || []
    if (!sheets.length) {
      issues.push({
        id: genId(),
        sheet: '-',
        row: '-',
        field: '-',
        message: 'Excel 中未找到可解析的 Sheet',
        value: ''
      })
    }
    const totalEst = sheets.reduce((sum, name) => {
      const sh = wb.Sheets?.[name]
      return sum + (sh ? estimateSheetRows(sh) : 0)
    }, 0)
    let processed = 0

    const pushIssue = (sheet, row, field, message, value) => {
      issues.push({
        id: genId(),
        sheet: sheet || '-',
        row: row ?? '-',
        field: field || '-',
        message: String(message || '').trim() || '未知问题',
        value: value == null ? '' : String(value)
      })
    }

    const normalizeSeverityWithIssue = (raw, sheetName, rowNumber) => {
      const input = String(raw ?? '').trim()
      if (!input) return 'medium'
      const lowered = input.toLowerCase()
      if (['high', 'h', 'p0', '0', '严重', '高'].includes(lowered)) return 'high'
      if (['medium', 'm', 'p1', '1', '中'].includes(lowered)) return 'medium'
      if (['low', 'l', 'p2', '2', '低'].includes(lowered)) return 'low'
      pushIssue(sheetName, rowNumber, '严重性', '严重性无法识别，已按“中”处理', input)
      return 'medium'
    }

    const normalizeScopeWithIssue = (raw, sheetName, rowNumber) => {
      const input = String(raw ?? '').trim()
      if (!input) return 'content'
      const s = input.toLowerCase()
      if (['file', 'filename', 'name', '文件名', '文件'].includes(s)) return 'file'
      if (['content', '内容', '正文'].includes(s)) return 'content'
      return 'content'
    }

    const validatePatternWithIssue = (pattern, sheetName, rowNumber) => {
      const raw = String(pattern ?? '').trim()
      if (!raw) return
      const m = raw.match(/^\/(.+)\/([a-z]*)$/i)
      if (m) {
        try {
          const flags = m[2] || ''
          const flagsNoG = flags.replace(/g/g, '')
          new RegExp(m[1], flagsNoG)
        } catch (e) {
          pushIssue(
            sheetName,
            rowNumber,
            '规则详细',
            `正则表达式无效，将按纯文本匹配：${String(e?.message || e)}`,
            raw
          )
        }
      }
    }

    const makeUniqueHeaders = (headers, sheetName, headerRowNumber) => {
      const used = new Map()
      return headers.map((h) => {
        const base = String(h || '').trim() || 'COL'
        const key = base.toLowerCase()
        const n = (used.get(key) || 0) + 1
        used.set(key, n)
        if (n === 1) return base
        return `${base}_${n}`
      })
    }

    const normalizeHeaderKey = (s) => {
      return String(s ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s_\-()（）【】\[\].,:，;；/\\]+/g, '')
    }

    const headerHints = {
      id: ['id', 'no', 'index', '编号', '序号', '编号id', '序号id'],
      pattern: [
        'pattern',
        'regex',
        'regexp',
        'expression',
        'expr',
        'keyword',
        'keywords',
        'match',
        'matcher',
        'rulepattern',
        '规则内容',
        '规则详情',
        '规则详细',
        '扫描规则',
        '匹配规则',
        '匹配内容',
        '匹配条件',
        '检测内容',
        '检查规则',
        '检查内容',
        '关键字',
        '关键词',
        '正则',
        '正则表达式',
        '表达式',
        '检测点',
        '检查点',
        '检查项',
        '校验项'
      ],
      name: ['name', 'title', 'ruleName', '规则名', '规则名称', '标题', '名称', '检查点名称', '检查项名称'],
      severity: [
        'severity',
        'level',
        'priority',
        'p',
        'p0',
        'p1',
        'p2',
        '严重性',
        '严重程度',
        '等级',
        '优先级',
        '风险等级'
      ],
      scope: [
        'scope',
        'target',
        'type',
        'matchtarget',
        '检查对象',
        '扫描对象',
        '匹配对象',
        '对象',
        '类型',
        '作用域',
        '检查范围'
      ],
      extensions: [
        'extensions',
        'ext',
        'suffix',
        'filetype',
        'filetypes',
        '文件后缀',
        '后缀',
        '适用后缀',
        '文件类型',
        '文件格式'
      ],
      stage: ['stage', 'phase', '阶段', '所属阶段', '阶段名称', '分类', '模块']
    }

    const isNumericLike = (v) => {
      const s = String(v ?? '').trim()
      if (!s) return false
      return /^\d+(\.\d+)?$/.test(s)
    }

    const isNonRuleMarker = (v) => {
      const s = String(v ?? '').trim().toLowerCase()
      if (!s) return false
      if (['-', '—', '–', '不符合', '符合', '执行总数', '检查项', '检查结果', '不适用'].includes(s)) return true
      if (['y', 'yes', 'true', '1', '是', '对', '√', '✓', '✔'].includes(s)) return true
      if (['n', 'no', 'false', '0', '否', '错', '×', '✗', '✘'].includes(s)) return true
      return false
    }

    const guessHeaderKind = (cellText) => {
      const raw = String(cellText ?? '').trim()
      if (!raw) return null
      const key = normalizeHeaderKey(raw)
      if (!key) return null

      const scoreByKind = {}
      for (const [kind, hints] of Object.entries(headerHints)) {
        let score = 0
        for (const hint of hints) {
          const h = normalizeHeaderKey(hint)
          if (!h) continue
          if (key === h) score += 4
          else if (key.includes(h)) score += 2
        }
        if (score > 0) scoreByKind[kind] = score
      }

      const entries = Object.entries(scoreByKind).sort((a, b) => b[1] - a[1])
      if (!entries.length) {
        if (key.includes('编号') || key.includes('序号') || key === 'id' || key === 'no' || key.includes('index')) return 'id'
        if (key.includes('正则') || key.includes('regex') || key.includes('keyword') || key.includes('关键字'))
          return 'pattern'
        if (key.includes('后缀') || key.includes('suffix') || key.includes('ext')) return 'extensions'
        if (key.includes('严重') || key.includes('等级') || key.includes('level') || key.includes('severity'))
          return 'severity'
        if (key.includes('对象') || key.includes('范围') || key.includes('scope') || key.includes('target')) return 'scope'
        if (key.includes('名称') || key.includes('标题') || key.includes('name') || key.includes('title')) return 'name'
        return null
      }

      const best = entries[0][0]
      if (best === 'name' && (key.includes('规则') || key.includes('rule')) && !key.includes('名') && !key.includes('名称')) {
        return 'pattern'
      }
      if (best === 'pattern' && (key.includes('名') || key.includes('名称') || key.includes('title'))) {
        return 'name'
      }
      return best
    }

    const scoreKindByHeader = (headerText, kind) => {
      const raw = String(headerText ?? '').trim()
      if (!raw) return 0
      const key = normalizeHeaderKey(raw)
      if (!key) return 0
      const hints = headerHints?.[kind] || []
      let score = 0
      for (const hint of hints) {
        const hk = normalizeHeaderKey(hint)
        if (!hk) continue
        if (key === hk) score += 6
        else if (key.includes(hk)) score += 3
      }
      if (kind === 'id' && (key === '#' || key === '序' || key.includes('序') || key.includes('编号'))) score += 2
      return score
    }

    const sampleColumnStats = (matrix, headerIdx, colIdx) => {
      const maxRows = Math.min(matrix.length, headerIdx + 1 + 30)
      let n = 0
      let numeric = 0
      let boolMark = 0
      let sev = 0
      let ext = 0
      let scope = 0
      let totalLen = 0
      const sevSet = new Set(['high', 'medium', 'low', 'h', 'm', 'l', 'p0', 'p1', 'p2', '严重', '高', '中', '低'])
      const scopeSet = new Set(['file', 'filename', 'name', '文件名', '文件', 'content', '内容', '正文'])
      for (let r = headerIdx + 1; r < maxRows; r += 1) {
        const row = Array.isArray(matrix[r]) ? matrix[r] : []
        const v = String(row?.[colIdx] ?? '').trim()
        if (!v) continue
        n += 1
        totalLen += v.length
        if (isNumericLike(v)) numeric += 1
        if (isNonRuleMarker(v)) boolMark += 1
        if (sevSet.has(v.toLowerCase())) sev += 1
        if (scopeSet.has(v.toLowerCase())) scope += 1
        if (/^\.[a-z0-9]+$/i.test(v) || /^[a-z0-9]+$/i.test(v)) {
          const t = v.startsWith('.') ? v.toLowerCase() : `.${v.toLowerCase()}`
          if (/^\.[a-z0-9]+$/.test(t) && !['.提交件', '.工作件'].includes(t)) ext += 1
        }
      }
      const avgLen = n ? totalLen / n : 0
      const ratio = (x) => (n ? x / n : 0)
      return {
        n,
        avgLen,
        numericRatio: ratio(numeric),
        boolRatio: ratio(boolMark),
        sevRatio: ratio(sev),
        extRatio: ratio(ext),
        scopeRatio: ratio(scope)
      }
    }

    const checkpointHeaderHints = [
      '检查要点',
      '检测要点',
      '校验要点',
      '检查点',
      '检测点',
      '要点',
      '检查项',
      '校验项',
      '检查内容',
      '检测内容',
      '规则内容',
      '规则详细',
      '规则详情'
    ]

    const pickCheckpointColByHeader = (headers, idColsArr) => {
      const idSet = new Set(idColsArr || [])
      let best = null
      for (let i = 0; i < headers.length; i += 1) {
        if (idSet.has(i)) continue
        const h = String(headers[i] ?? '').trim()
        if (!h) continue
        const key = normalizeHeaderKey(h)
        if (!key) continue
        let score = 0
        for (const hint of checkpointHeaderHints) {
          const hk = normalizeHeaderKey(hint)
          if (!hk) continue
          if (key === hk) score += 12
          else if (key.includes(hk)) score += 6
        }
        if (key.includes(normalizeHeaderKey('检查要点'))) score += 20
        if (!best || score > best.score) best = { idx: i, score }
      }
      return best && best.score > 0 ? best.idx : null
    }

    const normalizeCheckpointValue = (v) => {
      const t = String(v ?? '').trim()
      if (!t) return ''
      if (isNumericLike(t)) return ''
      if (isNonRuleMarker(t)) return ''
      return t
    }

    const isExtLikeValue = (t) => {
      const v = String(t ?? '').trim()
      if (!v) return false
      if (/^\.[a-z0-9]+$/i.test(v)) return true
      if (/^[a-z0-9]+$/i.test(v)) return true
      return false
    }

    const inferKinds = (matrix, headerIdx, headers) => {
      const cols = headers.length
      const stats = Array.from({ length: cols }).map((_, i) => sampleColumnStats(matrix, headerIdx, i))
      const scored = Array.from({ length: cols }).map((_, i) => {
        const header = headers[i]
        const st = stats[i]
        const headerScores = {
          id: scoreKindByHeader(header, 'id'),
          severity: scoreKindByHeader(header, 'severity'),
          extensions: scoreKindByHeader(header, 'extensions'),
          scope: scoreKindByHeader(header, 'scope'),
          name: scoreKindByHeader(header, 'name'),
          pattern: scoreKindByHeader(header, 'pattern')
        }
        const valueScores = {
          id: st.numericRatio >= 0.6 && st.avgLen <= 8 ? 6 : st.numericRatio >= 0.4 && st.avgLen <= 10 ? 3 : 0,
          severity: st.sevRatio >= 0.5 ? 6 : st.sevRatio >= 0.3 ? 3 : 0,
          extensions: st.extRatio >= 0.5 ? 6 : st.extRatio >= 0.3 ? 3 : 0,
          scope: st.scopeRatio >= 0.5 ? 6 : st.scopeRatio >= 0.3 ? 3 : 0,
          pattern:
            st.n >= 3 && st.avgLen >= 4 && st.numericRatio < 0.3 && st.boolRatio < 0.3 && st.extRatio < 0.3 && st.sevRatio < 0.3
              ? 6
              : st.n >= 2 && st.avgLen >= 3 && st.numericRatio < 0.4 && st.boolRatio < 0.4
                ? 3
                : 0,
          name:
            st.n >= 3 && st.avgLen >= 2 && st.avgLen <= 30 && st.numericRatio < 0.5 && st.boolRatio < 0.4 && st.extRatio < 0.3
              ? 3
              : 0
        }
        const score = (k) => (headerScores[k] || 0) + (valueScores[k] || 0)
        return { i, score, headerScores, valueScores, st }
      })

      const bestCol = (kind, ban = new Set()) => {
        let best = null
        for (const x of scored) {
          if (ban.has(x.i)) continue
          const s = x.score(kind)
          if (!best || s > best.s) best = { idx: x.i, s }
        }
        return best && best.s > 0 ? best.idx : null
      }

      const idCols = new Set()
      for (const x of scored) {
        const s = x.score('id')
        if (s >= 6) idCols.add(x.i)
      }

      const severityCol = bestCol('severity', idCols)
      const extCol = bestCol('extensions', idCols)
      const scopeCol = bestCol('scope', idCols)
      const nameCol = bestCol('name', idCols)

      const checkpointCol = (() => {
        let best = null
        for (const x of scored) {
          if (idCols.has(x.i)) continue
          const s = x.score('pattern')
          if (!best || s > best.s) best = { idx: x.i, s }
        }
        if (best && best.s > 0) return best.idx
        for (let i = 0; i < headers.length; i += 1) {
          if (!idCols.has(i)) return i
        }
        return 0
      })()

      return { idCols: Array.from(idCols), severityCol, extCol, scopeCol, nameCol, checkpointCol }
    }

    const buildHeaderMappingFromRow = (rowCells, sheetName, headerRowNumber) => {
      const headersRaw = rowCells.map((x, idx) => {
        const h = String(x ?? '').trim()
        return h || `COL_${idx + 1}`
      })
      const headers = makeUniqueHeaders(headersRaw, sheetName, headerRowNumber)

      const map = {}
      const allByKind = { id: [], pattern: [], name: [], severity: [], scope: [], extensions: [], stage: [] }
      const usedByKind = new Map()
      for (let i = 0; i < headers.length; i += 1) {
        const h = headers[i]
        const kind = guessHeaderKind(h)
        if (!kind) continue
        if (allByKind[kind]) allByKind[kind].push(i)
        if (kind === 'id') {
          if (!usedByKind.has(kind)) {
            map[kind] = i
            usedByKind.set(kind, i)
          }
          continue
        }
        if (kind === 'pattern') {
          if (!usedByKind.has(kind)) {
            map[kind] = i
            usedByKind.set(kind, i)
          }
          continue
        }
        if (usedByKind.has(kind)) continue
        map[kind] = i
        usedByKind.set(kind, i)
      }

      const recognized = Object.keys(map).length
      const nonEmpty = headersRaw.filter((x) => String(x ?? '').trim()).length
      return { headers, headersRaw, map, allByKind, recognized, nonEmpty }
    }

    const findBestHeaderRowIndex = (matrix, sheetName) => {
      const limit = Math.min(30, matrix.length)
      let best = { idx: -1, recognized: -1, nonEmpty: -1 }
      for (let i = 0; i < limit; i += 1) {
        const row = Array.isArray(matrix[i]) ? matrix[i] : []
        if (!row.length) continue
        const headerRowNumber = i + 1
        const probe = buildHeaderMappingFromRow(row, sheetName, headerRowNumber)
        if (probe.recognized > best.recognized) best = { idx: i, recognized: probe.recognized, nonEmpty: probe.nonEmpty }
        else if (probe.recognized === best.recognized && probe.nonEmpty > best.nonEmpty)
          best = { idx: i, recognized: probe.recognized, nonEmpty: probe.nonEmpty }
      }
      return best.idx
    }

    const pushProgress = async (sheetName, forceYield = false) => {
      const percent = totalEst ? Math.min(99, Math.round((processed / totalEst) * 100)) : 0
      const text = sheetName
        ? `导入中：${sheetName}（${processed}${totalEst ? ` / ${totalEst}` : ''}）`
        : `导入中（${processed}${totalEst ? ` / ${totalEst}` : ''}）`
      onProgress?.({ percent, text, partial: out.slice() })
      if (forceYield) await nextTick()
    }

    for (const sheetName of sheets) {
      const sheet = wb.Sheets?.[sheetName]
      if (!sheet) continue
      const stageFromSheet = String(sheetName || '').trim()
      const matrix = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1, blankrows: false })
      if (!Array.isArray(matrix) || matrix.length <= 1) {
        pushIssue(stageFromSheet, '-', 'Sheet', 'Sheet 为空或没有数据行', '')
        await pushProgress(stageFromSheet, true)
        continue
      }

      const headerIndex = findBestHeaderRowIndex(matrix, stageFromSheet)
      if (headerIndex < 0) {
        pushIssue(stageFromSheet, '-', '表头', '未找到可识别的表头行，将默认使用第 1 行作为表头', '')
      }

      const actualHeaderIndex = headerIndex >= 0 ? headerIndex : 0
      const headerRow = Array.isArray(matrix[actualHeaderIndex]) ? matrix[actualHeaderIndex] : []
      const headerRowNumber = actualHeaderIndex + 1
      const headerInfo = buildHeaderMappingFromRow(headerRow, stageFromSheet, headerRowNumber)
      const headers = headerInfo.headers
      const colInfo = inferKinds(matrix, actualHeaderIndex, headers)
      const idCols = Array.isArray(colInfo.idCols) ? colInfo.idCols : []
      const inferredCheckpointCol = colInfo.checkpointCol
      const severityCol = colInfo.severityCol
      const extCol = colInfo.extCol
      const scopeCol = colInfo.scopeCol
      const nameCol = colInfo.nameCol

      const chooseCheckpointCol = () => {
        const byHeader = pickCheckpointColByHeader(headers, idCols)
        if (byHeader != null) return byHeader
        if (inferredCheckpointCol != null && !idCols.includes(inferredCheckpointCol)) return inferredCheckpointCol
        for (let i = 0; i < headers.length; i += 1) {
          if (!idCols.includes(i)) return i
        }
        return 0
      }
      const checkpointCol = chooseCheckpointCol()
      const idSet = new Set(idCols)
      const stageCol = headerInfo?.map?.stage ?? null

      for (let i = actualHeaderIndex + 1; i < matrix.length; i += 1) {
        const rowArr = Array.isArray(matrix[i]) ? matrix[i] : []
        const cellAt = (idx) => (idx == null ? '' : rowArr[idx] ?? '')

        const rowNumber = i + 1
        let checkpoint = normalizeCheckpointValue(cellAt(checkpointCol))
        let usedCol = checkpoint ? checkpointCol : null

        if (!checkpoint) {
          let best = null
          for (let c = 0; c < headers.length; c += 1) {
            if (idSet.has(c)) continue
            if (c === severityCol || c === extCol || c === scopeCol || c === nameCol || c === stageCol) continue
            const v = normalizeCheckpointValue(cellAt(c))
            if (!v) continue
            if (isExtLikeValue(v)) continue
            const hs = scoreKindByHeader(headers[c], 'pattern') + (normalizeHeaderKey(headers[c]).includes(normalizeHeaderKey('要点')) ? 10 : 0)
            const vs = Math.min(10, v.length / 8)
            const score = hs + vs
            if (!best || score > best.score) best = { col: c, v, score }
          }
          if (best) {
            checkpoint = best.v
            usedCol = best.col
            pushIssue(stageFromSheet, rowNumber, '规则详细', '检查要点列为空，已回退使用该行其他列作为规则详细', headers[best.col] || '')
          }
        }

        if (!checkpoint || usedCol == null) continue

        const nameCell = nameCol != null ? String(cellAt(nameCol) ?? '').trim() : ''
        const nameBase = nameCell && !isNumericLike(nameCell) && !isNonRuleMarker(nameCell) ? nameCell : checkpoint

        const severityRaw = severityCol != null ? cellAt(severityCol) : ''
        const severity = normalizeSeverityWithIssue(severityRaw, stageFromSheet, rowNumber)
        const scopeRaw = scopeCol != null ? cellAt(scopeCol) : ''
        const extRaw = extCol != null ? cellAt(extCol) : ''
        const ext = parseExtensions(extRaw)

        const scopeFromCol = String(scopeRaw ?? '').trim()

        const stage = stageFromSheet || '-'
        if (String(extRaw ?? '').trim() && !ext.length) {
          // ignore: previously warned "后缀列有值但解析结果为空"，现在不再提示
        }

        const label = String(headers[usedCol] ?? '').trim() || `COL_${usedCol + 1}`
        const scope = scopeFromCol ? normalizeScopeWithIssue(scopeFromCol, stageFromSheet, rowNumber) : 'content'
        const patternKind = String(checkpoint).match(/^\/(.+)\/([a-z]*)$/i) ? 'regex' : 'text'
        if (patternKind === 'regex') validatePatternWithIssue(checkpoint, stageFromSheet, rowNumber)

        const rule = {
          id: genId(),
          name: String(nameBase ?? '').trim() || String(checkpoint).trim(),
          stage,
          checkpoint: String(checkpoint ?? '').trim(),
          item: String(label ?? '').trim(),
          pattern: String(checkpoint).trim(),
          patternKind,
          prompt: '',
          reason: '',
          suggestion: '',
          severity,
          scope,
          extensions: ext
        }
        rule.prompt = buildRulePrompt(rule)
        out.push(rule)
        processed += 1
        if (processed % 50 === 0) await pushProgress(stageFromSheet, true)
      }

      await pushProgress(stageFromSheet, true)
    }

    onProgress?.({ percent: 100, text: `导入完成（${out.length} 条规则）`, partial: out.slice() })
    return { rules: out, issues }
  }

  function fileExt(fileName) {
    const lower = String(fileName ?? '').toLowerCase()
    const idx = lower.lastIndexOf('.')
    return idx >= 0 ? lower.slice(idx) : ''
  }

  function isScannableFile(fileName) {
    const lower = String(fileName ?? '').toLowerCase()
    const allow = [
      '.js',
      '.jsx',
      '.ts',
      '.tsx',
      '.vue',
      '.json',
      '.md',
      '.txt',
      '.html',
      '.css',
      '.scss',
      '.less',
      '.xml',
      '.yml',
      '.yaml',
      '.py',
      '.java',
      '.go',
      '.rs',
      '.sh',
      '.bash',
      '.toml',
      '.ini',
      '.properties',
      '.env',
      '.xlsx',
      '.xls',
      '.docx',
      '.pptx',
      '.pdf'
    ]
    return allow.some((x) => lower.endsWith(x))
  }

  function isTextLikeFile(fileName) {
    const ext = fileExt(fileName)
    return !['.xlsx', '.xls', '.docx', '.pptx', '.pdf'].includes(ext)
  }

  const extractTextCache = new Map()
  function extractCacheKey(file) {
    const rel = String(file?.webkitRelativePath || '').trim()
    const name = String(file?.name || '').trim()
    const size = Number(file?.size || 0) || 0
    const lm = Number(file?.lastModified || 0) || 0
    return `${rel || name}::${size}::${lm}`
  }

  async function extractTextForScan(file) {
    if (!file) return { text: null, error: 'file 为空' }
    const key = extractCacheKey(file)
    if (extractTextCache.has(key)) return await extractTextCache.get(key)

    const task = (async () => {
    const ext = fileExt(file.name)
    if (isTextLikeFile(file.name)) {
      try {
        const text = await file.text()
        return { text: String(text || ''), error: '' }
      } catch (e) {
        return { text: null, error: `读取文本失败：${String(e?.message || e)}` }
      }
    }

    async function extractByBackend() {
      try {
        const buf = await file.arrayBuffer()
        const safeName = safeUploadFilename(file?.name, 'upload')
        const res = await fetch('/api/extract/text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': safeName },
          body: buf
        })
        if (!res.ok) throw new Error(await res.text())
        const json = await res.json().catch(() => ({}))
        const text = String(json?.text || '')
        if (!text.trim()) return { text: null, error: '后端无法从文件中提取文本' }
        return { text, error: '' }
      } catch (e) {
        return { text: null, error: `后端提取文本失败：${String(e?.message || e)}` }
      }
    }

    if (ext === '.xlsx' || ext === '.xls') {
      const back = await extractByBackend()
      if (back?.text) return back
      try {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        const parts = []
        for (const sheetName of wb.SheetNames || []) {
          const sheet = wb.Sheets?.[sheetName]
          if (!sheet) continue
          const csv = XLSX.utils.sheet_to_csv(sheet)
          if (csv) parts.push(`=== ${sheetName} ===\n${csv}`)
        }
        const text = parts.join('\n\n')
        return { text: text || '', error: '' }
      } catch (e) {
        const tail = back?.error ? `；${back.error}` : ''
        return { text: null, error: `读取 Excel 失败：${String(e?.message || e)}${tail}` }
      }
    }

    if (['.docx', '.pptx', '.pdf'].includes(ext)) {
      return await extractByBackend()
    }

    return { text: null, error: `不支持的文件类型：${ext || '(无后缀)'}` }
    })()

    extractTextCache.set(key, task)
    return await task
  }

  function filePassesRule(fileName, rule) {
    if (!rule.extensions?.length) return true
    const lower = String(fileName ?? '').toLowerCase()
    return rule.extensions.some((x) => lower.endsWith(x))
  }

  function buildMatcher(rule) {
    const raw = String(rule?.pattern ?? '').trim()
    const kindHint = String(rule?.patternKind ?? '').trim()
    if (kindHint === 'text') return { kind: 'text', text: raw }
    const m = raw.match(/^\/(.+)\/([a-z]*)$/i)
    if (m) {
      try {
        const flags = m[2].includes('g') ? m[2] : `${m[2]}g`
        return { kind: 'regex', re: new RegExp(m[1], flags) }
      } catch {
        return { kind: 'text', text: raw }
      }
    }
    return { kind: 'text', text: raw }
  }

  function countMatchesRegex(re, text, limit = 500) {
    let n = 0
    re.lastIndex = 0
    while (n < limit) {
      const m = re.exec(text)
      if (!m) break
      n += 1
      if (m[0] === '') re.lastIndex += 1
    }
    re.lastIndex = 0
    return n
  }

  function countMatchesText(needle, text, limit = 500) {
    if (!needle) return 0
    let from = 0
    let n = 0
    while (n < limit) {
      const idx = text.indexOf(needle, from)
      if (idx < 0) break
      n += 1
      from = idx + needle.length
    }
    return n
  }

  function severityLabel(sev) {
    if (sev === 'high') return '高'
    if (sev === 'low') return '低'
    return '中'
  }

  function scopeLabel(scope) {
    return scope === 'file' ? '文件名' : '内容'
  }

  function severityColor(sev) {
    if (sev === 'high') return 'red'
    if (sev === 'low') return 'green'
    return 'gold'
  }

  const canStart = computed(() => {
    return scanFiles.value.length > 0 && rules.value.length > 0 && !scanning.value
  })

  async function startScan() {
    if (!canStart.value) return

    scanning.value = true
    progress.value = 0
    statusText.value = '准备扫描...'
    findings.value = []
    doneRulesByProject.value = {}

    try {
      await ensureWorkReady()
      const res = await fetch('/api/llm/health', { method: 'GET' })
      const json = res.ok ? await res.json().catch(() => ({})) : {}
      if (!json?.configured) {
        statusText.value = '未配置大模型：请设置 AUTOQA_LLM_API_KEY（或 OPENAI_API_KEY）并重启后端'
        scanning.value = false
        return
      }
    } catch (e) {
      statusText.value = `无法连接后端大模型服务：${String(e?.message || e)}`
      scanning.value = false
      return
    }

    const files = scanFiles.value
    const filesByProject = new Map()
    for (const f of files) {
      const p = projectNameOfFile(f)
      if (!filesByProject.has(p)) filesByProject.set(p, [])
      filesByProject.get(p).push(f)
    }

    const all = []
    let skipped = 0
    const projects = Array.from(filesByProject.keys()).sort((a, b) => String(a).localeCompare(String(b)))
    const totalChecksAll = projects.reduce((sum, p) => sum + getRulesForProject(p).length, 0)
    let doneAll = 0

    const fileMatchesNamePattern = (fileName, namePattern) => {
      const norm = (t) =>
        String(t ?? '')
          .trim()
          .toLowerCase()
          .replace(/[\s_\-()（）【】\[\].,:，;；/\\]+/g, '')

      const splitOutsideParens = (s) => {
        const out = []
        let cur = ''
        let depth = 0
        for (const ch of String(s || '')) {
          if (ch === '(') depth += 1
          else if (ch === ')') depth = Math.max(0, depth - 1)
          if (ch === '/' && depth === 0) {
            out.push(cur)
            cur = ''
            continue
          }
          cur += ch
        }
        out.push(cur)
        return out.map((x) => String(x || '').trim()).filter(Boolean)
      }

      const escapeRx = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

      const buildCoreRx = (pat) => {
        const s = String(pat || '').replace(/（/g, '(').replace(/）/g, ')')
        const parts = []
        let i = 0
        while (i < s.length) {
          if (s.startsWith('YYYYMMDD', i)) {
            parts.push('\\d{8}')
            i += 8
            continue
          }
          if (s.startsWith('vX.Y', i)) {
            parts.push('v\\d+(?:\\d+){0,10}')
            i += 4
            continue
          }
          if (s.startsWith('YYYY', i)) {
            parts.push('\\d{4}')
            i += 4
            continue
          }
          if (s.startsWith('MM', i)) {
            parts.push('\\d{2}')
            i += 2
            continue
          }
          if (s.startsWith('DD', i)) {
            parts.push('\\d{2}')
            i += 2
            continue
          }
          const ch = s[i]
          if (ch === '(') {
            let j = i + 1
            let d = 1
            while (j < s.length && d > 0) {
              if (s[j] === '(') d += 1
              else if (s[j] === ')') d -= 1
              if (d === 0) break
              j += 1
            }
            const inner = s.slice(i + 1, j)
            const alts = splitOutsideParens(inner).map((x) => escapeRx(norm(x))).filter(Boolean)
            if (alts.length) parts.push(`(?:${alts.join('|')})`)
            i = j + 1
            continue
          }

          let j = i
          while (j < s.length) {
            const c = s[j]
            if (c === '(') break
            if (s.startsWith('YYYYMMDD', j) || s.startsWith('vX.Y', j) || s.startsWith('YYYY', j) || s.startsWith('MM', j) || s.startsWith('DD', j))
              break
            j += 1
          }
          const lit = norm(s.slice(i, j))
          if (lit) parts.push(escapeRx(lit))
          i = j
        }
        return parts.join('')
      }

      const fn = norm(fileName)
      const rawPat = String(namePattern || '').trim()
      if (!fn || !rawPat) return false
      const alts = splitOutsideParens(String(rawPat).replace(/（/g, '(').replace(/）/g, ')'))
      if (!alts.length) return false
      for (const a of alts) {
        const core = buildCoreRx(a)
        if (!core) continue
        try {
          if (new RegExp(core, 'i').test(fn)) return true
        } catch {
          continue
        }
      }
      return false
    }

    const candidatesForRule = (projFiles, project, rule) => {
      const stageNeed = String(rule?.stage || '').trim()
      const stageFiltered = stageNeed ? projFiles.filter((f) => String(stageNameOfFile(f) || '').trim() === stageNeed) : projFiles
      const extFiltered = stageFiltered.filter((f) => filePassesRule(f.name, rule))
      const meta = rule?.promptMeta
      const naming = Array.isArray(meta?.naming) ? meta.naming : []
      if (!naming.length) {
        const kws = Array.isArray(meta?.keywords) ? meta.keywords : []
        const norm = (t) =>
          String(t ?? '')
            .trim()
            .toLowerCase()
            .replace(/[\s_\-()（）【】\[\].,:，;；/\\]+/g, '')
        const kwNorms = kws.map((x) => norm(x)).filter(Boolean)
        if (kwNorms.length) {
          return extFiltered.filter((f) => {
            const target = norm(withinProjectPathOfFile(f) || f.name)
            return kwNorms.some((k) => target.includes(k))
          })
        }
        return extFiltered
      }
      const matched = extFiltered.filter((f) => naming.some((x) => fileMatchesNamePattern(f.name, x?.namePattern)))
      return matched
    }

    const candidatesCache = new Map()
    const selectCandidatesByBackend = async (project, rule, projFiles) => {
      const rid = String(rule?.id || rule?.name || rule?.pattern || '').trim()
      const key = `${String(project || '').trim()}::${rid}::${String(rule?.stage || '').trim()}`
      if (candidatesCache.has(key)) return candidatesCache.get(key)
      const files = projFiles.map((f) => {
        const path = withinProjectPathOfFile(f) || f.name
        const stage = String(stageNameOfFile(f) || '').trim()
        return { path, name: f.name, stage }
      })
      const rulePayload = {
        id: rule?.id,
        name: rule?.name,
        pattern: rule?.pattern,
        checkpoint: rule?.checkpoint,
        stage: rule?.stage,
        scope: rule?.scope,
        severity: rule?.severity,
        extensions: rule?.extensions,
        promptMeta: rule?.promptMeta
      }
      try {
        const res = await fetch('/api/scan/candidates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project, rule: rulePayload, files })
        })
        if (!res.ok) throw new Error(await res.text())
        const json = await res.json().catch(() => ({}))
        const cands = Array.isArray(json?.candidates) ? json.candidates : []
        const out = { candidates: cands, meta: json }
        candidatesCache.set(key, out)
        return out
      } catch {
        return null
      }
    }

    const evidenceText = (ev) => {
      if (Array.isArray(ev)) {
        return ev
          .map((x) => {
            const f = String(x?.file || '').trim()
            const s = String(x?.snippet || x?.hit || '').trim()
            return `${f}${s ? `：${s}` : ''}`
          })
          .filter(Boolean)
          .join('\n')
      }
      return String(ev || '').trim()
    }

    const doneMap = {}
    let findingsUpdateScheduled = false
    const flushFindings = () => {
      findingsUpdateScheduled = false
      findings.value = all.slice()
    }
    const pushFinding = (x) => {
      const stage = String(x?.stage || '').trim() || '-'
      all.push({ ...x, stage })
      if (findingsUpdateScheduled) return
      findingsUpdateScheduled = true
      globalThis.requestAnimationFrame ? globalThis.requestAnimationFrame(flushFindings) : setTimeout(flushFindings, 0)
    }
    const markRuleDone = async (project) => {
      doneAll += 1
      doneMap[project] = (doneMap[project] || 0) + 1
      doneRulesByProject.value = { ...doneMap }
      progress.value = totalChecksAll ? Math.min(100, Math.round((doneAll / totalChecksAll) * 100)) : 100
      if (doneAll % 10 === 0) await nextTick()
    }

    const mapLimit = async (arr, limit, mapper) => {
      const list = Array.isArray(arr) ? arr : []
      const n = Math.max(1, Number(limit || 1) || 1)
      const out = new Array(list.length)
      let idx = 0
      const workers = new Array(Math.min(n, list.length)).fill(0).map(async () => {
        while (idx < list.length) {
          const cur = idx
          idx += 1
          out[cur] = await mapper(list[cur], cur)
        }
      })
      await Promise.all(workers)
      return out
    }

    const llmCache = new Map()
    const LLM_CONCURRENCY = 2
    let llmInFlight = 0
    const llmWaiters = []
    const withLlmLimit = async (fn) => {
      while (llmInFlight >= LLM_CONCURRENCY) {
        await new Promise((resolve) => llmWaiters.push(resolve))
      }
      llmInFlight += 1
      try {
        return await fn()
      } finally {
        llmInFlight -= 1
        const next = llmWaiters.shift()
        if (next) next()
      }
    }

    const runOneRule = async (project, projFiles, rule) => {
      const back = await selectCandidatesByBackend(project, rule, projFiles)
      const backCands = Array.isArray(back?.candidates) ? back.candidates : null
      const projMap = new Map(projFiles.map((f) => [String(withinProjectPathOfFile(f) || f.name), f]))
      const picked =
        backCands != null
          ? backCands
              .map((x) => projMap.get(String(x?.path || '').trim()))
              .filter(Boolean)
          : null
      const cands = picked != null ? picked : candidatesForRule(projFiles, project, rule)
      const stage = String(rule?.stage || '').trim() || '-'

      if (!cands.length) {
        const namingArr = Array.isArray(rule?.promptMeta?.naming) ? rule.promptMeta.naming : []
        const namingHint = namingArr.length
          ? `；命名规则未命中（参考：${namingArr.map((x) => x?.namePattern).filter(Boolean).join(' / ')}）`
          : ''
        const backMeta = back?.meta
        const backHint =
          backCands != null
            ? `；后端判定：阶段过滤后 ${backMeta?.counts?.afterStage ?? '-'}，后缀过滤后 ${backMeta?.counts?.afterExt ?? '-'}，命中 ${backMeta?.counts?.selected ?? '-'}（按 ${backMeta?.source || '-'}）`
            : ''
        pushFinding({
          id: genId(),
          project,
          stage,
          file: `${rule.stage || ''}（缺少文件）`,
          rule: rule.name,
          severity: rule.severity,
          reason: `缺少目标文件：未找到满足阶段/后缀/命名规则的文件，无法执行检查要点：${rule.pattern}${namingHint}${backHint}`,
          suggestion: String(rule.suggestion || '').trim(),
          isMissingFile: true,
          matchedFiles: [],
          matchedFilesCount: 0,
          evidence: [],
          evidenceCount: 0
        })
        await markRuleDone(project)
        return
      }

      const scope = rule.scope === 'file' ? 'file' : 'content'
      if (scope === 'file') {
        await markRuleDone(project)
        return
      }
      const existenceOnly = /签字|签署|盖章|确认完整|签字确认/.test(String(rule?.checkpoint || rule?.pattern || ''))
      if (existenceOnly) {
        await markRuleDone(project)
        return
      }

      const maxCands = 8
      const checked = []
      const unreadables = []
      const limited = await mapLimit(
        cands.slice(0, maxCands),
        3,
        async (f) => {
          const pathInProject = withinProjectPathOfFile(f) || f.name
          const res = await extractTextForScan(f)
          return { f, pathInProject, res }
        }
      )
      for (const x of limited) {
        const res = x?.res
        if (!res?.text) {
          skipped += 1
          unreadables.push({ file: x.pathInProject, reason: String(res?.error || '无法读取') })
          continue
        }
        const rawText = String(res.text || '')
        const content = rawText.length > 12000 ? rawText.slice(0, 12000) : rawText
        checked.push({ path: x.pathInProject, name: x.f.name, content, _cacheKey: extractCacheKey(x.f) })
      }

      if (!checked.length) {
        const detail = unreadables.length ? `\n${unreadables.map((x) => `${x.file}：${x.reason}`).join('\n')}` : ''
        pushFinding({
          id: genId(),
          project,
          stage,
          file: `${cands.length} 个文件已检查`,
          rule: rule.name,
          severity: rule.severity,
          reason: `未能读取候选文件正文，无法执行内容检查：${rule.pattern}${detail}`,
          suggestion: String(rule.suggestion || '').trim(),
          matchedFiles: cands.slice(0, maxCands).map((f) => withinProjectPathOfFile(f) || f.name),
          matchedFilesCount: cands.slice(0, maxCands).length,
          evidence: [],
          evidenceCount: 0
        })
        await markRuleDone(project)
        return
      }

      try {
        const checkedPaths = checked.map((x) => String(x?.path || x?.name || '').trim()).filter(Boolean)
        const rid = String(rule?.id || rule?.name || rule?.pattern || '').trim()
        const llmKey = `${String(project || '').trim()}::${rid}::${stage}::${checked
          .map((x) => `${String(x?.path || '').trim()}@${String(x?._cacheKey || '')}`)
          .join('|')}`
        const cached = llmCache.get(llmKey)
        const llmJson = cached
          ? cached
          : await withLlmLimit(async () => {
              const rulePayload = {
                id: rule?.id,
                name: rule?.name,
                stage: rule?.stage,
                scope: rule?.scope,
                severity: rule?.severity,
                checkpoint: rule?.checkpoint,
                pattern: rule?.pattern,
                prompt: rule?.prompt
              }
              const payload = {
                project,
                rule: rulePayload,
                candidates: checked.map(({ _cacheKey, ...rest }) => rest)
              }

              const doFetch = async () => {
                const llmRes = await fetch('/api/scan/llm', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload)
                })
                const txt = llmRes.ok ? '' : await llmRes.text().catch(() => '')
                return { ok: llmRes.ok, status: llmRes.status, txt, res: llmRes }
              }

              let r = await doFetch()
              if (!r.ok && [429, 502, 503, 504].includes(Number(r.status || 0))) {
                await new Promise((resolve) => setTimeout(resolve, 800 + Math.round(Math.random() * 400)))
                r = await doFetch()
              }
              if (!r.ok) throw new Error(r.txt || `HTTP ${r.status || 0}`)
              const json = await r.res.json().catch(() => ({}))
              llmCache.set(llmKey, json)
              return json
            })

        const result = llmJson?.result || llmJson || {}
        const conclusion = String(result?.conclusion || '').trim()
        const isFail = conclusion === '不符合' || (conclusion.includes('不符合') && !conclusion.includes('符合且'))
        if (isFail) {
          const ev = evidenceText(result?.evidence)
          const reasonText = String(result?.reason || '').trim()
          const evidenceArr = Array.isArray(result?.evidence) ? result.evidence : []
          const isMissingByLlm =
            /缺少.*(目标|交付物).*文件/.test(reasonText) ||
            /缺少[^\\n]{1,80}文件/.test(reasonText) ||
            /目标文件集合中未找到/.test(reasonText) ||
            /无法执行检查/.test(reasonText) ||
            /目标文件集合为空/.test(reasonText)
          if (isMissingByLlm) {
            pushFinding({
              id: genId(),
              project,
              stage,
              file: `${rule.stage || ''}（缺少文件）`,
              rule: rule.name,
              severity: rule.severity,
              reason: `缺少目标文件：${reasonText || rule.pattern}`,
              suggestion: String(result?.suggestion || rule.suggestion || '').trim(),
              isMissingFile: true,
              matchedFiles: checkedPaths,
              matchedFilesCount: checkedPaths.length,
              evidence: evidenceArr,
              evidenceCount: evidenceArr.length,
              llmRaw: String(llmJson?.raw || '').trim()
            })
            return
          }
          pushFinding({
            id: genId(),
            project,
            stage,
            file: checked.length ? `${checked.length} 个文件已检查` : '（无文件）',
            rule: rule.name,
            severity: rule.severity,
            reason: `大模型判定不符合：${reasonText || rule.pattern}${ev ? `\n${ev}` : ''}`,
            suggestion: String(result?.suggestion || rule.suggestion || '').trim(),
            matchedFiles: checkedPaths,
            matchedFilesCount: checkedPaths.length,
            evidence: evidenceArr,
            evidenceCount: evidenceArr.length,
            llmRaw: String(llmJson?.raw || '').trim()
          })
        }
      } catch (e) {
        const checkedPaths = checked.map((x) => String(x?.path || x?.name || '').trim()).filter(Boolean)
        pushFinding({
          id: genId(),
          project,
          stage,
          file: checked.length ? `${checked.length} 个文件已检查` : '（无文件）',
          rule: rule.name,
          severity: rule.severity,
          reason: `大模型调用失败：${String(e?.message || e)}`,
          suggestion: String(rule.suggestion || '').trim(),
          matchedFiles: checkedPaths,
          matchedFilesCount: checkedPaths.length,
          evidence: [],
          evidenceCount: 0
        })
      } finally {
        await markRuleDone(project)
      }
    }

    const BATCH = 10
    for (const project of projects) {
      const projFiles = filesByProject.get(project) || []
      const rs = getRulesForProject(project)
      doneMap[project] = 0
      doneRulesByProject.value = { ...doneMap }

      for (let i = 0; i < rs.length; i += BATCH) {
        const batch = rs.slice(i, i + BATCH)
        statusText.value = `扫描中：[${project}] ${i + 1}-${Math.min(i + BATCH, rs.length)} / ${rs.length}`
        await Promise.all(batch.map((rule) => runOneRule(project, projFiles, rule)))
        await nextTick()
      }
    }

    findings.value = all.slice()
    statusText.value = skipped ? `扫描完成（跳过 ${skipped} 个不支持/无法读取的文件）` : '扫描完成'
    scanning.value = false
  }

  function deleteFinding(id) {
    const key = String(id || '')
    if (!key) return
    findings.value = findings.value.filter((x) => String(x?.id || '') !== key)
  }

  function downloadExcel() {
    const rows = filteredFindings.value.map((x) => ({
      项目: x.project,
      阶段: x.stage,
      文件: x.file,
      规则: x.rule,
      严重性: severityLabel(x.severity),
      不符合项原因: x.reason,
      修改建议: x.suggestion
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'report')

    const name = `autoqa-report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.xlsx`
    XLSX.writeFile(wb, name)
  }

  const templateStageNames = ['业务需求阶段', '设计开发阶段', '测试阶段', '投产阶段', '运维阶段']

  function aoaSheet(rows, colWidths) {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    if (Array.isArray(colWidths) && colWidths.length) ws['!cols'] = colWidths.map((wch) => ({ wch }))
    return ws
  }

  function downloadRulesTemplate() {
    const wb = XLSX.utils.book_new()
    const header = ['规则名称', '检查要点', '检查对象（内容/文件名）', '严重性（高/中/低）', '后缀（可空，逗号分隔）']
    const widths = [20, 56, 20, 16, 26]
    for (const stage of templateStageNames) {
      const ws = aoaSheet([header], widths)
      XLSX.utils.book_append_sheet(wb, ws, stage)
    }
    XLSX.writeFile(wb, 'autoqa-rules-template.xlsx')
  }

  function downloadRulesExample() {
    const wb = XLSX.utils.book_new()
    const header = ['规则名称', '检查要点', '检查对象（内容/文件名）', '严重性（高/中/低）', '后缀（可空，逗号分隔）']
    const widths = [20, 56, 20, 16, 26]
    const exampleRowsByStage = {
      业务需求阶段: [
        ['需求跟踪矩阵齐全', '提供《需求跟踪矩阵》，覆盖需求到设计/测试的追踪关系', '内容', '高', '.xlsx']
      ],
      设计开发阶段: [['概要设计说明书齐全', '提供《概要设计说明书》并包含总体架构/关键设计说明', '文件名', '中', '.docx,.pdf']],
      测试阶段: [['测试报告是否齐全', '提供《测试报告》并包含主要结论、问题列表与回归结果', '内容', '高', '.docx,.pdf']],
      投产阶段: [['上线变更记录', '提供《上线/投产变更记录》并包含变更内容与审批信息', '文件名', '中', '.docx,.pdf,.xlsx']],
      运维阶段: [['运维手册', '提供《运维手册》并包含日常巡检/告警处理/应急流程', '内容', '中', '.docx,.pdf']]
    }
    for (const stage of templateStageNames) {
      const body = exampleRowsByStage?.[stage] || []
      const ws = aoaSheet([header, ...body], widths)
      XLSX.utils.book_append_sheet(wb, ws, stage)
    }
    XLSX.writeFile(wb, 'autoqa-rules-example.xlsx')
  }

  function downloadConfigTemplate() {
    const wb = XLSX.utils.book_new()
    const header = ['系统编号', '检查项1（填规则检查要点/检查项）', '检查项2', '检查项3']
    const widths = [16, 34, 22, 22]
    for (const stage of templateStageNames) {
      const ws = aoaSheet([header], widths)
      XLSX.utils.book_append_sheet(wb, ws, stage)
    }
    XLSX.writeFile(wb, 'autoqa-config-template.xlsx')
  }

  function downloadConfigExample() {
    const wb = XLSX.utils.book_new()
    const widths = [16, 26, 26, 26]
    const make = (header, rows) => aoaSheet([header, ...rows], widths)
    const projA = 'W0201C'
    const projB = 'PD0002'
    XLSX.utils.book_append_sheet(
      wb,
      make(['系统编号', '需求跟踪矩阵齐全', '需求规格说明书齐全', '评审意见表齐全'], [
        [projA, '√', '√', ''],
        [projB, '√', '', '√']
      ]),
      '业务需求阶段'
    )
    XLSX.utils.book_append_sheet(
      wb,
      make(['系统编号', '概要设计说明书齐全', '详细设计说明书齐全', '数据库设计说明书齐全'], [
        [projA, '√', '√', ''],
        [projB, '√', '', '√']
      ]),
      '设计开发阶段'
    )
    XLSX.utils.book_append_sheet(
      wb,
      make(['系统编号', '测试用例齐全', '测试报告是否齐全', '缺陷清单齐全'], [
        [projA, '√', '√', ''],
        [projB, '', '√', '√']
      ]),
      '测试阶段'
    )
    XLSX.utils.book_append_sheet(
      wb,
      make(['系统编号', '上线变更记录', '回退方案齐全', '发布检查清单齐全'], [
        [projA, '√', '√', ''],
        [projB, '√', '', '√']
      ]),
      '投产阶段'
    )
    XLSX.utils.book_append_sheet(
      wb,
      make(['系统编号', '运维手册', '应急预案齐全', '巡检记录齐全'], [
        [projA, '√', '', '√'],
        [projB, '√', '√', '']
      ]),
      '运维阶段'
    )
    XLSX.writeFile(wb, 'autoqa-config-example.xlsx')
  }

  function buildFileTreeData(paths) {
    const root = new Map()

    for (const p of paths) {
      const parts = String(p).split('/').filter(Boolean)
      if (!parts.length) continue
      let cur = root
      let full = ''
      for (let i = 0; i < parts.length; i += 1) {
        const part = parts[i]
        full = full ? `${full}/${part}` : part
        if (!cur.has(part)) cur.set(part, { full, children: new Map(), isFile: i === parts.length - 1 })
        const node = cur.get(part)
        node.isFile = node.isFile || i === parts.length - 1
        cur = node.children
      }
    }

    function toNodes(map) {
      return Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, node]) => ({
          title: node.isFile ? name : `${name}/`,
          key: node.full,
          children: node.isFile ? undefined : toNodes(node.children)
        }))
    }

    return toNodes(root)
  }

  function buildTopEntries(list, keyFn, limit = 10) {
    const map = new Map()
    for (const x of list) {
      const k = keyFn(x)
      if (!k) continue
      map.set(k, (map.get(k) || 0) + 1)
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
  }

  const currentProjectTreeData = computed(() => {
    const files = allEligibleFiles.value
    const paths = files
      .map((f) => `${projectNameOfFile(f)}/${withinProjectPathOfFile(f)}`.replace(/\/$/, ''))
      .filter(Boolean)
    return buildFileTreeData(paths)
  })

  const suggestedProjectTreeData = [
    {
      title: '<project>/',
      key: 'suggest-root',
      children: [
        {
          title: '00_立项/',
          key: 'suggest-00',
          children: [
            { title: '项目章程-YYYYMMDD-v1.0.docx', key: 'suggest-00-charter' },
            { title: '立项评审纪要-YYYYMMDD.docx', key: 'suggest-00-kickoff-minutes' }
          ]
        },
        {
          title: '01_计划/',
          key: 'suggest-01',
          children: [
            { title: '项目计划-YYYYMMDD-v1.0.xlsx', key: 'suggest-01-plan' },
            { title: '里程碑计划-YYYYMMDD.xlsx', key: 'suggest-01-milestone' },
            { title: '风险清单-YYYYMMDD.xlsx', key: 'suggest-01-risk' }
          ]
        },
        {
          title: '02_需求/',
          key: 'suggest-02',
          children: [
            { title: '需求规格说明书(PRD)-YYYYMMDD-v1.0.docx', key: 'suggest-02-prd' },
            { title: '需求变更记录-YYYYMMDD.xlsx', key: 'suggest-02-change' }
          ]
        },
        {
          title: '03_设计/',
          key: 'suggest-03',
          children: [
            { title: '概要设计-YYYYMMDD-v1.0.docx', key: 'suggest-03-hld' },
            { title: '详细设计-YYYYMMDD-v1.0.docx', key: 'suggest-03-lld' },
            { title: '接口清单(API)-YYYYMMDD.xlsx', key: 'suggest-03-api' }
          ]
        },
        {
          title: '04_开发/',
          key: 'suggest-04',
          children: [
            { title: '开发规范-YYYYMMDD.md', key: 'suggest-04-dev-std' },
            { title: '代码评审记录-YYYYMMDD.xlsx', key: 'suggest-04-cr' }
          ]
        },
        {
          title: '05_测试/',
          key: 'suggest-05',
          children: [
            { title: '测试计划-YYYYMMDD-v1.0.docx', key: 'suggest-05-test-plan' },
            { title: '测试用例-YYYYMMDD.xlsx', key: 'suggest-05-testcase' },
            { title: '缺陷统计-YYYYMMDD.xlsx', key: 'suggest-05-bug' },
            { title: '测试报告-YYYYMMDD-v1.0.docx', key: 'suggest-05-test-report' }
          ]
        },
        {
          title: '06_质量/',
          key: 'suggest-06',
          children: [
            { title: '质量计划-YYYYMMDD-v1.0.docx', key: 'suggest-06-quality-plan' },
            { title: '质量检查清单-YYYYMMDD.xlsx', key: 'suggest-06-quality-checklist' },
            { title: '问题整改闭环-YYYYMMDD.xlsx', key: 'suggest-06-closure' }
          ]
        },
        {
          title: '07_交付/',
          key: 'suggest-07',
          children: [
            { title: '发布说明(ReleaseNotes)-YYYYMMDD.md', key: 'suggest-07-release' },
            { title: '验收材料-YYYYMMDD.zip', key: 'suggest-07-accept' },
            { title: '交付清单-YYYYMMDD.xlsx', key: 'suggest-07-deliverable' }
          ]
        },
        {
          title: '08_会议纪要/',
          key: 'suggest-08',
          children: [
            { title: '周会纪要-YYYYMMDD.docx', key: 'suggest-08-weekly' },
            { title: '评审纪要-YYYYMMDD.docx', key: 'suggest-08-review' }
          ]
        },
        {
          title: '99_归档/',
          key: 'suggest-99',
          children: [{ title: '归档说明-YYYYMMDD.docx', key: 'suggest-99-archive' }]
        }
      ]
    }
  ]

  const fileNamingSuggestions = [
    {
      key: 's-plan',
      stage: '01_计划',
      category: '项目计划',
      name: '项目计划-YYYYMMDD-v1.0.xlsx',
      keywords: '计划|plan|schedule|里程碑|WBS'
    },
    {
      key: 's-quality',
      stage: '06_质量',
      category: '项目质量',
      name: '质量计划-YYYYMMDD-v1.0.docx / 质量检查清单-YYYYMMDD.xlsx',
      keywords: '质量|quality|QA|检查|审计|整改'
    },
    {
      key: 's-prd',
      stage: '02_需求',
      category: '需求文档',
      name: '需求规格说明书(PRD)-YYYYMMDD-v1.0.docx',
      keywords: '需求|PRD|SRS|规格|范围'
    },
    {
      key: 's-risk',
      stage: '01_计划',
      category: '风险管理',
      name: '风险清单-YYYYMMDD.xlsx',
      keywords: '风险|risk|问题|阻塞'
    },
    {
      key: 's-change',
      stage: '02_需求',
      category: '变更控制',
      name: '需求变更记录-YYYYMMDD.xlsx',
      keywords: '变更|change|CR|影响分析'
    },
    {
      key: 's-design',
      stage: '03_设计',
      category: '设计文档',
      name: '概要设计/详细设计-YYYYMMDD-v1.0.docx',
      keywords: '设计|HLD|LLD|架构|接口|API'
    },
    {
      key: 's-test',
      stage: '05_测试',
      category: '测试资料',
      name: '测试计划/测试用例/测试报告-YYYYMMDD.(docx/xlsx)',
      keywords: '测试|test|case|用例|报告|回归'
    },
    {
      key: 's-bug',
      stage: '05_测试',
      category: '缺陷管理',
      name: '缺陷统计-YYYYMMDD.xlsx',
      keywords: '缺陷|bug|defect|issue|阻塞'
    },
    {
      key: 's-meeting',
      stage: '08_会议纪要',
      category: '会议纪要',
      name: '周会纪要/评审纪要-YYYYMMDD.docx',
      keywords: '纪要|minutes|会议|周会|评审'
    },
    {
      key: 's-release',
      stage: '07_交付',
      category: '交付发布',
      name: '发布说明(ReleaseNotes)-YYYYMMDD.md / 交付清单-YYYYMMDD.xlsx',
      keywords: '发布|release|交付|验收|上线'
    }
  ]

  const fileNamingColumns = [
    { title: '阶段', dataIndex: 'stage', key: 'stage', width: 110 },
    { title: '类别', dataIndex: 'category', key: 'category', width: 110 },
    { title: '命名建议', dataIndex: 'name', key: 'name' },
    { title: '关键词（用于识别）', dataIndex: 'keywords', key: 'keywords', width: 220 }
  ]

  const scanProgressColumns = [
    { title: '项目', dataIndex: 'project', key: 'project' },
    { title: '规则数', dataIndex: 'totalRules', key: 'totalRules', width: 90 },
    { title: '文件数', dataIndex: 'totalFiles', key: 'totalFiles', width: 90 },
    { title: '已检查', key: 'doneChecks' },
    { title: '进度', key: 'progress', width: 220 },
    { title: '不符合项', dataIndex: 'hits', key: 'hits', width: 110 }
  ]

  const findingsColumns = [
    { title: '项目', dataIndex: 'project', key: 'project', width: 140 },
    { title: '阶段', dataIndex: 'stage', key: 'stage', width: 140 },
    { title: '规则', dataIndex: 'rule', key: 'rule' },
    {
      title: '严重性',
      dataIndex: 'severity',
      key: 'severity',
      customRender: ({ text }) => ({
        children: text,
        props: {}
      })
    },
    { title: '不符合项原因', dataIndex: 'reason', key: 'reason' },
    { title: '修改建议', dataIndex: 'suggestion', key: 'suggestion' },
    { title: '操作', key: 'action', width: 130 }
  ]

  loadPersistedRules({ silent: true })
    .catch(() => {})
    .finally(() => {
      rulesHydrating.value = false
    })

  return {
    ALL_PROJECTS,
    ALL_STAGES,
    folderFileList,
    skippedFiles,
    rulesFileList,
    configFileList,
    rules,
    findings,
    scanning,
    progress,
    statusText,
    drawerOpen,
    importingRules,
    rulesImportPercent,
    rulesImportText,
    rulesImportIssues,
    rulesHydrating,
    importingConfig,
    configImportPercent,
    configImportText,
    configImportIssues,
    projectRuleStages,
    severityOptions,
    selectedSeverity,
    showMissingFiles,
    resultProjectTab,
    resultStageTab,
    rulesMenuLabel,
    projectMenuLabel,
    configMenuLabel,
    setSeverityChecked,
    scanFiles,
    folderSummaryText,
    filteredFindings,
    scanStatsByProject,
    resultProjectTabs,
    resultStageTabs,
    onFolderChange,
    onRulesChange,
    onConfigChange,
    loadPersistedRules,
    clearRules,
    beforeUploadStop,
    normalizeSeverity,
    parseExtensions,
    buildRulePrompt,
    pick,
    genId,
    projectNameOfFile,
    withinProjectPathOfFile,
    getRulesForProject,
    canStart,
    startScan,
    downloadExcel,
    downloadRulesTemplate,
    downloadRulesExample,
    downloadConfigTemplate,
    downloadConfigExample,
    buildTopEntries,
    severityLabel,
    severityColor,
    scopeLabel,
    currentProjectTreeData,
    suggestedProjectTreeData,
    fileNamingSuggestions,
    fileNamingColumns,
    scanProgressColumns,
    findingsColumns,
    stageNameOfFile,
    doneRulesByProject,
    deleteFinding
  }
}

export function useAutoQaStore() {
  const store = inject(AUTOQA_STORE_KEY)
  if (!store) throw new Error('autoqa store 未初始化')
  return store
}
