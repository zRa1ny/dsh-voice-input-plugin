/**
 * dsh-voice-input-plugin — browser half.
 *
 * This file IS the published artifact: a closure-factory bundle in the web
 * client's module protocol. Executing it only registers a factory
 * (`window.__ModuleLoader__.load`); every side effect — the stylesheet
 * injection included — lives inside the factory closure and runs at
 * materialization (first import/require of the id, memoized by the loader).
 * The shell loads it with a classic <script> from
 * `/plugins/dsh-voice-input-plugin/client.js?rev=<hash>` and mounts the returned
 * exports as a Cordis plugin.
 *
 * Feature: one button at the right end of the composer tool row (the additive
 * `conversation.input.right` seat, left of the send button). Click starts a
 * continuous browser speech recognition whose results are written straight into
 * that session's draft through the standard `inputActions.setDraft`; click again
 * stops it. The send button and its submit path are untouched.
 */
window.__ModuleLoader__.load({
  id: 'dsh-voice-input-plugin',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports

    /** Package name: the registration key, the style-tag owner, and the bundle's own id. */
    var PLUGIN_ID = 'dsh-voice-input-plugin'

    var React = require('react')

    var CSS = [
      '.dshv-mic {',
      '  position: relative;',
      '  display: grid;',
      '  place-items: center;',
      '  flex: none;',
      '  width: 28px;',
      '  height: 28px;',
      '  padding: 0;',
      '  border: none;',
      '  border-radius: 999px;',
      '  background: var(--dsw-specific-selector);',
      '  color: var(--dsw-alias-label-primary);',
      '  cursor: pointer;',
      '  transition: background-color 100ms ease, color 100ms ease;',
      '}',
      '.dshv-mic:hover:not(:disabled) {',
      '  background: var(--dsw-alias-interactive-bg-hover-solid);',
      '}',
      '.dshv-mic:disabled {',
      '  opacity: 0.4;',
      '  cursor: default;',
      '}',
      ".dshv-mic[data-phase='recording'] {",
      '  background: var(--dsw-alias-state-error-primary);',
      '  color: #fff;',
      '}',
      ".dshv-mic[data-phase='recording']::after {",
      "  content: '';",
      '  position: absolute;',
      '  inset: -3px;',
      '  border-radius: 999px;',
      '  border: 2px solid var(--dsw-alias-state-error-primary);',
      '  pointer-events: none;',
      '  animation: dshv-mic-pulse 1.5s ease-out infinite;',
      '}',
      ".dshv-mic[data-phase='error'] {",
      '  color: var(--dsw-alias-state-error-primary);',
      '}',
      '@keyframes dshv-mic-pulse {',
      '  0% { opacity: 0.75; transform: scale(0.86); }',
      '  100% { opacity: 0; transform: scale(1.45); }',
      '}',
    ].join('\n')

    // One <style data-plugin> tag per stylesheet, injected at factory execution
    // and tagged with the owner id so the loader's claimStyles()/HMR bookkeeping
    // can find and remove it on unload. The idempotence guard keeps a re-executed
    // factory (HMR reload without teardown) from stacking duplicate tags.
    var STYLE_TAG_ID = PLUGIN_ID + '/voice-input.css'
    if (typeof document !== 'undefined'
      && document.querySelector('style[data-plugin-css="' + STYLE_TAG_ID + '"]') === null) {
      var styleTag = document.createElement('style')
      styleTag.dataset.plugin = PLUGIN_ID
      styleTag.dataset.pluginCss = STYLE_TAG_ID
      styleTag.textContent = CSS
      document.head.appendChild(styleTag)
    }

    /** Recognition failures a user can act on, keyed by SpeechRecognitionErrorEvent.error. */
    var ERROR_TEXT = {
      'not-allowed': '麦克风权限被拒绝：请在浏览器地址栏允许本站使用麦克风后重试。',
      'service-not-allowed': '浏览器拒绝了语音识别服务，请改用 Chrome 或 Edge 打开本页面。',
      'audio-capture': '没有检测到可用的麦克风设备。',
      network: '语音识别服务网络不可用，请检查网络后重试。',
      'language-not-supported': '当前浏览器不支持该语言的语音识别。',
    }

    var MIC_ICON = React.createElement(
      'svg',
      { viewBox: '0 0 16 16', width: 16, height: 16, fill: 'none', 'aria-hidden': true },
      React.createElement('path', {
        d: 'M8 1.7a2.3 2.3 0 0 0-2.3 2.3v3.6a2.3 2.3 0 0 0 4.6 0V4A2.3 2.3 0 0 0 8 1.7Z',
        stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round',
      }),
      React.createElement('path', {
        d: 'M3.6 7.3v.5a4.4 4.4 0 0 0 8.8 0v-.5',
        stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round',
      }),
      React.createElement('path', {
        d: 'M8 12.2v2.1',
        stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round',
      }),
    )

    var STOP_ICON = React.createElement(
      'svg',
      { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', 'aria-hidden': true },
      React.createElement('rect', { x: 3.5, y: 3.5, width: 9, height: 9, rx: 2.5, fill: 'currentColor' }),
    )

    /**
     * The speech recognition constructor this browser exposes.
     * @returns the constructor, or undefined where the browser has none (Firefox, Safari).
     */
    function recognitionCtor() {
      return window.SpeechRecognition || window.webkitSpeechRecognition
    }

    /**
     * Recognition language: the browser's UI language, defaulting to zh-CN when it is absent.
     * @returns a BCP-47 tag for SpeechRecognition.lang.
     */
    function recognitionLanguage() {
      var language = window.navigator === undefined ? '' : window.navigator.language
      return typeof language === 'string' && language !== '' ? language : 'zh-CN'
    }

    /**
     * Join the draft that existed when recording started with the transcript.
     * @param base - the draft at recording start.
     * @param transcript - finalized plus in-flight recognized text.
     * @returns the next full draft (ASCII words keep a separating space).
     */
    function joinDraft(base, transcript) {
      if (transcript === '') return base
      if (base === '') return transcript
      return /[0-9A-Za-z]$/.test(base) ? base + ' ' + transcript : base + transcript
    }

    /**
     * Composer mic button: one click records, the next click stops.
     * @param props - the session kit's `useInput` hook and `inputActions` face.
     * @returns the button element.
     */
    function VoiceInputButton(props) {
      var draft = props.useInput(function (state) { return state.draft })
      var actions = props.inputActions
      var active = React.useRef(null)
      var phaseState = React.useState('idle')
      var phase = phaseState[0]
      var setPhase = phaseState[1]
      var noticeState = React.useState('')
      var notice = noticeState[0]
      var setNotice = noticeState[1]
      var Recognition = recognitionCtor()

      /** Publish base + finalized + in-flight text as the whole draft. */
      var writeDraft = function (session) {
        if (actions === undefined) return
        actions.setDraft(joinDraft(session.base, session.finalText + session.interim))
      }

      /** Close a recognition session for good: no restart, and the mic is released. */
      var release = function (session) {
        session.stopping = true
        active.current = null
        try {
          session.rec.abort()
        } catch (error) {
          // The recognition already ended on its own; nothing is left to release.
          console.log('voice-input: recognition was already closed')
        }
      }

      var stop = function () {
        var session = active.current
        if (session === null) return
        session.stopping = true
        active.current = null
        try {
          session.rec.stop()
        } catch (error) {
          console.log('voice-input: stop on an idle recognition')
        }
        setPhase('idle')
        setNotice('')
      }

      var start = function () {
        var session = {
          rec: null,
          base: typeof draft === 'string' ? draft : '',
          finalText: '',
          interim: '',
          finalized: {},
          stopping: false,
        }
        var rec
        try {
          rec = new Recognition()
        } catch (error) {
          setPhase('error')
          setNotice('无法启动语音识别：' + String(error && error.message ? error.message : error))
          return
        }
        session.rec = rec
        rec.lang = recognitionLanguage()
        rec.continuous = true
        rec.interimResults = true
        rec.maxAlternatives = 1

        rec.onresult = function (event) {
          var results = event.results
          var interim = ''
          for (var i = event.resultIndex; i < results.length; i += 1) {
            var result = results[i]
            var alternative = result[0]
            var transcript = alternative === undefined ? '' : String(alternative.transcript)
            if (result.isFinal) {
              // A result index is finalized once: later events repeat it, and
              // re-appending would duplicate the sentence.
              if (session.finalized[i] !== true) {
                session.finalized[i] = true
                session.finalText += transcript
              }
            } else {
              interim += transcript
            }
          }
          session.interim = interim
          writeDraft(session)
        }

        rec.onerror = function (event) {
          var code = typeof event.error === 'string' ? event.error : 'unknown'
          // Silence and a user-issued stop are ordinary, not failures.
          if (code === 'no-speech' || code === 'aborted') return
          console.error('voice-input: recognition error', code)
          release(session)
          setPhase('error')
          setNotice(ERROR_TEXT[code] === undefined ? '语音识别失败：' + code : ERROR_TEXT[code])
        }

        rec.onend = function () {
          if (session.stopping) return
          // A continuous recognition still ends after silence: restart it so the
          // recording keeps running until the user clicks stop.
          try {
            rec.start()
          } catch (error) {
            console.error('voice-input: restart failed', error)
            release(session)
            setPhase('error')
            setNotice('录音已中断，识别出的文字已保留在输入框中。')
          }
        }

        active.current = session
        setPhase('recording')
        setNotice('')
        try {
          rec.start()
        } catch (error) {
          console.error('voice-input: start failed', error)
          release(session)
          setPhase('error')
          setNotice('麦克风启动失败：' + String(error && error.message ? error.message : error))
        }
      }

      React.useEffect(function () {
        return function () {
          var session = active.current
          if (session === null) return
          release(session)
        }
      }, [])

      var unsupported = Recognition === undefined
      var disabled = actions === undefined || unsupported
      var label = unsupported
        ? '当前浏览器不支持语音识别，请使用 Chrome 或 Edge'
        : phase === 'recording' ? '停止录音' : '开始语音输入'

      return React.createElement('button', {
        type: 'button',
        className: 'dshv-mic',
        'data-phase': phase,
        'data-dsh-voice-input': '',
        'aria-label': label,
        'aria-pressed': phase === 'recording',
        disabled: disabled,
        title: notice === '' ? label : notice,
        // Suppress focus stealing at mousedown so the textarea keeps the caret.
        onMouseDown: function (event) { event.preventDefault() },
        onClick: function () {
          if (phase === 'recording') stop()
          else start()
        },
      }, phase === 'recording' ? STOP_ICON : MIC_ICON)
    }

    /** Services this plugin cannot run without: the slot registry. */
    exports.inject = ['slots']

    /** Display name for client diagnostics. */
    exports.name = 'voice-input'

    /**
     * Client plugin body: seat the mic button in the composer tool row.
     * @param ctx - client root context (carries the declared `slots` service).
     */
    exports.apply = function apply(ctx) {
      // inject() waits for the seat's declaration, re-runs it if the owner
      // remounts, and drops the registration with this plugin's fiber. A bare
      // register() into an undeclared slot would throw instead.
      ctx.slots.inject('conversation.input.right', function () {
        return ctx.slots.register(
          { name: 'conversation.input.right', id: 'voice-input', order: 0 },
          VoiceInputButton,
        )
      })
    }

    return module.exports
  },
})
