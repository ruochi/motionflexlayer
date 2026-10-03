import { createContext, type ReactNode } from 'react'
import Reconciler from 'react-reconciler'
import { ConcurrentRoot, DefaultEventPriority } from 'react-reconciler/constants.js'
import { h, type FvgChild, type FvgNode } from '@dc/flexlayer'
import { css, type StyleObject } from '../nodes.js'

type Instance = { kind: 'el'; tag: string; props: Record<string, unknown>; children: Node[] }
type TextInstance = { kind: 'text'; text: string }
type Node = Instance | TextInstance
type Container = { children: Node[] }

/** 原样插入一个 FvgNode（或一组）。核心里的函数式原语在 React 里用它桥接。 */
export const RAW_TAG = 'mfl-raw'

const SKIP = new Set(['children', 'key', 'ref'])

function toAttrs(tag: string, props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    if (SKIP.has(k) || v == null || v === false) continue
    if (k === 'draw') {
      if (typeof v !== 'function') throw new Error(`<${tag}> 的 draw 必须是函数 (ctx, el) => void`)
      out.draw = v
      continue
    }
    if (typeof v === 'function') throw new Error(`<${tag}> 的属性 ${k} 是函数。视频没有交互，事件回调不会被调用；只有 draw 可以是函数`)
    if (k === 'style' && typeof v === 'object') {
      out.style = css(v as StyleObject)
      continue
    }
    out[k] = v === true ? 'true' : v
  }
  return out
}

function toFvg(node: Node, into: FvgChild[]): void {
  if (node.kind === 'text') {
    into.push(node.text)
    return
  }
  if (node.tag === RAW_TAG) {
    const raw = node.props.node as FvgChild | FvgChild[] | null | undefined
    if (raw == null) return
    for (const r of Array.isArray(raw) ? raw : [raw]) if (r != null) into.push(r)
    return
  }
  const kids: FvgChild[] = []
  for (const c of node.children) toFvg(c, kids)
  into.push(h(node.tag, toAttrs(node.tag, node.props) as Parameters<typeof h>[1], ...kids))
}

const remove = (list: Node[], child: Node) => {
  const i = list.indexOf(child)
  if (i >= 0) list.splice(i, 1)
}

const insert = (list: Node[], child: Node, before: Node) => {
  remove(list, child)
  const i = list.indexOf(before)
  list.splice(i < 0 ? list.length : i, 0, child)
}

let currentPriority: number = DefaultEventPriority
const noop = () => null

const hostConfig: Record<string, unknown> = {
  rendererPackageName: 'motionflexlayer',
  rendererVersion: '0.1.0',
  extraDevToolsConfig: null,
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  supportsMicrotasks: true,
  supportsResources: false,
  supportsSingletons: false,
  supportsTestSelectors: false,
  isPrimaryRenderer: false,
  warnsIfNotActing: false,
  noTimeout: -1,
  NotPendingTransition: null,
  HostTransitionContext: createContext(null),

  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  scheduleMicrotask: queueMicrotask,

  createInstance: (tag: string, props: Record<string, unknown>): Instance => ({ kind: 'el', tag, props, children: [] }),
  createTextInstance: (text: string): TextInstance => ({ kind: 'text', text }),
  appendInitialChild: (p: Instance, c: Node) => void p.children.push(c),
  appendChild: (p: Instance, c: Node) => {
    remove(p.children, c)
    p.children.push(c)
  },
  appendChildToContainer: (p: Container, c: Node) => {
    remove(p.children, c)
    p.children.push(c)
  },
  insertBefore: (p: Instance, c: Node, b: Node) => insert(p.children, c, b),
  insertInContainerBefore: (p: Container, c: Node, b: Node) => insert(p.children, c, b),
  removeChild: (p: Instance, c: Node) => remove(p.children, c),
  removeChildFromContainer: (p: Container, c: Node) => remove(p.children, c),
  clearContainer: (p: Container) => void (p.children.length = 0),
  commitUpdate: (inst: Instance, _type: string, _old: unknown, next: Record<string, unknown>) => void (inst.props = next),
  commitTextUpdate: (inst: TextInstance, _old: string, next: string) => void (inst.text = next),
  finalizeInitialChildren: () => false,
  shouldSetTextContent: () => false,
  getRootHostContext: () => ({}),
  getChildHostContext: (parent: unknown) => parent,
  getPublicInstance: (inst: unknown) => inst,
  prepareForCommit: noop,
  resetAfterCommit: noop,
  preparePortalMount: noop,

  setCurrentUpdatePriority: (p: number) => void (currentPriority = p),
  getCurrentUpdatePriority: () => currentPriority,
  resolveUpdatePriority: () => currentPriority || DefaultEventPriority,
  resolveEventType: () => null,
  resolveEventTimeStamp: () => -1.1,
  shouldAttemptEagerTransition: () => false,
  maySuspendCommit: () => false,
  maySuspendCommitOnUpdate: () => false,
  maySuspendCommitInSyncRender: () => false,
  preloadInstance: () => true,
  waitForCommitToBeReady: () => null,
  getSuspendedCommitReason: () => null,
  bindToConsole: (method: keyof Console, args: unknown[]) => (console[method] as (...a: unknown[]) => void).bind(console, ...args),
}

/** 没列出来的宿主方法（视图过渡、hydration、资源……）在这里都用不到，一律空实现。 */
const config = new Proxy(hostConfig, {
  get: (target, key: string) => (key in target ? target[key] : noop),
})

/** react-reconciler 0.34 的同步 API。@types/react-reconciler 还停在 0.32，这里自己声明。 */
type SyncReconciler = {
  createContainer(...args: unknown[]): unknown
  updateContainerSync(element: ReactNode, root: unknown, parent: null, callback: null): void
  flushSyncWork(): void
}

const reconciler = Reconciler(config as never) as unknown as SyncReconciler

/**
 * 同步渲染一棵 React 树，返回 flexlayer 节点。每次调用都挂一个全新的 root、渲染完立即卸载：
 * hooks 和 context 都是真的，但帧与帧之间没有残留状态，多进程乱序渲染结果一致。
 */
export function renderToFvg(element: ReactNode): FvgChild[] {
  const container: Container = { children: [] }
  const errors: unknown[] = []
  const onError = (err: unknown) => void errors.push(err)
  const root = reconciler.createContainer(
    container,
    ConcurrentRoot,
    null,
    false,
    null,
    'mfl',
    onError,
    onError,
    onError,
    null,
  )
  reconciler.updateContainerSync(element, root, null, null)
  reconciler.flushSyncWork()
  if (errors.length) {
    reconciler.updateContainerSync(null, root, null, null)
    reconciler.flushSyncWork()
    throw errors[0]
  }
  const out: FvgChild[] = []
  for (const c of container.children) toFvg(c, out)
  reconciler.updateContainerSync(null, root, null, null)
  reconciler.flushSyncWork()
  return out
}

export type { FvgNode }
