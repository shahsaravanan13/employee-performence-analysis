const https = require('https')
const http = require('http')
const { URL } = require('url')

exports.handler = async function(event) {
  try {
    const backend = process.env.BACKEND_URL
    if (!backend) {
      return { statusCode: 500, body: 'BACKEND_URL not set' }
    }
    const base = new URL(backend)
    const path = (event.path || '').replace('/.netlify/functions/api', '/api')
    const qs = new URLSearchParams(event.queryStringParameters || {}).toString()
    const target = new URL(`${path}${qs ? '?' + qs : ''}`, base)

    const reqHeaders = {}
    for (const [k, v] of Object.entries(event.headers || {})) {
      const lk = (k || '').toLowerCase()
      if (lk === 'host' || lk === 'content-length') continue
      reqHeaders[k] = v
    }

    const isHttps = target.protocol === 'https:'
    const client = isHttps ? https : http

    const res = await new Promise((resolve, reject) => {
      const req = client.request(target, {
        method: event.httpMethod || 'GET',
        headers: reqHeaders,
      }, r => {
        let data = ''
        r.on('data', chunk => data += chunk)
        r.on('end', () => resolve({
          statusCode: r.statusCode || 502,
          headers: { 'content-type': r.headers['content-type'] || 'application/json' },
          body: data,
        }))
      })
      req.on('error', reject)
      if (event.body) {
        const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body
        req.write(body)
      }
      req.end()
    })

    return res
  } catch (e) {
    return { statusCode: 502, body: `proxy error: ${e.message}` }
  }
}
