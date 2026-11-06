import {
  MERMAID_SOURCE_LIMIT,
  type MermaidPageMessage,
  type MermaidPageRequest,
} from '@cherrystudio/mermaid-webview/protocol';

export type MermaidRenderResult =
  | { status: 'rendered'; svg: string; width: number; height: number }
  | { status: 'failed' };

/** The mounted renderer page, as seen by the queue. */
export type MermaidRendererPage = {
  send(request: MermaidPageRequest): void;
  /** Replaces the page with a fresh one, ending any work it was doing. */
  reset(): void;
};

const FAILED: MermaidRenderResult = { status: 'failed' };
const PAGE_READY_TIMEOUT_MS = 10_000;
const RENDER_TIMEOUT_MS = 10_000;
const PAGE_IDLE_MS = 60_000;
const CACHE_ENTRIES = 48;
const CACHE_SVG_LENGTH = 8 * 1024 * 1024;

type Job = { key: string; request: MermaidPageRequest; resolve(result: MermaidRenderResult): void };

/**
 * Serializes Mermaid renders through one hidden page and caches each result by source and theme.
 * A page that crashes or stops answering fails its current diagram and is replaced, so a source
 * that breaks the renderer is reported once instead of retried.
 */
export class MermaidRenderer {
  private readonly cache = new Map<string, MermaidRenderResult>();
  private cachedSvgLength = 0;
  private readonly pending = new Map<string, Promise<MermaidRenderResult>>();
  private readonly queue: Job[] = [];
  private readonly listeners = new Set<() => void>();
  private current: { job: Job; timer: ReturnType<typeof setTimeout> } | undefined;
  private page: MermaidRendererPage | undefined;
  private pageReady = false;
  private active = false;
  private readyTimer: ReturnType<typeof setTimeout> | undefined;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private nextId = 1;

  /** A cached result, read synchronously so remounted diagrams keep their size. */
  peek(source: string, dark: boolean): MermaidRenderResult | undefined {
    return source.length > MERMAID_SOURCE_LIMIT ? FAILED : this.cache.get(cacheKey(source, dark));
  }

  render(source: string, dark: boolean): Promise<MermaidRenderResult> {
    if (source.length > MERMAID_SOURCE_LIMIT) return Promise.resolve(FAILED);
    const key = cacheKey(source, dark);
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return Promise.resolve(cached);
    }
    const pending = this.pending.get(key);
    if (pending) return pending;

    const result = new Promise<MermaidRenderResult>((resolve) => {
      this.queue.push({ key, request: { id: this.nextId++, source, dark }, resolve });
    });
    this.pending.set(key, result);
    this.activate();
    this.pump();
    return result;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Whether the hidden page should stay mounted. */
  isActive = (): boolean => this.active;

  attach(page: MermaidRendererPage): void {
    this.page = page;
    this.pageReady = false;
    if (this.active) this.waitForPage();
  }

  detach(page: MermaidRendererPage): void {
    if (this.page !== page) return;
    this.page = undefined;
    this.pageReady = false;
    // An unmounted page cannot answer; its diagram waits for the next page.
    if (this.current) {
      clearTimeout(this.current.timer);
      this.queue.unshift(this.current.job);
      this.current = undefined;
    }
    if (this.active) this.waitForPage();
  }

  receive(page: MermaidRendererPage, message: MermaidPageMessage): void {
    if (this.page !== page) return;
    if (message.type === 'ready') {
      clearTimeout(this.readyTimer);
      this.readyTimer = undefined;
      this.pageReady = true;
      this.pump();
      return;
    }
    if (message.id !== this.current?.job.request.id) return;
    const { job, timer } = this.current;
    clearTimeout(timer);
    this.current = undefined;
    this.settle(
      job,
      message.type === 'rendered'
        ? { status: 'rendered', svg: message.svg, width: message.width, height: message.height }
        : FAILED,
    );
    this.pump();
  }

  /** The page crashed, failed to load, or stopped answering. */
  fail(page: MermaidRendererPage): void {
    if (this.page !== page) return;
    // Initialization failures belong to the page, not a particular diagram. Stop the
    // whole batch instead of repeatedly replacing a page that never became ready.
    if (!this.pageReady) {
      this.unavailable();
      return;
    }
    this.page = undefined;
    this.pageReady = false;
    this.waitForPage();
    this.failCurrent();
    page.reset();
  }

  /** The page cannot be loaded; queued diagrams keep their code blocks until the next request. */
  unavailable(): void {
    clearTimeout(this.readyTimer);
    this.readyTimer = undefined;
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    this.page = undefined;
    this.pageReady = false;
    this.active = false;
    for (const job of this.queue.splice(0)) this.settle(job, FAILED);
    this.failCurrent();
    this.notify();
  }

  private failCurrent(): void {
    if (!this.current) return;
    const { job, timer } = this.current;
    clearTimeout(timer);
    this.current = undefined;
    this.settle(job, FAILED);
  }

  private pump(): void {
    if (!this.page || !this.pageReady || this.current) return;
    const job = this.queue.shift();
    if (!job) {
      this.scheduleIdle();
      return;
    }
    const page = this.page;
    this.current = { job, timer: setTimeout(() => this.fail(page), RENDER_TIMEOUT_MS) };
    page.send(job.request);
  }

  private settle(job: Job, result: MermaidRenderResult): void {
    this.pending.delete(job.key);
    this.store(job.key, result);
    job.resolve(result);
    this.notify();
  }

  private store(key: string, result: MermaidRenderResult): void {
    this.cache.set(key, result);
    this.cachedSvgLength += svgLength(result);
    for (const [oldest, value] of this.cache) {
      if (this.cache.size <= CACHE_ENTRIES && this.cachedSvgLength <= CACHE_SVG_LENGTH) break;
      if (oldest === key) break;
      this.cache.delete(oldest);
      this.cachedSvgLength -= svgLength(value);
    }
  }

  private activate(): void {
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    if (!this.pageReady) this.waitForPage();
    if (this.active) return;
    this.active = true;
    this.notify();
  }

  private waitForPage(): void {
    // Start before the host reads its HTML asset, and keep the deadline across mounts
    // and additional requests. Only ready or a terminal failure ends this wait.
    if (this.readyTimer) return;
    this.readyTimer = setTimeout(() => this.unavailable(), PAGE_READY_TIMEOUT_MS);
  }

  private scheduleIdle(): void {
    if (!this.active || this.idleTimer || this.queue.length || this.current) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      if (this.queue.length || this.current) return;
      this.active = false;
      this.notify();
    }, PAGE_IDLE_MS);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

function cacheKey(source: string, dark: boolean): string {
  return `${dark ? 'dark' : 'light'}\n${source}`;
}

function svgLength(result: MermaidRenderResult): number {
  return result.status === 'rendered' ? result.svg.length : 0;
}

export const mermaidRenderer = new MermaidRenderer();
