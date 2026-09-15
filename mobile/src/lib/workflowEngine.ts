import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { geofenceEventBus } from './geofenceEventBus';
import type { GeofenceEvent, WorkflowDefinition } from '../types';

const STORAGE_KEY = 'veda_workflows';

const BUILT_IN_WORKFLOWS: WorkflowDefinition[] = [
  {
    id: 'sys_home_arrive',
    trigger: { event: 'GEOFENCE_ENTER', geofenceType: 'home' },
    actions: [{ kind: 'notify', title: 'Welcome home', body: "You're back. Veda has noted your arrival." }],
    enabled: true,
  },
  {
    id: 'sys_work_arrive',
    trigger: { event: 'GEOFENCE_ENTER', geofenceType: 'work' },
    actions: [{ kind: 'notify', title: 'At work', body: "Veda noted you've arrived at work." }],
    enabled: true,
  },
];

class WorkflowEngine {
  private _unsubscribe: (() => void) | null = null;

  start(): void {
    if (this._unsubscribe) return;
    this._unsubscribe = geofenceEventBus.subscribe((event) => {
      this._evaluate(event).catch((err) => {
        if (__DEV__) console.warn('[WorkflowEngine] evaluate error:', err);
      });
    });
  }

  stop(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }

  async addWorkflow(def: WorkflowDefinition): Promise<void> {
    const all = await this._loadCustom();
    all.push(def);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  async removeWorkflow(id: string): Promise<void> {
    const all = (await this._loadCustom()).filter((w) => w.id !== id);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  async evaluate(event: GeofenceEvent): Promise<void> {
    await this._evaluate(event);
  }

  private async _evaluate(event: GeofenceEvent): Promise<void> {
    const custom = await this._loadCustom();
    const all = [...BUILT_IN_WORKFLOWS, ...custom];
    const now = Date.now();
    const toRemove: string[] = [];

    for (const workflow of all) {
      if (!workflow.enabled) continue;
      if (workflow.expiresAt && new Date(workflow.expiresAt).getTime() < now) {
        toRemove.push(workflow.id);
        continue;
      }
      if (!this._matches(workflow, event)) continue;

      for (const action of workflow.actions) {
        await this._executeAction(action);
      }

      if (workflow.expiresAt) {
        toRemove.push(workflow.id);
      }
    }

    for (const id of toRemove) {
      await this.removeWorkflow(id);
    }
  }

  private _matches(workflow: WorkflowDefinition, event: GeofenceEvent): boolean {
    const { trigger } = workflow;
    if (trigger.event !== event.type) return false;
    if (trigger.geofenceId && trigger.geofenceId !== event.geofenceId) return false;
    if (trigger.geofenceType && trigger.geofenceType !== event.geofenceType) return false;
    return true;
  }

  private async _executeAction(action: WorkflowDefinition['actions'][number]): Promise<void> {
    if (action.kind === 'notify') {
      await Notifications.scheduleNotificationAsync({
        content: { title: action.title, body: action.body },
        trigger: null,
      }).catch(() => undefined);
    }
    // 'location_action' kind is handled by the chat layer, not here
  }

  private async _loadCustom(): Promise<WorkflowDefinition[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as WorkflowDefinition[]) : [];
    } catch {
      return [];
    }
  }
}

export const workflowEngine = new WorkflowEngine();
