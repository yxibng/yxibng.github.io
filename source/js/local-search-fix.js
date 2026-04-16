/*
 * Butterfly local search patch:
 * expand query keywords for hyphen/underscore/space separated terms.
 * Example: "clang" can match "clang-format" reliably.
 */
(function () {
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
    return true
  }

  if (!patchLocalSearch()) {
    window.addEventListener('load', patchLocalSearch, { once: true })
  }
})()
