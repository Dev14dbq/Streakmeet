const { TextDecoder, TextEncoder } = require('node:util')

globalThis.TextEncoder = TextEncoder
globalThis.TextDecoder = TextDecoder

const tf = require('@tensorflow/tfjs')
require('@tensorflow/tfjs-backend-cpu')

let initPromise = tf.setBackend('cpu').then(() => tf.ready())

const shim = new Proxy(tf, {
  get(target, prop) {
    if (prop === 'ready') {
      return () => initPromise.then(() => target.ready())
    }
    if (prop === 'setBackend') {
      return async (...args) => {
        const result = await target.setBackend(...args)
        initPromise = target.ready()
        return result
      }
    }
    return target[prop]
  },
})

module.exports = shim
