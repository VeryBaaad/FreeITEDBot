;(() => {
  /**
   * @typedef {object} TurnstileOptions
   * @property {string} sitekey
   * @property {string} theme
   * @property {(token: string) => void} [callback]
   * @property {() => void} [error-callback]
   * @property {() => void} [expired-callback]
   */

  /**
   * @typedef {object} Turnstile
   * @property {(f: Function) => void} ready
   * @property {(id: string, options: TurnstileOptions} render
   * @property {(id: string?) => void} getResponse
   */

  /**
   * @typedef {object} ValidateResponse
   * @property {boolean} ok
   * @property {string} [message]
   * @property {string} [challenge_code]
   * @property {string} [turnstile_site_key]
   * @property {string} [cap_site_key]
   */

  /**
   * @typedef {object} SubmitResponse
   * @property {boolean} ok
   * @property {string} [message]
   */

  /**
   * @typedef {object} BottomButton
   * @property {string} type
   * @property {string} text
   * @property {string} color
   * @property {string} textColor
   * @property {boolean} isVisible
   * @property {boolean} isActive
   * @property {boolean} hasShineEffect
   * @property {string} position
   * @property {boolean} isProgressVisible
   * @property {(text: string) => BottomButton} setText
   * @property {(callback: () => void) => BottomButton} onClick
   * @property {(callback: () => void) => BottomButton} offClick
   * @property {() => BottomButton} show
   * @property {() => BottomButton} hide
   * @property {() => BottomButton} enable
   * @property {() => BottomButton} disable
   * @property {(leaveAction: boolean) => BottomButton} showProgress
   * @property {() => BottomButton} hideProgress
   */

  /**
   * @typedef {object} WebAppObj
   * @property {string} initData
   * @property {string} colorScheme
   * @property {string} version
   * @property {string} platform
   * @property {BottomButton} MainButton
   * @property {BottomButton} SecondaryButton
   * @property {(string) => boolean} isVersionAtLeast
   * @property {(message: string, callback: () => void) => void} showAlert
   * @property {(message: string, callback: (ok: boolean) => void) => void} showConfirm
   * @property {() => void} ready
   * @property {() => void} expand
   * @property {() => void} close
   */

  /**
   * @typedef {object} TelegramObj
   * @property {WebAppObj} WebApp
   */

  /**
   * @typedef {object} CustomWindowObj
   * @property {TelegramObj} Telegram
   * @property {Turnstile} turnstile
   */

  /**
   * @typedef {Window & CustomWindowObj} CustomWindow
   */

  /**
   * @typedef {Window & Turnstile} turnstile
   */

  /** @type CustomWindow */
  const w = window
  const webapp = w.Telegram.WebApp
  const cap = w.Cap

  /** @type {string} */
  let capToken = ""

  const isRoot = document.location.pathname == "/"

  const checkUsername = (/** @type string */ username) => {
    return /^(?:[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}|[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*(_[a-zA-Z0-9]+))$/i.test(
      username
    )
  }

  const checkSignature = (/** @type string */ signature) => {
    return /^-----BEGIN SSH SIGNATURE-----[\s\S]*-----END SSH SIGNATURE-----$/.test(
      signature
    )
  }

  const getUsername = () => {
    return document.getElementById('username').value.trim()
  }

  const getSignature = () => {
    return document.getElementById('signature').value.trim()
  }

  const enableInput = (/** @type {boolean} */ enabled) => {
    const username = document.getElementById('username')
    const signature = document.getElementById('signature')
    username.disabled = !enabled
    signature.disabled = !enabled
  }

  const setupCap = (/** @type {string} */ siteKey) => {
    if (cap == undefined) {
      showAlert("Failed to load Cap\nCap 加载失败")
      setTimeout(() => {
        webapp.close()
      }, 10000)
      return
    }

    const setupCapInternal = (/** @type {string} */ siteKey) => {
      const el = document.createElement("cap-widget")
      document.getElementById("cap").replaceChildren(el)
      const c = new cap({
        apiEndpoint: `https://cap.baaad.xyz/${siteKey}/`
      }, el)
      c.addEventListener("solve", (event) => {
        capToken = event.detail.token
        if (isRoot)
          webapp.MainButton.enable()
        else
          onSubmit()
      });
      // c.addEventListener("progress", (event) => {
      //   console.log(`Solving... ${event.detail.progress}% done`);
      // });
      c.addEventListener("error", (event) => {
        if (isRoot)
          webapp.MainButton.disable()
      });
      c.addEventListener("reset", (event) => {
        if (isRoot)
          webapp.MainButton.disable()
      });
      window.setTimeout(() => { c.solve() }, 15000)
    }

    setupCapInternal(siteKey)
  }


  const onSubmitted = (/** @type {SubmitResponse} */ data) => {
    if (data.ok) {
      if (isRoot) {
        showAlert("Approved!\n申请通过!", () => {
          webapp.close()
        })
      } else {
        webapp.close()
      }
      return
    }
    showAlert(data.message)
    setTimeout(() => {
      webapp.close()
    }, 10000)
  }

  const onSubmit = () => {
    hideAlert()
    if (capToken == "") {
      showAlert('Please complete Cap verification\n请完成 Cap 验证')
      return
    }
    const body = {
      /** @type {?string} */ username: null,
      /** @type {?string} */ signature: null,
      token: capToken
    }
    if (isRoot) {
      const username = getUsername()
      const signature = getSignature()
      if (!checkUsername(username)) {
        showAlert('Invalid username\n用户名无效')
        return
      }
      if (!checkSignature(signature)) {
        showAlert('Invalid signature\n签名无效')
        return
      }
      body.username = username
      body.signature = signature
    }
    webapp.MainButton.disable().showProgress()
    fetch('/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth': webapp.initData
      },
      body: JSON.stringify(body)
    })
      .then(resp => {
        if (
          resp.ok &&
          resp.headers.get('Content-Type') === 'application/json'
        ) {
          return resp.json()
        }
        throw new Error('Failed to submit')
      })
      .then(data => {
        onSubmitted(data)
      })
      .catch(err => {
        showAlert(err.message)
      })
  }

  const setupMainButton = () => {
    webapp.MainButton.setText('Submit')
      .onClick(() => {
        webapp.showConfirm('Are you sure?\n确定?', ok => {
          if (ok) {
            onSubmit()
          }
        })
      })
      .hide()
      .showProgress(false)
      .disable()
  }

  const displayLoading = (/** @type boolean */ display) => {
    const overlay = document.getElementById('loading-overlay')
    if (display) {
      overlay.classList.remove('hide')
      return
    }
    overlay.classList.add('hide')
  }

  const showAlertCompat = (
    /** @type string */ message,
    /** @type {() => void} */ callback
  ) => {
    /** @type HTMLElement */
    const el = document.getElementsByClassName('alert').item(0)
    el.innerHTML = ''

    const splits = message.split('\n')
    for (const split of splits) {
      const p = document.createElement('p')
      p.innerText = split
      el.appendChild(p)
    }

    el.classList.add('show')
    callback ? setTimeout(() => {
      callback()
    }, 10000) : null
  }

  const showAlert = (
    /** @type {string} */ msg,
    /** @type {() => void} */ callback
  ) => {
    if (!webapp.isVersionAtLeast('6.2')) {
      showAlertCompat(msg, callback)
      return
    }
    webapp.showAlert(msg, callback)
  }

  const hideAlert = () => {
    const el = document.getElementsByClassName('alert').item(0)
    el.classList.remove('show')
  }

  const onAuthValid = (/** @type ValidateResponse */ data) => {
    setupCap(data.cap_site_key)
    displayLoading(false)

    if (isRoot) {
      ;[...document.getElementsByClassName('challenge-code')].forEach(
        /** @type HTMLSpanElement */ el => {
          el.innerText = data.challenge_code
          el.classList.add('unblur-challenge-code')
        }
      )
      enableInput(true)
      setupCopy()
      webapp.MainButton.disable().hideProgress().show()
      webapp.expand()
    }
  }

  const onAuthInvalid = (/** @type ValidateResponse */ data) => {
    showAlert(data.message, () => {
      webapp.close()
    })
    displayLoading(false)
    webapp.MainButton.hide()
  }

  const onValidateResponse = (/** @type ValidateResponse */ data) => {
    if (data.ok) {
      onAuthValid(data)
    } else {
      onAuthInvalid(data)
    }
  }

  const onLoad = () => {
    webapp.ready()
    setupMainButton()

    if (!webapp.initData) {
      return
    }

    fetch('/validate', {
      headers: {
        'X-Auth': webapp.initData
      }
    })
      .then(resp => {
        if (
          resp.ok &&
          resp.headers.get('Content-Type') === 'application/json'
        ) {
          return resp.json()
        }
        throw new Error('Failed to validate\n验证失败')
      })
      .then((/** @type ValidateResponse */ data) => {
        onValidateResponse(data)
      })
      .catch(err => {
        displayLoading(false)
        showAlert(err.message, () => {
          webapp.close()
        })
      })
  }

  const setupCopy = () => {
    ;[...document.getElementsByClassName('command-copy')].forEach(el => {
      el.addEventListener('click', () => {
        navigator.clipboard.writeText(el.innerText.trim())
      })
    })
  }

  document.addEventListener("DOMContentLoaded", () => {
    onLoad()
  })
})()
