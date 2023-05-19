import { Hook, HookConfig } from './hook'
import Context from './context'
import { Database } from './database'
import HooksRegistry from './hooks-registry'
import Manifest from './manifest'
import Method from './method'
import { createRouter } from 'radix3'

type Handle = (ctx: Context) => Promise<Context>

interface Service {
  handle: Handle
  register: (app: App, install: (subpath: string) => void) => void
}

type Hooks = {
  after: Record<`${Method}`, [Hook, HookConfig?][]>
  before: Record<`${Method}`, [Hook, HookConfig?][]>
}

class Pipeline {
  private app: App
  private service: Service
  private hooks: Hooks = Pipeline.stubHooks()

  constructor(app: App, service: Service) {
    this.app = app
    this.service = service
  }

  async run(ctx: Context): Promise<Context> {
    // run app before hooks

    for (const [hook, config] of this.hooks.before[ctx.method]) {
      try {
        ctx = await hook.run(ctx, config, this.app)

        if (ctx.result) {
          break
        }
      } catch (err) {
        // TODO: deal with error
      }
    }

    if (!ctx.result) {
      ctx = await this.service.handle(ctx)
    }

    // run service after hooks
    for (const [hook, config] of this.hooks.after[ctx.method]) {
      try {
        ctx = await hook.run(ctx, config, this.app)
      } catch (err) {
        // TODO: deal with error
      }
    }

    // run app after hooks

    return ctx
  }

  after(method: Method, hook: Hook, config?: HookConfig): Pipeline {
    this.hooks.after[method].push([hook, config])
    return this
  }

  before(method: Method, hook: Hook, config?: HookConfig): Pipeline {
    this.hooks.before[method].push([hook, config])
    return this
  }

  static stubHooks(): Hooks {
    return {
      after: {
        create: [],
        find: [],
        get: [],
        patch: [],
        remove: [],
      },
      before: {
        create: [],
        find: [],
        get: [],
        patch: [],
        remove: [],
      },
    }
  }
}

class AnonymouseService implements Service {
  handle: Handle

  constructor(handle: Handle) {
    this.handle = handle
  }

  register(app: App, install: (subpath: string) => void) {
    install('')
  }
}

interface Options {
  database: Database
}

class App {
  private routes = createRouter()
  database: Database
  manifest: Manifest
  hooksRegistry: HooksRegistry

  constructor(options: Options) {
    this.database = options.database
    this.manifest = new Manifest()
    this.hooksRegistry = new HooksRegistry()
  }

  use(path: string, handle: Handle): Pipeline
  use(path: string, service: Service): Pipeline
  use(path: string, handleOrService: Service | Handle): Pipeline {
    const service: Service =
      typeof handleOrService === 'function'
        ? new AnonymouseService(handleOrService)
        : handleOrService

    const pipeline = new Pipeline(this, service)
    service.register(this, (subpath) =>
      this.register(`${path}/${subpath}`, pipeline)
    )

    return pipeline
  }

  private register(path: string, pipeline: Pipeline) {
    this.routes.insert(path, pipeline)
  }
}

export default App
export { Pipeline }
export type { Handle, Service }