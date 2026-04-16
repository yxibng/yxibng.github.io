/*
 * Butterfly local search patch:
 * expand query keywords for hyphen/underscore/space separated terms.
 * Example: "clang" can match "clang-format" reliably.
 */
(function () {
  var retryTimer = null

  function unique(items) {
    return Array.from(new Set(items.filter(Boolean)))
  }

  function fixLocalSearchPath() {
    if (typeof GLOBAL_CONFIG === 'undefined' || !GLOBAL_CONFIG.localSearch) return

    var cfg = GLOBAL_CONFIG.localSearch
    var path = (cfg.path || '').toString()
    var root = (GLOBAL_CONFIG.root || '/').toString()

    if (!path || path.indexOf('/') !== 0) return

    if (root[root.length - 1] !== '/') root += '/'
    if (root === '/') return

    cfg.path = root + path.replace(/^\/+/, '')
  }

  function buildSearchPathCandidates(path) {
    var cfgRoot = typeof GLOBAL_CONFIG !== 'undefined' ? (GLOBAL_CONFIG.root || '/') : '/'
    var normalizedRoot = cfgRoot.endsWith('/') ? cfgRoot : cfgRoot + '/'
    var normalizedPath = (path || '/search.xml').toString()
    var trimmedPath = normalizedPath.replace(/^\/+/, '')

    return unique([
      normalizedPath,
      normalizedPath.charAt(0) === '/' ? normalizedPath : '/' + normalizedPath,
      normalizedRoot + trimmedPath,
      '/' + trimmedPath,
      'search.xml',
      '/search.xml'
    ])
  }

  function parseSearchResponse(body, isXml) {
    if (!body) return []

    if (!isXml) {
      var jsonData = JSON.parse(body)
      return Array.isArray(jsonData) ? jsonData : []
    }

    var xmlDoc = new DOMParser().parseFromString(body, 'text/xml')
    if (xmlDoc.querySelector('parsererror')) return []

    return Array.from(xmlDoc.querySelectorAll('entry')).map(function (element) {
      var titleNode = element.querySelector('title')
      var contentNode = element.querySelector('content')
      var urlNode = element.querySelector('url')

      return {
        title: titleNode ? titleNode.textContent : '',
        content: contentNode ? contentNode.textContent : '',
        url: urlNode ? urlNode.textContent : ''
      }
    })
  }

  function normalizeSearchData(datas) {
    return datas.filter(function (data) {
      return data && data.title
    }).map(function (data) {
      data.title = data.title.trim()
      data.content = data.content ? data.content.trim().replace(/<[^>]+>/g, '') : ''
      data.url = decodeURIComponent(data.url || '').replace(/\/{2,}/g, '/')
      return data
    })
  }

  function triggerSearchInput() {
    var input = document.querySelector('.local-search-input input')
    if (!input || !input.value || !input.value.trim()) return
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function patchFetchData() {
    if (typeof LocalSearch === 'undefined' || !LocalSearch.prototype) return false
    if (LocalSearch.prototype.__yxPatchedFetchData) return true

    LocalSearch.prototype.fetchData = function () {
      var self = this
      var isXml = !self.path.endsWith('json')
      var candidates = buildSearchPathCandidates(self.path)
      var index = 0

      function finalize(datas, path) {
        self.isfetched = true
        self.datas = normalizeSearchData(datas)
        if (path) self.path = path
        window.dispatchEvent(new Event('search:loaded'))
        setTimeout(triggerSearchInput, 0)
      }

      function tryNext() {
        if (index >= candidates.length) {
          finalize([], self.path)
          return
        }

        var candidate = candidates[index++]
        fetch(candidate, { credentials: 'same-origin' })
          .then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status)
            return response.text()
          })
          .then(function (body) {
            var datas = parseSearchResponse(body, isXml)
            if (!datas.length) throw new Error('Empty search index')
            finalize(datas, candidate)
          })
          .catch(function () {
            tryNext()
          })
      }

      tryNext()
    }

    LocalSearch.prototype.__yxPatchedFetchData = true
    return true
  }

  function normalizeKeywords(keywords) {
    if (!Array.isArray(keywords)) return []

    var expanded = []

    for (var i = 0; i < keywords.length; i++) {
      var raw = (keywords[i] || '').toString().toLowerCase().trim()
      if (!raw) continue

      // Keep original phrase matching.
      expanded.push(raw)

      // Add token matching for better recall.
      var tokens = raw.split(/[\s_-]+/)
      for (var j = 0; j < tokens.length; j++) {
        if (tokens[j]) expanded.push(tokens[j])
      }
    }

    // De-duplicate while preserving order.
    return Array.from(new Set(expanded))
  }

  function patchLocalSearch() {
    if (typeof LocalSearch === 'undefined' || !LocalSearch.prototype) return false
    if (LocalSearch.prototype.__yxPatchedGetResultItems) return true

    var original = LocalSearch.prototype.getResultItems
    if (typeof original !== 'function') return false

    LocalSearch.prototype.getResultItems = function (keywords) {
      return original.call(this, normalizeKeywords(keywords))
    }

    LocalSearch.prototype.__yxPatchedGetResultItems = true

    patchFetchData()

    if (retryTimer) {
      clearInterval(retryTimer)
      retryTimer = null
    }

    return true
  }

  function ensurePatchedWithRetry() {
    fixLocalSearchPath()

    if (patchLocalSearch()) return

    if (retryTimer) clearInterval(retryTimer)

    var retryCount = 0
    retryTimer = setInterval(function () {
      retryCount += 1
      if (patchLocalSearch() || retryCount >= 40) {
        clearInterval(retryTimer)
        retryTimer = null
      }
    }, 250)
  }

  ensurePatchedWithRetry()
  window.addEventListener('load', ensurePatchedWithRetry)
  window.addEventListener('search:loaded', triggerSearchInput)

  if (typeof document !== 'undefined') {
    document.addEventListener('pjax:complete', ensurePatchedWithRetry)
  }
})()
