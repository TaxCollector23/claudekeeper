import { EventEmitter } from 'node:events';
import type { KeeperEvent } from '../shared/types.js';

type Listener = (event: KeeperEvent) => void;

export class EventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  emit(event: KeeperEvent): void {
    this.emitter.emit('event', event);
  }

  subscribe(listener: Listener): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }
}
