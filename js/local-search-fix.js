/*
 * Butterfly local search patch:
 * expand query keywords for hyphen/underscore/space separated terms.
 * Example: "clang" can match "clang-format" reliably.
 */
(function () {
  var retryTimer = null

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

  if (typeof document !== 'undefined') {
    document.addEventListener('pjax:complete', ensurePatchedWithRetry)
  }
})()
