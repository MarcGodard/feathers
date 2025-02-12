/* eslint-disable @typescript-eslint/ban-ts-comment */
import { convert } from '@feathersjs/errors'
import { createDebug } from '@feathersjs/commons'
import { Id, NullableId, Params, ServiceInterface } from '@feathersjs/feathers'

const debug = createDebug('@feathersjs/transport-commons/client')

const namespacedEmitterMethods = [
  'addListener',
  'addEventListener',
  'emit',
  'listenerCount',
  'listeners',
  'on',
  'once',
  'prependListener',
  'prependOnceListener',
  'removeAllListeners',
  'removeEventListener',
  'removeListener'
]
const otherEmitterMethods = ['eventNames', 'getMaxListeners', 'setMaxListeners']

const addEmitterMethods = (service: any) => {
  otherEmitterMethods.forEach((method) => {
    service[method] = function (...args: any[]) {
      if (typeof this.connection[method] !== 'function') {
        throw new Error(`Can not call '${method}' on the client service connection`)
      }

      return this.connection[method](...args)
    }
  })

  // Methods that should add the namespace (service path)
  namespacedEmitterMethods.forEach((method) => {
    service[method] = function (name: string, ...args: any[]) {
      if (typeof this.connection[method] !== 'function') {
        throw new Error(`Can not call '${method}' on the client service connection`)
      }

      const eventName = `${this.path} ${name}`

      debug(`Calling emitter method ${method} with ` + `namespaced event '${eventName}'`)

      const result = this.connection[method](eventName, ...args)

      return result === this.connection ? this : result
    }
  })
}

interface ServiceOptions {
  name: string
  connection: any
  method: string
  events?: string[]
}

export type SocketService<T = any, D = Partial<any>, P extends Params = Params> = Service<T, D, P>

export class Service<T = any, D = Partial<T>, P extends Params = Params>
  implements ServiceInterface<T, D, P>
{
  events: string[]
  path: string
  connection: any
  method: string

  constructor(options: ServiceOptions) {
    this.events = options.events
    this.path = options.name
    this.connection = options.connection
    this.method = options.method

    addEmitterMethods(this)
  }

  send<X = any>(method: string, ...args: any[]) {
    return new Promise<X>((resolve, reject) => {
      args.unshift(method, this.path)
      args.push(function (error: any, data: any) {
        return error ? reject(convert(error)) : resolve(data)
      })

      debug(`Sending socket.${this.method}`, args)

      this.connection[this.method](...args)
    })
  }

  methods(this: any, ...names: string[]) {
    names.forEach((method) => {
      const _method = `_${method}`
      this[_method] = function (data: any, params: Params = {}) {
        return this.send(method, data, params.query || {})
      }
      this[method] = function (data: any, params: Params = {}) {
        return this[_method](data, params)
      }
    })
    return this
  }

  _find(params: Params = {}) {
    return this.send<T | T[]>('find', params.query || {})
  }

  find(params: Params = {}) {
    return this._find(params)
  }

  _get(id: Id, params: Params = {}) {
    return this.send<T>('get', id, params.query || {})
  }

  get(id: Id, params: Params = {}) {
    return this._get(id, params)
  }

  _create(data: D, params: Params = {}) {
    return this.send<T>('create', data, params.query || {})
  }

  create(data: D, params: Params = {}) {
    return this._create(data, params)
  }

  _update(id: NullableId, data: D, params: Params = {}) {
    if (typeof id === 'undefined') {
      return Promise.reject(new Error("id for 'update' can not be undefined"))
    }
    return this.send<T>('update', id, data, params.query || {})
  }

  update(id: NullableId, data: D, params: Params = {}) {
    return this._update(id, data, params)
  }

  _patch(id: NullableId, data: D, params: Params = {}) {
    return this.send<T | T[]>('patch', id, data, params.query || {})
  }

  patch(id: NullableId, data: D, params: Params = {}) {
    return this._patch(id, data, params)
  }

  _remove(id: NullableId, params: Params = {}) {
    return this.send<T | T[]>('remove', id, params.query || {})
  }

  remove(id: NullableId, params: Params = {}) {
    return this._remove(id, params)
  }

  // `off` is actually not part of the Node event emitter spec
  // but we are adding it since everybody is expecting it because
  // of the emitter-component Socket.io is using
  off(name: string, ...args: any[]) {
    if (typeof this.connection.off === 'function') {
      const result = this.connection.off(`${this.path} ${name}`, ...args)

      return result === this.connection ? this : result
    } else if (args.length === 0) {
      // @ts-ignore
      return this.removeAllListeners(name)
    }

    // @ts-ignore
    return this.removeListener(name, ...args)
  }
}
