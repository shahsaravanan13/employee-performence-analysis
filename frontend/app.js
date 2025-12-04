const fileInput = document.getElementById('fileInput')
const uploadBtn = document.getElementById('uploadBtn')
const uploadStatus = document.getElementById('uploadStatus')
const metricSelect = document.getElementById('metricSelect')
const groupSelect = document.getElementById('groupSelect')
const boxplotBtn = document.getElementById('boxplotBtn')
const corrBtn = document.getElementById('corrBtn')
const clearBtn = document.getElementById('clearBtn')
const summaryDiv = document.getElementById('summary')
const previewDiv = document.getElementById('preview')
const groupCap = document.getElementById('groupCap')

async function loadMeta() {
  let data = { numeric_columns: [], group_columns: [], row_count: null }
  try {
    const res = await fetch('/api/meta')
    data = await res.json()
  } catch (e) {
    uploadStatus.textContent = 'Backend not connected. Configure BACKEND_URL on Netlify.'
  }
  metricSelect.innerHTML = ''
  groupSelect.innerHTML = ''
  for (const c of data.numeric_columns) {
    const o = document.createElement('option')
    o.value = c
    o.textContent = c
    metricSelect.appendChild(o)
  }
  for (const c of data.group_columns) {
    const o = document.createElement('option')
    o.value = c
    o.textContent = c
    groupSelect.appendChild(o)
  }
  if (typeof data.row_count === 'number') {
    summaryDiv.innerHTML = `Rows: ${data.row_count}, Numeric columns: ${data.numeric_columns.length}, Group columns: ${data.group_columns.length}`
  }
  boxplotBtn.disabled = !(metricSelect.options.length && groupSelect.options.length)
  corrBtn.disabled = !metricSelect.options.length
}

async function loadPreview() {
  const res = await fetch('/api/preview')
  const data = await res.json()
  if (!data.columns || data.columns.length === 0) {
    previewDiv.innerHTML = ''
    return
  }
  const headers = data.columns
  const rows = data.rows
  let html = '<div style="overflow:auto"><table style="border-collapse:collapse;width:100%">'
  html += '<thead><tr>' + headers.map(h=>`<th style="text-align:left;border-bottom:1px solid #ddd;padding:4px">${h}</th>`).join('') + '</tr></thead>'
  html += '<tbody>' + rows.map(r=>'<tr>' + headers.map(h=>`<td style="border-bottom:1px solid #eee;padding:4px">${r[h] ?? ''}</td>`).join('') + '</tr>').join('') + '</tbody>'
  html += '</table></div>'
  previewDiv.innerHTML = html
}

uploadBtn.addEventListener('click', async () => {
  if (!fileInput.files.length) {
    uploadStatus.textContent = 'Select a CSV file'
    return
  }
  const form = new FormData()
  form.append('file', fileInput.files[0])
  uploadBtn.disabled = true
  uploadStatus.textContent = 'Uploading...'
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: form })
    let data = null
    try { data = await res.json() } catch {}
    if (res.ok) {
      uploadStatus.textContent = `Uploaded. Total records: ${data?.total_records ?? 'n/a'}`
      await loadMeta()
      await loadPreview()
    } else {
      uploadStatus.textContent = `Error: ${data?.error || res.statusText || 'upload failed'}`
    }
  } catch (err) {
    uploadStatus.textContent = `Network error: ${err?.message || err}`
  } finally {
    uploadBtn.disabled = false
  }
})

clearBtn.addEventListener('click', async () => {
  clearBtn.disabled = true
  uploadStatus.textContent = 'Clearing data...'
  try {
    const res = await fetch('/api/reset', { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      uploadStatus.textContent = `Cleared. Total records: ${data.total_records}`
      await loadMeta()
      previewDiv.innerHTML = ''
    } else {
      uploadStatus.textContent = `Error: ${data.error || 'reset failed'}`
    }
  } catch (err) {
    uploadStatus.textContent = `Network error: ${err?.message || err}`
  } finally {
    clearBtn.disabled = false
  }
})

boxplotBtn.addEventListener('click', async () => {
  const metric = metricSelect.value
  const group = groupSelect.value
  const cap = Math.max(1, Math.min(50, parseInt(groupCap.value || '12')))
  const res = await fetch(`/api/boxplot?metric=${encodeURIComponent(metric)}&group_by=${encodeURIComponent(group)}&max_groups=${cap}`)
  const data = await res.json()
  if (!res.ok) return
  const traces = []
  for (let i = 0; i < data.groups.length; i++) {
    traces.push({
      y: data.values[i],
      type: 'box',
      name: data.groups[i]
    })
  }
  const layout = { title: `${metric} by ${group}`, boxmode: 'group' }
  const config = { responsive: true, displayModeBar: true }
  Plotly.newPlot('boxplot', traces, layout, config)
  try {
    const all = data.values.flat().map(v=>Number(v)).filter(v=>!Number.isNaN(v))
    if (all.length) {
      const min = Math.min(...all)
      const max = Math.max(...all)
      const mean = all.reduce((a,b)=>a+b,0)/all.length
      uploadStatus.textContent = `Boxplot generated. Min: ${min.toFixed(2)}, Mean: ${mean.toFixed(2)}, Max: ${max.toFixed(2)}`
    }
  } catch {}
})

corrBtn.addEventListener('click', async () => {
  const res = await fetch('/api/correlation')
  const data = await res.json()
  if (!res.ok) return
  if (!data.labels || !data.labels.length) {
    uploadStatus.textContent = 'No data. Upload a CSV first.'
    return
  }
  const z = data.matrix
  const x = data.labels
  const y = data.labels
  const trace = { z, x, y, type: 'heatmap', colorscale: 'RdBu', zmin: -1, zmax: 1 }
  const layout = { title: 'Correlation Matrix' }
  const config = { responsive: true, displayModeBar: true }
  Plotly.newPlot('corr', [trace], layout, config)
})

window.addEventListener('resize', () => {
  try { Plotly.Plots.resize('boxplot') } catch {}
  try { Plotly.Plots.resize('corr') } catch {}
})

loadMeta()
