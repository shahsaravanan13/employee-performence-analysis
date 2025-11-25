const fileInput = document.getElementById('fileInput')
const uploadBtn = document.getElementById('uploadBtn')
const uploadStatus = document.getElementById('uploadStatus')
const metricSelect = document.getElementById('metricSelect')
const groupSelect = document.getElementById('groupSelect')
const boxplotBtn = document.getElementById('boxplotBtn')
const corrBtn = document.getElementById('corrBtn')
const clearBtn = document.getElementById('clearBtn')

async function loadMeta() {
  const res = await fetch('/api/meta')
  const data = await res.json()
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
  const res = await fetch(`/api/boxplot?metric=${encodeURIComponent(metric)}&group_by=${encodeURIComponent(group)}`)
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
