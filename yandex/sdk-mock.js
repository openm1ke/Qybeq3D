/*
 * A local stand-in for the Yandex Games `/sdk.js`, served only by
 * `npm run dev:yandex` and `npm run preview:yandex` (never packaged: on
 * Yandex Games the real SDK answers at /sdk.js). It implements just what
 * Qybeq calls and records every call in `window.__yaMock.log`.
 *
 * Query parameters:
 *   ya_lang=ru|en|tr…               the language the SDK reports (default ru)
 *   ya_ad=reward|dismiss|error|none how a rewarded video ends (default reward)
 *   ya_ad_ms=600                    how long the fake video stays on screen
 *   ya_no_ads=1                     no advertising module at all
 *
 * `window.__yaMock.emit('game_api_pause' | 'game_api_resume')` fires a
 * platform pause as the real SDK does for its own dialogs.
 */
(function () {
  var params = new URLSearchParams(location.search)
  var log = []
  var listeners = {}
  var record = function (entry) {
    log.push(entry)
  }
  var emit = function (event) {
    ;(listeners[event] || []).forEach(function (listener) { listener() })
  }

  var ysdk = {
    environment: { i18n: { lang: params.get('ya_lang') || 'ru', tld: 'ru' } },
    features: {
      LoadingAPI: { ready: function () { record('LoadingAPI.ready') } },
      GameplayAPI: {
        start: function () { record('GameplayAPI.start') },
        stop: function () { record('GameplayAPI.stop') },
      },
    },
    on: function (event, listener) {
      ;(listeners[event] = listeners[event] || []).push(listener)
    },
    off: function (event, listener) {
      listeners[event] = (listeners[event] || []).filter(function (item) { return item !== listener })
    },
    getStorage: function () {
      return Promise.resolve(window.localStorage)
    },
  }

  if (params.get('ya_no_ads') !== '1') {
    ysdk.adv = {
      showRewardedVideo: function (options) {
        var callbacks = (options && options.callbacks) || {}
        var mode = params.get('ya_ad') || 'reward'
        var duration = Number(params.get('ya_ad_ms') || 600)
        record('adv.showRewardedVideo')
        if (mode === 'none') {
          setTimeout(function () { callbacks.onClose && callbacks.onClose(false) }, 50)
          return
        }
        if (mode === 'error') {
          setTimeout(function () { callbacks.onError && callbacks.onError(new Error('mock ad error')) }, 50)
          return
        }
        var cover = document.createElement('div')
        cover.setAttribute('data-ya-mock-ad', '')
        cover.textContent = 'Rewarded video (mock)'
        cover.style.cssText = 'position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:#000;color:#fff;font:600 18px system-ui'
        // Like the real SDK: the platform pauses the game around the video
        // and sends game_api_resume a moment after onClose.
        setTimeout(function () {
          document.body.appendChild(cover)
          emit('game_api_pause')
          callbacks.onOpen && callbacks.onOpen()
          setTimeout(function () {
            if (mode === 'reward') {
              record('adv.rewarded')
              callbacks.onRewarded && callbacks.onRewarded()
            }
            cover.remove()
            callbacks.onClose && callbacks.onClose(true)
            setTimeout(function () { emit('game_api_resume') }, 0)
          }, duration)
        }, 50)
      },
    }
  }

  window.__yaMock = {
    log: log,
    emit: function (event) {
      record('emit ' + event)
      emit(event)
    },
  }
  window.YaGames = {
    init: function () {
      record('YaGames.init')
      return Promise.resolve(ysdk)
    },
  }
})()
