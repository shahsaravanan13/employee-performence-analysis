exports.handler = async function(event) {
  try {
    const backend = process.env.BACKEND_URL
    if (!backend) {
      return { statusCode: 500, body: 'BACKEND_URL not set' }
    }
    const path = (event.path || '').replace('/.netlify/functions/api', '/api')
    const qs = new URLSearchParams(event.queryStringParameters || {}).toString()
    const url = `${backend}${path}${qs ? '?' + qs : ''}`

    const reqHeaders = {}
    for (const [k, v] of Object.entries(event.headers || {})) {
      if (k.toLowerCase() !== 'host') reqHeaders[k] = v
    }

    const res = await fetch(url, {
      method: event.httpMethod || 'GET',
      headers: reqHeaders,
      body: event.body,
    })

    const text = await res.text()
    return {
      statusCode: res.status,
      headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
      body: text,
    }
  } catch (e) {
    return { statusCode: 500, body: `proxy error: ${e.message}` }
  }
}
